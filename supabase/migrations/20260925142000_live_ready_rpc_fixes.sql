-- Public legal projections and acceptance writes cross the private schema only
-- through controlled SECURITY DEFINER functions. No private table grants are
-- opened to browser roles.
create or replace function public.legal_document(p_document_key text) returns jsonb
language sql security definer set search_path='' as $$
  select to_jsonb(d)
  from private.legal_documents d
  where d.key=p_document_key
$$;
revoke all on function public.legal_document(text) from public,authenticated,service_role;
grant execute on function public.legal_document(text) to anon,authenticated;

create or replace function public.record_legal_acceptance(p_document_key text,p_version integer,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();
begin
  if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_source not in ('onboarding','checkout','settings','admin') then raise exception 'invalid_input'; end if;
  if not exists(select 1 from private.legal_documents where key=p_document_key and version=p_version and review_status='approved') then raise exception 'legal_not_published'; end if;
  insert into private.legal_acceptances(professional_id,document_key,document_version,source)
  values(owner,p_document_key,p_version,p_source)
  on conflict do nothing;
  return jsonb_build_object('accepted',true,'document_key',p_document_key,'version',p_version);
end $$;
revoke all on function public.record_legal_acceptance(text,integer,text) from public,anon,service_role;
grant execute on function public.record_legal_acceptance(text,integer,text) to authenticated;

create or replace function private.transactional_email_audit_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare template_key text; suffix text; metadata jsonb:=coalesce(new.metadata,'{}');
begin
  if new.target_professional is null then return new; end if;
  template_key:=case
    when new.action='code_redeemed' then 'promotion_applied'
    when new.action='promotion_redeemed' then 'promotion_applied'
    when new.action='purchase_paid' then 'credits_purchased'
    when new.action='refund' then 'credits_refunded'
    when new.action='billing_grace_expired' then 'account_suspended'
    when new.action='billing_cancel_requested' then 'cancellation_scheduled'
    when new.action='billing_cancel_now_requested' then 'subscription_cancelled'
    when new.action='billing_subscription_synced' and metadata->>'state'='active' then 'payment_confirmed'
    when new.action='billing_subscription_synced' and metadata->>'state'='grace' then 'grace_started'
    when new.action='billing_subscription_synced' and metadata->>'state'='suspended' then 'account_suspended'
    when new.action='billing_subscription_synced' and metadata->>'state'='cancelled' then 'subscription_cancelled'
    else null end;
  if template_key is not null then
    suffix:=new.id::text||':'||template_key;
    perform private.enqueue_transactional_email('audit:'||suffix,new.target_professional,template_key,jsonb_build_object('audit_id',new.id,'action',new.action,'metadata',metadata));
  end if;
  return new;
end $$;
drop trigger if exists admin_audit_transactional_email on private.admin_audit;
create trigger admin_audit_transactional_email after insert on private.admin_audit for each row execute function private.transactional_email_audit_trigger();
revoke all on function private.transactional_email_audit_trigger() from public,anon,authenticated,service_role;
