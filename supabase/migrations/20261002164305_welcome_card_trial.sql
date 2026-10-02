begin;

-- Enabled only after the compatible Edge Function and UI are deployed.
alter table private.billing_settings add column welcome_trial_enabled boolean not null default false;
alter table private.billing_checkout_intents
 add column trial_days integer not null default 0 check(trial_days in (0,30)),
 add column trial_accepted_at timestamptz,
 add constraint welcome_trial_acceptance check ((trial_days=0 and trial_accepted_at is null) or (trial_days=30 and trial_accepted_at is not null));

-- First commercial access, once per account/environment. Abandoned checkouts do
-- not consume the offer; a verified subscription does, even after cancellation.
create function private.welcome_trial_eligible(p_owner uuid,p_mode text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select welcome_trial_enabled from private.billing_settings),false)
 and p_mode in ('test','live')
 and exists(select 1 from public.professional_profiles where id=p_owner)
 and not exists(select 1 from private.platform_admins where user_id=p_owner)
 and not exists(select 1 from private.professional_access where professional_id=p_owner
  and (source<>'billing' or coalesce(billing_mode,'test')=p_mode))
 and not exists(select 1 from private.access_grants where professional_id=p_owner)
 and not exists(select 1 from private.access_code_redemptions where professional_id=p_owner)
 and not exists(select 1 from private.billing_subscriptions where professional_id=p_owner and mode=p_mode)
$$;
revoke all on function private.welcome_trial_eligible(uuid,text) from public,anon,authenticated,service_role;

alter function private.billing_summary(uuid) rename to billing_summary_before_welcome_trial;
create function private.billing_summary(p_owner uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.billing_summary_before_welcome_trial(p_owner)||jsonb_build_object(
  'welcome_trial',jsonb_build_object('days',30,'eligible',private.welcome_trial_eligible(p_owner,private.billing_owner_environment(p_owner))))
$$;
revoke all on function private.billing_summary(uuid),private.billing_summary_before_welcome_trial(uuid) from public,anon,authenticated,service_role;

alter function private.public_plan_catalog() rename to public_plan_catalog_before_welcome_trial;
create function private.public_plan_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(p||jsonb_build_object('welcome_trial_days',
  case when (select welcome_trial_enabled from private.billing_settings) then 30 else 0 end)),'[]')
 from jsonb_array_elements(private.public_plan_catalog_before_welcome_trial()) p
$$;
revoke all on function private.public_plan_catalog(),private.public_plan_catalog_before_welcome_trial() from public,anon,authenticated,service_role;
grant execute on function private.public_plan_catalog() to anon,authenticated;

-- Extend the existing checkout transaction/lease instead of a second grant path.
do $$declare d text; old text; new text; begin
 d:=pg_get_functiondef('private.billing_subscription_before_retention(text,jsonb)'::regprocedure);
 old:=$old$  if i.id is null then
   if op is null then$old$;
 new:=$new$  if promo.id is null and private.welcome_trial_eligible(owner,private.billing_environment()) then
   if p_data->>'welcome_trial_consent' is distinct from 'true' then raise exception 'trial_consent_required'; end if;
   if i.id is not null and i.trial_days<>30 then raise exception 'checkout_pending'; end if;
  elsif p_data->>'welcome_trial_consent'='true' then raise exception 'trial_offer_changed';
  end if;
  if i.id is null then
   if op is null then$new$;
 if position(old in d)=0 then raise exception 'trial_checkout_patch_missing'; end if;
 d:=replace(d,old,new);
 old:=$old$  return jsonb_build_object('intent',to_jsonb(i),'price',private.billing_price_json(m.id),'customer_id',c.provider_customer_id);$old$;
 new:=$new$  if promo.id is null and private.welcome_trial_eligible(owner,private.billing_environment()) and i.trial_days=0 then
   update private.billing_checkout_intents set trial_days=30,trial_accepted_at=now()
    where id=i.id and mode=private.billing_environment() returning * into i;
  end if;
  return jsonb_build_object('intent',to_jsonb(i),'price',private.billing_price_json(m.id),'customer_id',c.provider_customer_id);$new$;
 if position(old in d)=0 then raise exception 'trial_intent_patch_missing'; end if;
 d:=replace(d,old,new); execute d;
end $$;

-- A zero-value trial invoice is not a paid period. A trial cancellation or
-- failed first payment must still update access through the verified webhook.
do $$declare d text; old text; begin
 d:=pg_get_functiondef('private.billing_apply(jsonb)'::regprocedure);
 old:=$old$ paid:=coalesce(paid,false);$old$;
 if position(old in d)=0 then raise exception 'trial_payment_patch_missing'; end if;
 d:=replace(d,old,$new$ paid:=coalesce(paid,false) and snap->>'status'<>'trial'
  and (snap->>'trial_end' is null or (latest->>'period_start')::timestamptz >= (snap->>'trial_end')::timestamptz);$new$);
 old:=$old$ if allow_write and (paid or s.paid_through is not null or state_value='trial') then$old$;
 -- Delimiters are deliberately independent of SQL quotation inside the fragment.
 if position(old in d)=0 then raise exception 'trial_access_patch_missing'; end if;
 d:=replace(d,old,$new$ if allow_write and (paid or s.paid_through is not null or state_value='trial' or old_s.state='trial') then$new$);
 execute d;
end $$;

-- Stripe anchors paid months at trial_end. Allocate ONE allowance over the
-- actual trial window (including February), then reuse paid-month allocation.
do $$declare d text; old text; begin
 d:=pg_get_functiondef('private.allocate_plan_month(uuid,timestamptz)'::regprocedure);
 old:=$old$ anchor:=coalesce(a.credit_anchor_at,a.starts_at) at time zone 'UTC';$old$;
 if position(old in d)=0 then raise exception 'trial_credits_patch_missing'; end if;
 d:=replace(d,old,$new$ if a.source='billing' and a.status='trial' then
  select period_start,period_end into start_time,end_time from private.billing_subscriptions
   where professional_id=p_owner and mode=coalesce(a.billing_mode,'test') and state='trial'
    and not manual_hold and period_start<=p_at and period_end>p_at order by created_at desc limit 1;
  if start_time is null then return '{"allocated":false,"reason":"no_trial_period"}'; end if;
 else
 anchor:=coalesce(a.credit_anchor_at,a.starts_at) at time zone 'UTC';$new$);
 old:=$old$ -- No mid-period top-up on upgrades, reactivation, retries or price changes.$old$;
 if position(old in d)=0 then raise exception 'trial_credits_end_patch_missing'; end if;
 d:=replace(d,old,E' end if;\n'||old); execute d;
end $$;

commit;
