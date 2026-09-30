-- Respaldo is a private, single-use retention offer. Normal checkout cannot buy it.
alter table private.billing_subscriptions add column retention_ends_at timestamptz;
insert into private.plans(code,name,description,active,internal_only,monthly_price,annual_price,currency,billing_rank,credits_provisional)
values('respaldo','Respaldo','Hasta 5 pacientes elegidos. $149 MXN cada 30 días, durante un máximo de 90 días.',true,true,149,null,'MXN',1,false);
insert into private.plan_entitlements(plan_id,entitlement_key,value)
select p.id,c.key,case
 when c.key='patients.limit' then '5'::jsonb
 when c.key='consultations.monthly_limit' then '"unlimited"'::jsonb
 when c.key in ('patients','consultations','consultation_design','diet_workshop','diet_library','agenda','patient_superlink','exports') then 'true'::jsonb
 when c.value_type='boolean' then 'false'::jsonb else '0'::jsonb end
from private.plans p cross join private.entitlement_catalog c where p.code='respaldo';

create table private.billing_retention (
 professional_id uuid not null references public.professional_profiles(id),
 mode text not null check(mode in ('test','live')),
 subscription_id uuid not null references private.billing_subscriptions(id),
 operation_key uuid not null unique references private.billing_operations(operation_key),
 patient_ids uuid[] not null check(cardinality(patient_ids) between 0 and 5),
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(professional_id,mode),
 check((starts_at is null and ends_at is null) or ends_at=starts_at+interval '90 days')
);
create index billing_retention_subscription on private.billing_retention(subscription_id);
alter table private.billing_retention enable row level security;
create policy deny_direct on private.billing_retention to anon,authenticated using(false) with check(false);
revoke all on private.billing_retention from public,anon,authenticated,service_role;

create function private.retention_subscription(p_subscription uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id
 join private.plans p on p.id=m.plan_id left join private.plans pending on pending.id=s.pending_plan_id
 where s.id=p_subscription and (p.code='respaldo' or pending.code='respaldo'))
$$;
revoke all on function private.retention_subscription(uuid) from public,anon,authenticated,service_role;

-- The billing service sets this transaction flag only after validating the retention request.
do $$declare definition text; needle text:='where id=p_plan and active and not internal_only';begin
 definition:=pg_get_functiondef('private.billing_price(uuid,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'retention_price_patch_missing';end if;
 definition:=replace(definition,needle,'where id=p_plan and active and (not internal_only or (code=''respaldo'' and monthly_price=149 and currency=''MXN'' and p_interval=''monthly'' and current_setting(''nuthrick.retention_prepare'',true)=''true''))');
 execute definition;
end $$;
create or replace function private.billing_price_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m)||jsonb_build_object('plan_name',p.name,'rank',p.billing_rank,'retention_days',case when p.code='respaldo' then 90 else null end)
 from private.billing_price_mappings m join private.plans p on p.id=m.plan_id where m.id=p_id
$$;

-- Reuse normal server locking, authorization and idempotency for plan changes.
-- A fixed end on Respaldo is not a request to prevent upgrading back to a standard plan.
do $$declare definition text; needle text:='if s.state<>''active'' or s.cancel_at_period_end then';begin
 definition:=pg_get_functiondef('private.billing_subscription_server(text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'retention_change_patch_missing';end if;
 execute replace(definition,needle,'if s.state<>''active'' or (s.cancel_at_period_end and not private.retention_subscription(s.id)) then');
end $$;

alter function private.billing_subscription_server(text,jsonb) rename to billing_subscription_before_retention;
create function private.billing_subscription_server(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(p_data->>'owner')::uuid; op uuid:=(p_data->>'operation_key')::uuid;
 s private.billing_subscriptions; r private.billing_retention; operation private.billing_operations; m private.billing_price_mappings;
 ids uuid[]; result jsonb; request_data jsonb:=coalesce(p_data->'request','{}'); plan_uuid uuid;
begin
 if p_action='prepare_operation' and p_data->>'action'='retention' then
  perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);
  if owner is null or (p_data->>'actor')::uuid is distinct from owner or op is null then raise exception 'unauthorized';end if;
  perform 1 from public.professional_profiles where id=owner for update;
  select * into operation from private.billing_operations where operation_key=op for update;
  if operation.operation_key is not null then
   if operation.professional_id<>owner or operation.action<>'retention' or operation.request<>request_data then raise exception 'operation_mismatch';end if;
   if operation.result is not null then return jsonb_build_object('replay',true,'result',operation.result);end if;
  end if;
  select * into s from private.billing_subscriptions where professional_id=owner and mode=private.billing_environment() order by created_at desc limit 1 for update;
  if s.id is null or s.state<>'active' or s.manual_hold or (s.cancel_at_period_end and operation.operation_key is null) or s.paid_through is null or s.period_end<=now()
   or (private.retention_subscription(s.id) and operation.operation_key is null)
   or exists(select 1 from private.billing_retention where professional_id=owner and mode=private.billing_environment() and operation_key<>op)
   or exists(select 1 from private.professional_access where professional_id=owner and (source<>'billing' or billing_mode<>private.billing_environment()))
  then raise exception 'retention_unavailable';end if;
  if jsonb_typeof(request_data->'patient_ids') is distinct from 'array' then raise exception 'retention_patient_selection_required';end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(request_data->'patient_ids');
  if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x)
   or exists(select 1 from unnest(ids)x where not exists(select 1 from public.patients p where p.id=x and p.professional_id=owner and p.deleted_at is null and p.archived_at is null and p.status='active'))
  then raise exception 'retention_patient_selection_required';end if;
  select id into plan_uuid from private.plans where code='respaldo' and active;
  perform set_config('nuthrick.retention_prepare','true',true);
  m:=private.billing_price(plan_uuid,'monthly');
  perform set_config('nuthrick.retention_prepare','false',true);
  insert into private.billing_operations(operation_key,professional_id,action,request) values(op,owner,'retention',request_data) on conflict do nothing;
  insert into private.billing_retention(professional_id,mode,subscription_id,operation_key,patient_ids)
  values(owner,private.billing_environment(),s.id,op,ids) on conflict(professional_id,mode) do nothing;
  return jsonb_build_object('subscription',to_jsonb(s),'current_price',private.billing_price_json(s.price_mapping_id),'target_price',private.billing_price_json(m.id),'customer_id',s.provider_customer_id);
 elsif p_action='operation_saved' then
  perform private.billing_require_lock(owner,(p_data->>'lock_key')::uuid);
  select * into operation from private.billing_operations where operation_key=op and professional_id=owner for update;
  if operation.action='retention' then
   if operation.result is not null then return operation.result;end if;
   result:=p_data->'result';
   select * into r from private.billing_retention where professional_id=owner and mode=private.billing_environment() and operation_key=op for update;
   if r.professional_id is null or result->>'schedule_id' is null or result->>'retention_starts_at' is null
    or (result->>'retention_ends_at')::timestamptz is distinct from (result->>'retention_starts_at')::timestamptz+interval '90 days'
   then raise exception 'retention_unavailable';end if;
   update private.billing_retention set starts_at=(result->>'retention_starts_at')::timestamptz,ends_at=(result->>'retention_ends_at')::timestamptz where professional_id=owner and mode=private.billing_environment();
   update private.billing_subscriptions set pending_plan_id=(select id from private.plans where code='respaldo'),pending_interval='monthly',provider_schedule_id=result->>'schedule_id',updated_at=now() where id=r.subscription_id;
   update private.billing_operations set result=(p_data->'result')||'{"saved":true}'::jsonb where operation_key=op;
   perform private.billing_audit('billing_retention_requested',owner,r.subscription_id,jsonb_build_object('starts_at',result->>'retention_starts_at','ends_at',result->>'retention_ends_at','patient_count',cardinality(r.patient_ids),'operation_key',op));
   return result;
  end if;
 elsif p_action='prepare_operation' and p_data->>'action'='resume' then
  if exists(select 1 from private.billing_subscriptions where professional_id=owner and mode=private.billing_environment() and private.retention_subscription(id)) then raise exception 'retention_unavailable';end if;
 end if;
 result:=private.billing_subscription_before_retention(p_action,p_data);
 if p_action='apply' and result->>'processed'='true' then
  update private.billing_subscriptions set retention_ends_at=(p_data->'subscription'->>'retention_ends_at')::timestamptz
  where professional_id=owner and mode=private.billing_environment() and provider_subscription_id=p_data->'subscription'->>'id';
 end if;
 return result;
end $$;
revoke all on function private.billing_subscription_server(text,jsonb),private.billing_subscription_before_retention(text,jsonb) from public,anon,authenticated,service_role;

-- Signed-in, owner-only offer and patient selection; no public catalog exposure.
create function private.my_retention_offer() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner uuid:=auth.uid(); s private.billing_subscriptions; r private.billing_retention; env text;
begin
 if owner is null then raise exception 'unauthorized' using errcode='42501';end if;
 env:=private.billing_owner_environment(owner);
 select * into s from private.billing_subscriptions where professional_id=owner and mode=env order by created_at desc limit 1;
 select * into r from private.billing_retention where professional_id=owner and mode=env;
 return jsonb_build_object('eligible',coalesce(s.state='active' and not s.manual_hold and s.period_end>now() and s.paid_through is not null and ((r.professional_id is null and not s.cancel_at_period_end) or (r.starts_at is null and exists(select 1 from private.billing_operations o where o.operation_key=r.operation_key and o.result is null))),false),
  'retry_operation_key',case when r.starts_at is null then r.operation_key else null end,
  'amount',14900,'currency','MXN','duration_days',90,'cycle_days',30,
  'starts_at',r.starts_at,'ends_at',case when s.cancel_at_period_end and s.retention_ends_at is null and exists(select 1 from private.billing_operations o where o.professional_id=owner and o.action='cancel' and o.result is not null and o.created_at>r.created_at) then least(r.ends_at,s.period_end) else r.ends_at end,'patient_ids',coalesce(to_jsonb(r.patient_ids),'[]'),
  'current',coalesce(private.retention_subscription(s.id),false),
  'patients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id) from public.patients p where p.professional_id=owner and p.deleted_at is null and p.archived_at is null and p.status='active'),'[]'));
end $$;
create function public.my_retention_offer() returns jsonb language sql security invoker set search_path='' as $$select private.my_retention_offer()$$;
revoke all on function private.my_retention_offer(),public.my_retention_offer() from public,anon,authenticated,service_role;
grant execute on function private.my_retention_offer(),public.my_retention_offer() to authenticated;

-- Cancelled paid accounts keep reading existing data. Respaldo expires even if a webhook is late.
do $$declare definition text; needle text:='select jsonb_object_agg(c.key';begin
 definition:=pg_get_functiondef('private.resolve_effective_entitlements(uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'retention_resolver_patch_missing';end if;
 definition:=replace(definition,needle,$guard$
 if a.source='billing' and (st='cancelled' or exists(select 1 from private.billing_retention r join private.plans p on p.id=a.plan_id where p.code='respaldo' and r.professional_id=p_owner and r.mode=a.billing_mode and r.ends_at<=now())) then
  read_only:=true; allowed:=true;
 end if;
 select jsonb_object_agg(c.key$guard$);
 needle:='cap:=vals->''patients.limit'';';
 if position(needle in definition)=0 then raise exception 'retention_resolver_values_patch_missing';end if;
 definition:=replace(definition,needle,$guard$
 if exists(select 1 from private.plans where id=a.plan_id and code='respaldo') then
  pid:=a.plan_id;
  if allowed then select jsonb_object_agg(entitlement_key,value) into vals from private.plan_entitlements where plan_id=pid;end if;
  select coalesce(jsonb_object_agg(key,case when key like 'ai.%' then case when jsonb_typeof(value)='boolean' then 'false'::jsonb else '0'::jsonb end else value end),'{}') into vals from jsonb_each(vals);
  select coalesce(cardinality(patient_ids),0) into active_count from private.billing_retention where professional_id=p_owner and mode=a.billing_mode;
  active_count:=coalesce(active_count,0);
 end if;
 cap:=vals->'patients.limit';$guard$);
 needle:='''sources'',coalesce(sources,''{}''))';
 if position(needle in definition)=0 then raise exception 'retention_resolver_projection_missing';end if;
 definition:=replace(definition,needle,needle||$guard$||jsonb_build_object('retention',(select jsonb_build_object('ends_at',r.ends_at,'patient_ids',r.patient_ids) from private.billing_retention r join private.plans p on p.id=pid where p.code='respaldo' and r.professional_id=p_owner and r.mode=a.billing_mode))$guard$);
 execute definition;
end $$;

-- Portal publication and link operations do not all touch public clinical tables.
do $$declare definition text; needle text:='perform private.require_portal_capability(p.professional_id,p_action,p_data->>''format'');';begin
 definition:=pg_get_functiondef('public.patient_portal(text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'retention_portal_patch_missing';end if;
 execute replace(definition,needle,needle||$guard$
 if p_action not in ('inbox','view','messages','read','notes','plan','plan_options','plan_preview','goal_candidates','plan_history','plan_version','export_plan','challenge','verify','verify_professional','logout') then
  perform private.require_retention_patient(p.professional_id,pid);
 end if;
 $guard$);
end $$;
-- Basic export is a read operation; paid cancelled accounts may still use it.
create or replace function private.require_entitlement(p_owner uuid,p_key text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if p_key='exports' and private.can_read_feature(p_owner,p_key) then return;end if;
 if (private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean then raise exception 'account_read_only' using errcode='42501';end if;
 if not private.can_use_feature(p_owner,p_key) then raise exception 'entitlement_required' using errcode='42501';end if;
end $$;

create function private.require_retention_patient(p_owner uuid,p_patient uuid) returns void language plpgsql stable security definer set search_path='' as $$
declare a private.professional_access;
begin
 select pa.* into a from private.professional_access pa join private.plans p on p.id=pa.plan_id where pa.professional_id=p_owner and p.code='respaldo';
 if a.professional_id is null then return;end if;
 if not exists(select 1 from private.billing_retention r where r.professional_id=p_owner and r.mode=a.billing_mode and r.starts_at<=now() and r.ends_at>now() and p_patient=any(r.patient_ids))
 then raise exception 'retention_patient_read_only' using errcode='42501';end if;
end $$;
revoke all on function private.require_retention_patient(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.require_retention_patient(uuid,uuid) to service_role;

create function private.enforce_retention_patient_write() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; pid uuid; owner uuid;
begin
 if tg_op='INSERT' and tg_table_schema='public' and tg_table_name='patients' then
  owner:=(to_jsonb(new)->>'professional_id')::uuid;
  if exists(select 1 from private.professional_access a join private.plans p on p.id=a.plan_id where a.professional_id=owner and p.code='respaldo') then
   perform private.require_entitlement(owner,'patients');
   update private.billing_retention r set patient_ids=array_append(r.patient_ids,(to_jsonb(new)->>'id')::uuid)
   where r.professional_id=owner and r.mode=(select billing_mode from private.professional_access where professional_id=owner)
    and r.starts_at<=now() and r.ends_at>now() and cardinality(r.patient_ids)<5;
   if not found then raise exception 'retention_patient_limit' using errcode='42501';end if;
  end if;
 end if;
 -- Check both sides: a client cannot move a record from an unselected patient into a selected one.
 for row_data in select value from jsonb_array_elements(case tg_op when 'UPDATE' then jsonb_build_array(to_jsonb(old),to_jsonb(new)) when 'DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(new)) end) loop
  pid:=case when tg_table_name='patients' then (row_data->>'id')::uuid else (row_data->>'patient_id')::uuid end;
  owner:=coalesce(row_data->>'professional_id',row_data->>'owner_id')::uuid;
  if owner is null and pid is not null then select professional_id into owner from public.patients where id=pid;end if;
  if owner is not null and pid is not null then perform private.require_retention_patient(owner,pid);end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.enforce_retention_patient_write() from public,anon,authenticated,service_role;
do $$declare t record;begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
 and ((n.nspname='public' and (c.relname='patients' or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='patient_id' and not a.attisdropped)))
 or (n.nspname='private' and c.relname in ('portal_messages','portal_notes'))) loop
  execute format('create trigger a_retention_patient_write before insert or update or delete on %I.%I for each row execute function private.enforce_retention_patient_write()',t.nspname,t.relname);
 end loop;
end $$;

-- The five chosen slots replace the normal active-count quota for this plan only.
-- Slot claims above are transactional and locked on the owner's retention row.
do $$declare definition text; needle text:='cap:=private.get_limit(owner_id,''patients.limit'');';begin
 definition:=pg_get_functiondef('private.enforce_commercial_write()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'retention_quota_patch_missing';end if;
 execute replace(definition,needle,needle||$guard$
 if exists(select 1 from private.professional_access a join private.plans p on p.id=a.plan_id where a.professional_id=owner_id and p.code='respaldo') then cap:='"unlimited"'::jsonb;end if;
 $guard$);
end $$;
