-- Keep the original invoice payment and its confirmed refunds separately.
-- Existing table RLS/grants and the server-only snapshot writer remain unchanged.
alter table private.billing_payments
 add column refunded_amount bigint not null default 0 check(refunded_amount>=0 and refunded_amount<=amount_paid),
 add column refunds jsonb not null default '[]' check(jsonb_typeof(refunds)='array');

create or replace function private.queue_subscription_refunds(p_invoice jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p private.billing_payments; r jsonb; total bigint:=0; normalized jsonb:='[]'; ids text[]:='{}';
begin
 select * into p from private.billing_payments where provider_invoice_id=p_invoice->>'id' and mode=private.billing_environment() for update;
 if p.provider_invoice_id is null then raise exception 'unknown_refund_invoice';end if;
 -- Older snapshots that omit this field must not erase already confirmed refunds.
 if not p_invoice ? 'refunds' then return;end if;
 if jsonb_typeof(p_invoice->'refunds') is distinct from 'array' then raise exception 'invalid_refund_notice';end if;
 for r in select value from jsonb_array_elements(p_invoice->'refunds') loop
  if coalesce(r->>'id','') !~ '^re_[A-Za-z0-9]+$'
   or r->>'currency' is distinct from p.currency
   or coalesce(r->>'amount','') !~ '^[0-9]+$'
   or (r->>'id')=any(ids) then raise exception 'invalid_refund_notice';end if;
  if (r->>'amount')::numeric<=0 or (r->>'amount')::numeric>p.amount_paid then raise exception 'invalid_refund_notice';end if;
  total:=total+(r->>'amount')::bigint;
  if total>p.amount_paid then raise exception 'invalid_refund_notice';end if;
  ids:=array_append(ids,r->>'id');
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',r->>'id','amount',(r->>'amount')::bigint,'currency',p.currency));
 end loop;
 -- StripeBillingProvider supplies the complete, paginated list of succeeded refunds.
 update private.billing_payments set refunded_amount=total,refunds=normalized,updated_at=now()
 where provider_invoice_id=p.provider_invoice_id and (refunded_amount is distinct from total or refunds is distinct from normalized);
 for r in select value from jsonb_array_elements(normalized) loop
  perform private.enqueue_transactional_email('refund:'||p.mode||':'||(r->>'id'),p.professional_id,'subscription_refunded',jsonb_build_object('mode',p.mode,'amount_minor',(r->>'amount')::bigint,'currency',p.currency));
 end loop;
end $$;
revoke all on function private.queue_subscription_refunds(jsonb) from public,anon,authenticated,service_role;

-- Return only the total to the owner; refund identifiers stay server/admin-side.
do $$declare definition text; needle text:='provider_invoice_id,amount_due,amount_paid,currency,status,issued_at,paid_at,hosted_url';begin
 definition:=pg_get_functiondef('private.billing_summary(uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'refund_summary_patch_missing';end if;
 execute replace(definition,needle,'provider_invoice_id,amount_due,amount_paid,refunded_amount,currency,status,issued_at,paid_at,hosted_url');
end $$;
