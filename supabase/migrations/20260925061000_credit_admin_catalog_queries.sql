-- Distinct table aliases avoid ambiguity with the package row variable.
create or replace function private.ai_credit_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); p private.ai_credit_packages; pid uuid; result jsonb; before_data jsonb; begin
 if p_action='packages' then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select package_row.*,(select count(*) from private.ai_credit_purchases r where r.package_id=package_row.id and r.credited_at is not null) purchases,
  (select jsonb_agg(to_jsonb(m) order by created_at desc) from private.ai_credit_price_mappings m where m.package_id=package_row.id) mappings
  from private.ai_credit_packages package_row order by display_order,name)x),'[]'); end if;
 if p_action='purchases' then return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select r.id,r.professional_id,profile.full_name professional_name,r.package_snapshot->>'name' package_name,r.package_snapshot->>'code' package_code,
   r.credits_purchased,r.bonus_credits,r.amount,r.amount_paid,r.expected_amount,r.currency,r.status,r.refunded_amount,r.reversed_credits,r.review_reason,
   r.created_at,r.paid_at,r.credited_at,r.campaign_snapshot->>'code' promotion_code,r.provider,r.mode
  from private.ai_credit_purchases r join public.professional_profiles profile on profile.id=r.professional_id order by r.created_at desc limit 200)x),'[]'); end if;
 pid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 select * into p from private.ai_credit_packages where id=pid for update;
 if p_action='package' then if p.id is null then raise exception 'not_found'; end if; return to_jsonb(p); end if;
 if p_action='save_package' then
  if p.id is not null and p.version is distinct from (p_data->>'version')::integer then raise exception 'stale_revision'; end if;
  if (p_data->>'price_amount')::numeric<10 or (p_data->>'price_amount')::numeric is distinct from round((p_data->>'price_amount')::numeric,2) then raise exception 'invalid_package_price'; end if;
  if p.id is not null and p.code<>upper(btrim(p_data->>'code')) then raise exception 'code_immutable'; end if;
  before_data:=to_jsonb(p);
  insert into private.ai_credit_packages(id,code,name,description,credits,bonus_credits,price_amount,currency,active,internal_only,display_order)
   values(pid,upper(btrim(p_data->>'code')),btrim(p_data->>'name'),coalesce(p_data->>'description',''),(p_data->>'credits')::integer,coalesce((p_data->>'bonus_credits')::integer,0),(p_data->>'price_amount')::numeric,p_data->>'currency',coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'internal_only')::boolean,false),coalesce((p_data->>'display_order')::integer,0))
   on conflict(id) do update set name=excluded.name,description=excluded.description,credits=excluded.credits,bonus_credits=excluded.bonus_credits,price_amount=excluded.price_amount,currency=excluded.currency,active=excluded.active,internal_only=excluded.internal_only,display_order=excluded.display_order,version=private.ai_credit_packages.version+1,updated_at=now();
  select to_jsonb(x) into result from private.ai_credit_packages x where id=pid;
  perform private.billing_audit(case when p.id is null then 'credit_package_created' else 'credit_package_updated' end,null,pid,jsonb_build_object('before',before_data,'after',result),actor);
  return result;
 elsif p_action='disable_package' then
  if p.id is null then raise exception 'not_found'; end if;
  update private.ai_credit_packages set active=false,version=version+1,updated_at=now() where id=pid and active;
  if found then perform private.billing_audit('credit_package_disabled',null,pid,'{}',actor); end if;
  return '{"saved":true}';
 end if;
 raise exception 'invalid_action';
end $$;
