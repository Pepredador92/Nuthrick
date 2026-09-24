-- Commercial configuration on top of ADMIN-1. No billing, provider calls or patient edits.
alter table private.plans add column internal_only boolean not null default true;
alter table private.plans add column credits_provisional boolean not null default true;
alter table private.professional_access add column billing_interval text not null default 'manual' check(billing_interval in ('manual','monthly','annual'));
alter table private.professional_access add column credit_anchor_at timestamptz;
update private.professional_access set credit_anchor_at=starts_at;
alter table private.access_grants add column grant_kind text not null default 'courtesy' check(grant_kind in ('courtesy','founder'));
alter table private.access_grants alter column ends_at drop not null;
alter table private.access_grants add constraint access_grant_window check((grant_kind='founder' and ends_at is null) or (grant_kind='courtesy' and ends_at is not null));
alter table private.access_grants add column one_time_price numeric(12,2) check(one_time_price>=0);
alter table private.access_grants add column currency text not null default 'MXN' check(currency ~ '^[A-Z]{3}$');
alter table private.access_codes add column access_kind text not null default 'trial' check(access_kind in ('trial','founder'));
alter table private.access_codes alter column duration_days drop not null;
alter table private.access_codes add constraint access_code_kind_duration check((access_kind='trial' and duration_days is not null) or (access_kind='founder' and duration_days is null));

-- Preserve exports as the existing PDF/base-export capability; do not create an alias.
update private.entitlement_catalog set label='PDF de planes y exportación básica' where key='exports';
update private.entitlement_catalog set label='Pacientes activos' where key='patients.limit';
update private.entitlement_catalog set label='Superlink y chat con paciente' where key='patient_superlink';
insert into private.entitlement_catalog(key,label,category,value_type,display_order) values
('exports.tex','LaTeX para el profesional','Paciente','boolean',81),
('exports.advanced','Exportación avanzada de evolución','Paciente','boolean',82),
('diet_library.full','Biblioteca compartida completa','Taller','boolean',51);
-- Existing internal plans retain all functions they had; existing manual overrides remain.
insert into private.plan_entitlements(plan_id,entitlement_key,value)
select p.id,c.key,'true'::jsonb from private.plans p cross join private.entitlement_catalog c
where c.key in ('exports.tex','exports.advanced','diet_library.full');
update private.plan_entitlements set value='true' where plan_id=(select id from private.plans where code='full_access') and entitlement_key='ai.credit_purchase';
insert into private.plans(code,name,description,monthly_price,annual_price,currency,internal_only,display_order) values
('esencial','Esencial','Para comenzar y atender hasta 30 pacientes activos. Herramientas clínicas, Taller manual, Superlink y R24h/PES.',349,3490,'MXN',false,0),
('profesional','Profesional','Para una consulta activa: pacientes ilimitados, Taller IA, biblioteca completa y exportaciones avanzadas.',499,4990,'MXN',false,10);
update private.plans set display_order=case code when 'beta' then 20 when 'full_access' then 30 else 40 end where internal_only;
insert into private.plan_entitlements(plan_id,entitlement_key,value)
select p.id,c.key,case when c.key='patients.limit' then case when p.code='esencial' then '30'::jsonb else '"unlimited"'::jsonb end
when c.key='ai.monthly_credits' then case when p.code='esencial' then '10'::jsonb else '50'::jsonb end
when c.value_type='limit' then '"unlimited"'::jsonb
else to_jsonb(p.code='profesional' or c.key not in ('ai.diet_draft','exports.tex','exports.advanced','diet_library.full')) end
from private.plans p cross join private.entitlement_catalog c where p.code in ('esencial','profesional');
insert into private.admin_audit(action,entity,reason,metadata) values('commercial_catalog_configured','plans','Configuración comercial inicial autorizada','{"monthly_credits_provisional":true,"esencial":10,"profesional":50}');

-- Monetary allocation must always be finite. Unlimited is for usage limits, not credit minting.


create or replace function private.validate_entitlement_value() returns trigger language plpgsql set search_path='' as $$
declare kind text; begin
 select value_type into kind from private.entitlement_catalog where key=new.entitlement_key;
 if kind='boolean' and jsonb_typeof(new.value)='boolean' then return new; end if;
 if new.entitlement_key='ai.monthly_credits' and new.value='"unlimited"'::jsonb then raise exception 'finite_monthly_credits_required' using errcode='22023'; end if;
 if kind='limit' and (new.value='"unlimited"'::jsonb or
  (jsonb_typeof(new.value)='number' and (new.value::text)::numeric between 0 and (case when new.entitlement_key='ai.monthly_credits' then 1000000 else 100000000 end) and (new.value::text)::numeric=trunc((new.value::text)::numeric))) then return new; end if;
 raise exception 'invalid_entitlement_value' using errcode='22023';
end $$;

create or replace function private.resolve_effective_entitlements(p_owner uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.professional_access; g private.access_grants; pid uuid; st text; allowed boolean:=false;
 start_time timestamptz; end_time timestamptz; vals jsonb; sources jsonb; read_only boolean:=false; arrangement text; active_count bigint; cap jsonb;
begin
 select * into a from private.professional_access where professional_id=p_owner;
 select * into g from private.access_grants where professional_id=p_owner and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now()) order by starts_at desc,created_at desc,id desc limit 1;
 arrangement:=coalesce(a.billing_interval,'manual');
 pid:=a.plan_id; st:=coalesce(a.status,'unassigned'); start_time:=a.starts_at; end_time:=a.ends_at;
 if st='suspended' then
  read_only:=true; allowed:=true;
  if g.id is not null then pid:=g.plan_id; start_time:=g.starts_at; end_time:=g.ends_at; arrangement:=g.grant_kind; end if;
 elsif st<>'cancelled' then
  if g.id is not null then pid:=g.plan_id; st:=case when g.grant_kind='founder' then 'active' else 'trial' end; arrangement:=g.grant_kind; start_time:=g.starts_at; end_time:=g.ends_at;
  elsif a.starts_at>now() then st:='scheduled';
  elsif a.ends_at<=now() then st:='expired'; end if;
  allowed:=st in ('active','trial','grace');
 end if;
 select jsonb_object_agg(c.key,case when allowed then coalesce(o.value,pe.value,case when c.value_type='boolean' then 'false'::jsonb else '0'::jsonb end)
  else case when c.value_type='boolean' then 'false'::jsonb else '0'::jsonb end end),
  jsonb_object_agg(c.key,case when not allowed then 'access_state' when o.id is not null then 'override' when g.id is not null then 'courtesy' else 'plan' end)
 into vals,sources from private.entitlement_catalog c
 left join private.plan_entitlements pe on pe.plan_id=pid and pe.entitlement_key=c.key
 left join lateral(select x.* from private.professional_overrides x where x.professional_id=p_owner and x.entitlement_key=c.key and x.revoked_at is null and x.starts_at<=now() and (x.ends_at is null or x.ends_at>now()) order by x.starts_at desc,x.created_at desc,x.id desc limit 1) o on true;
 if arrangement='founder' then vals:=jsonb_set(vals,'{ai.monthly_credits}','0'); sources:=jsonb_set(sources,'{ai.monthly_credits}','"access_arrangement"'); end if;
 select count(*) into active_count from public.patients where professional_id=p_owner and status='active' and archived_at is null and deleted_at is null;
 cap:=vals->'patients.limit';
 return jsonb_build_object('read_only',read_only,'arrangement',arrangement,'credit_anchor_at',coalesce(a.credit_anchor_at,start_time),'patient_usage',jsonb_build_object('active',active_count,'limit',cap,'over_limit',cap<>'"unlimited"'::jsonb and active_count>case when cap='"unlimited"'::jsonb then 0 else (cap::text)::numeric end),'plan_id',pid,'plan_name',(select name from private.plans where id=pid),'status',st,'starts_at',start_time,'ends_at',end_time,'allowed',allowed,'values',coalesce(vals,'{}'),'sources',coalesce(sources,'{}'));
end $$;

create or replace function private.can_use_feature(p_owner uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(e->'values'->p_key='true'::jsonb and not (e->>'read_only')::boolean,false) from (select private.resolve_effective_entitlements(p_owner) e) x
$$;
create function private.can_read_feature(p_owner uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(e->'values'->p_key='true'::jsonb and (e->>'allowed')::boolean,false) from (select private.resolve_effective_entitlements(p_owner) e) x
$$;
create function private.my_read_feature(p_key text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and private.can_read_feature(auth.uid(),p_key)$$;
revoke all on function private.can_read_feature(uuid,text),private.my_read_feature(text) from public,anon,authenticated,service_role;
grant execute on function private.my_read_feature(text) to authenticated;
create or replace function private.require_entitlement(p_owner uuid,p_key text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if (private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean then raise exception 'account_read_only' using errcode='42501'; end if;
 if not private.can_use_feature(p_owner,p_key) then raise exception 'entitlement_required' using errcode='42501'; end if;
end $$;

-- Only public commercial fields, never internal plans or account information.
create function private.public_plan_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'description',p.description,'monthly_price',p.monthly_price,'annual_price',p.annual_price,'currency',p.currency,'credits_provisional',p.credits_provisional,'values',(select jsonb_object_agg(entitlement_key,value) from private.plan_entitlements where plan_id=p.id)) order by display_order,name),'[]') from private.plans p where active and not internal_only
$$;
create function public.plan_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.public_plan_catalog()$$;
revoke all on function private.public_plan_catalog(),public.plan_catalog() from public,anon,authenticated,service_role;
grant execute on function private.public_plan_catalog(),public.plan_catalog() to anon,authenticated;


create or replace function private.admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
<<admin_command>>
declare actor uuid:=private.require_platform_admin(); owner_id uuid; entity_id uuid; plan_id_value uuid;
 before_value jsonb; after_value jsonb; result jsonb; reason_value text:=nullif(btrim(p_data->>'reason'),'');
 a private.professional_access; v_plan private.plans; c private.access_codes; item record;
 start_time timestamptz; end_time timestamptz; code_value text; amount numeric;
 entity_name text; search_value text:=coalesce(p_data->>'search',''); offset_value integer:=coalesce((p_data->>'offset')::integer,0);
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>24000 or length(search_value)>100 or offset_value<0 or offset_value>100000 or length(reason_value)>500 then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_action='overview' then
  return (select jsonb_build_object('registered',count(*),'active',count(*) filter(where e->>'status'='active'),'trial',count(*) filter(where e->>'status'='trial'),'suspended',count(*) filter(where e->>'status'='suspended')) from (select private.resolve_effective_entitlements(id) e from public.professional_profiles) x);
 elsif p_action='catalog' then
  return jsonb_build_object('entitlements',(select jsonb_agg(to_jsonb(e) order by display_order) from private.entitlement_catalog e),
   'plans',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('values',coalesce((select jsonb_object_agg(entitlement_key,value) from private.plan_entitlements where plan_id=p.id),'{}')) order by display_order,name) from private.plans p),'[]'));
 elsif p_action='professionals' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(x.row) from (select private.admin_professional_row(p.id) row from public.professional_profiles p join auth.users u on u.id=p.id
   where search_value='' or p.full_name ilike '%'||search_value||'%' or u.email ilike '%'||search_value||'%' order by p.created_at desc,p.id limit 50 offset offset_value) x),'[]'),
   'total',(select count(*) from public.professional_profiles p join auth.users u on u.id=p.id where search_value='' or p.full_name ilike '%'||search_value||'%' or u.email ilike '%'||search_value||'%'));
 elsif p_action='professional' then
  owner_id:=(p_data->>'professional_id')::uuid;
  result:=private.admin_professional_row(owner_id);
  if result is null then raise exception 'not_found'; end if;
  return result||jsonb_build_object('base_access',(select to_jsonb(base_row) from private.professional_access base_row where professional_id=owner_id),
   'ai',private.admin_ai_summary(owner_id),
   'overrides',coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from private.professional_overrides o where professional_id=owner_id and revoked_at is null),'[]'),
   'grants',coalesce((select jsonb_agg(to_jsonb(g) order by created_at desc) from private.access_grants g where professional_id=owner_id and revoked_at is null),'[]'),
   'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select l.id,l.action,l.reason,l.metadata,l.created_at,coalesce(p.full_name,'Sistema') actor from private.admin_audit l left join public.professional_profiles p on p.id=coalesce(l.actor_admin,l.actor_user) where target_professional=owner_id order by l.id desc limit 50) x),'[]'));
 elsif p_action='codes' then
  return coalesce((select jsonb_agg(to_jsonb(codes_row)-'code_hash' order by created_at desc) from private.access_codes codes_row),'[]');
 elsif p_action='ai_summary' then
  return jsonb_build_object('accounts',coalesce((select jsonb_agg(private.admin_professional_row(p.id) order by p.full_name) from public.professional_profiles p),'[]'),
   'usage',coalesce((select jsonb_agg(to_jsonb(x)) from (select feature,count(*) executions,sum(charged_credits) credits from private.ai_generations where started_at>=now()-interval '30 days' group by feature) x),'[]'));
 elsif p_action='audit' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select l.id,l.action,l.entity,l.reason,l.created_at,l.metadata,coalesce(p.full_name,'Sistema') actor from private.admin_audit l left join public.professional_profiles p on p.id=coalesce(l.actor_admin,l.actor_user) order by l.id desc limit 50 offset offset_value) x),'[]');
 end if;

 -- Every mutation records bounded, whitelisted before/after values in this transaction.
 if p_action='save_plan' then
  entity_name:='plans'; entity_id:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
  select * into v_plan from private.plans where id=entity_id for update;
  before_value:=to_jsonb(v_plan);
  if v_plan.id is not null and (p_data->>'updated_at')::timestamptz is distinct from v_plan.updated_at then raise exception 'stale_revision'; end if;
  if jsonb_typeof(p_data->'values') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_data->'values'))<>(select count(*) from private.entitlement_catalog) then raise exception 'invalid_entitlements'; end if;
  insert into private.plans(id,code,name,description,active,display_order,monthly_price,annual_price,currency,internal_only,credits_provisional)
  values(entity_id,p_data->>'code',p_data->>'name',coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'display_order')::integer,0),nullif(p_data->>'monthly_price','')::numeric,nullif(p_data->>'annual_price','')::numeric,coalesce(p_data->>'currency','MXN'),coalesce((p_data->>'internal_only')::boolean,true),coalesce((p_data->>'credits_provisional')::boolean,true))
  on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,active=excluded.active,display_order=excluded.display_order,monthly_price=excluded.monthly_price,annual_price=excluded.annual_price,currency=excluded.currency,internal_only=excluded.internal_only,credits_provisional=excluded.credits_provisional,updated_at=clock_timestamp();
  before_value:=jsonb_build_object('plan',before_value,'values',(select jsonb_object_agg(entitlement_key,value) from private.plan_entitlements where plan_id=entity_id));
  for item in select key,value from jsonb_each(p_data->'values') loop
   insert into private.plan_entitlements(plan_id,entitlement_key,value) values(entity_id,item.key,item.value) on conflict(plan_id,entitlement_key) do update set value=excluded.value;
  end loop;
  after_value:=jsonb_build_object('plan',(select to_jsonb(v) from private.plans v where id=entity_id),'values',p_data->'values');
 elsif p_action='save_code' then
  entity_name:='access_codes'; entity_id:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
  select * into c from private.access_codes where id=entity_id for update;
  before_value:=to_jsonb(c)-'code_hash';
  code_value:=upper(btrim(p_data->>'code'));
  if c.id is null and (code_value is null or code_value !~ '^[A-Z0-9_-]{5,64}$') then raise exception 'invalid_code'; end if;
  if c.id is not null and code_value is not null and code_value<>'' then raise exception 'code_immutable'; end if;
  plan_id_value:=(p_data->>'plan_id')::uuid;
  if not exists(select 1 from private.plans where id=plan_id_value and active) then raise exception 'inactive_plan'; end if;
  insert into private.access_codes(id,code_hash,name,plan_id,duration_days,initial_ai_credits,max_redemptions,starts_at,expires_at,active,access_kind)
  values(entity_id,coalesce(c.code_hash,encode(sha256(convert_to(code_value,'UTF8')),'hex')),p_data->>'name',plan_id_value,(p_data->>'duration_days')::integer,coalesce((p_data->>'initial_ai_credits')::numeric,0),(p_data->>'max_redemptions')::integer,(p_data->>'starts_at')::timestamptz,(p_data->>'expires_at')::timestamptz,coalesce((p_data->>'active')::boolean,true),coalesce(p_data->>'access_kind','trial'))
  on conflict(id) do update set name=excluded.name,plan_id=excluded.plan_id,duration_days=excluded.duration_days,initial_ai_credits=excluded.initial_ai_credits,max_redemptions=excluded.max_redemptions,starts_at=excluded.starts_at,expires_at=excluded.expires_at,active=excluded.active,access_kind=excluded.access_kind;
  after_value:=(select to_jsonb(v)-'code_hash' from private.access_codes v where id=entity_id);
 else
  owner_id:=(p_data->>'professional_id')::uuid;
  perform 1 from public.professional_profiles where id=owner_id for update;
  if not found then raise exception 'not_found'; end if;
  if reason_value is null and p_action<>'grant_access' then raise exception 'reason_required'; end if;
  select * into a from private.professional_access where professional_id=owner_id for update;
  entity_name:='professional_access'; entity_id:=owner_id;
  before_value:=to_jsonb(a);
  if p_action in ('set_access','grant_access','grant_founder') then
   plan_id_value:=(p_data->>'plan_id')::uuid;
   if not exists(select 1 from private.plans where id=plan_id_value and active) then raise exception 'inactive_plan'; end if;
   start_time:=(p_data->>'starts_at')::timestamptz; end_time:=(p_data->>'ends_at')::timestamptz;
   if p_action='set_access' then
    if coalesce(p_data->>'billing_interval','manual') in ('monthly','annual') and end_time is null then raise exception 'commercial_end_required'; end if;
    if p_data->>'status' not in ('trial','active','grace','cancelled') then raise exception 'invalid_status'; end if;
    insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source,billing_interval,credit_anchor_at) values(owner_id,plan_id_value,p_data->>'status',start_time,end_time,'manual',coalesce(p_data->>'billing_interval','manual'),coalesce(a.credit_anchor_at,start_time))
    on conflict(professional_id) do update set plan_id=excluded.plan_id,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,source='manual',billing_interval=excluded.billing_interval,updated_at=now();
    -- A deliberate immediate plan change also ends temporary plan grants.
    update private.access_grants set revoked_at=now() where professional_id=owner_id and revoked_at is null;
   else
    if a.status in ('suspended','cancelled') then raise exception 'reactivation_required'; end if;
    entity_name:='access_grants'; entity_id:=gen_random_uuid();
    insert into private.access_grants(id,professional_id,plan_id,starts_at,ends_at,grant_kind,one_time_price,currency) values(entity_id,owner_id,plan_id_value,start_time,case when p_action='grant_founder' then null else end_time end,case when p_action='grant_founder' then 'founder' else 'courtesy' end,nullif(p_data->>'one_time_price','')::numeric,coalesce(p_data->>'currency','MXN'));
    -- A courtesy can stand alone; its expiry/revocation must not leave base access behind.
   end if;
   after_value:=jsonb_build_object('access',private.resolve_effective_entitlements(owner_id),'grant',case when p_action in ('grant_access','grant_founder') then (select to_jsonb(g) from private.access_grants g where g.id=entity_id) else null end);
  elsif p_action in ('suspend','reactivate') then
   if a.professional_id is null then
    if p_action='reactivate' then raise exception 'assign_plan_first'; end if;
    select plan_id into plan_id_value from private.access_grants where professional_id=owner_id and revoked_at is null order by created_at desc limit 1;
    if plan_id_value is null then raise exception 'assign_plan_first'; end if;
    insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source) values(owner_id,plan_id_value,'suspended',now()-interval '1 second',now(),'manual');
   end if;
   update private.professional_access set status=case when p_action='suspend' then 'suspended' else 'active' end,updated_at=now() where professional_id=owner_id;
   after_value:=private.resolve_effective_entitlements(owner_id);
  elsif p_action='set_override' then
   entity_name:='professional_overrides'; entity_id:=gen_random_uuid(); before_value:=null;
   insert into private.professional_overrides(id,professional_id,entitlement_key,value,starts_at,ends_at) values(entity_id,owner_id,p_data->>'entitlement_key',p_data->'value',(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz);
   after_value:=(select to_jsonb(v) from private.professional_overrides v where id=entity_id);
  elsif p_action='revoke_override' then
   entity_name:='professional_overrides'; entity_id:=(p_data->>'id')::uuid;
   update private.professional_overrides set revoked_at=now() where id=entity_id and professional_id=owner_id and revoked_at is null returning to_jsonb(professional_overrides) into after_value;
   if not found then raise exception 'not_found'; end if;
  elsif p_action='revoke_grant' then
   entity_name:='access_grants'; entity_id:=(p_data->>'id')::uuid;
   update private.access_grants set revoked_at=now() where id=entity_id and professional_id=owner_id and revoked_at is null returning to_jsonb(access_grants) into after_value;
   if not found then raise exception 'not_found'; end if;
  elsif p_action='allocate_credits' then
   entity_name:='ai_credit_ledger'; before_value:=null; after_value:=private.allocate_plan_month(owner_id,now());
   if after_value->>'allocated'='false' then return after_value; end if;
  elsif p_action='adjust_credits' then
   entity_name:='ai_credit_ledger'; entity_id:=(p_data->>'operation_key')::uuid; amount:=(p_data->>'amount')::numeric;
   perform private.adjust_ai_credits(owner_id,entity_id,amount);
   if exists(select 1 from private.admin_audit l where l.entity='ai_credit_ledger' and l.entity_id=admin_command.entity_id::text and l.target_professional=owner_id) then return jsonb_build_object('saved',true,'replayed',true); end if;
   before_value:=null; after_value:=jsonb_build_object('amount',amount,'type','ADMIN_ADJUSTMENT');
  else raise exception 'invalid_action' using errcode='22023'; end if;
 end if;
 insert into private.admin_audit(actor_admin,action,target_professional,entity,entity_id,reason,metadata)
 values(actor,p_action,owner_id,entity_name,entity_id::text,reason_value,jsonb_build_object('before',before_value,'after',after_value));
 return jsonb_build_object('saved',true,'id',entity_id);
end $$;

create or replace function private.redeem_access_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); c private.access_codes; redemption uuid:=gen_random_uuid(); until_time timestamptz; begin
 if owner_id is null or not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_code is null or upper(btrim(p_code)) !~ '^[A-Z0-9_-]{5,64}$' then raise exception 'code_unavailable'; end if;
 -- Serialize all grants to one owner before the shared code lock.
 perform 1 from public.professional_profiles where id=owner_id for update;
 if not found then raise exception 'unauthorized'; end if;
 select * into c from private.access_codes where code_hash=encode(sha256(convert_to(upper(btrim(p_code)),'UTF8')),'hex') for update;
 if c.id is null then raise exception 'code_unavailable'; end if;
 if exists(select 1 from private.access_code_redemptions where code_id=c.id and professional_id=owner_id) then raise exception 'code_already_redeemed'; end if;
 if not c.active or c.starts_at>now() or c.expires_at<=now() or c.redeemed_count>=c.max_redemptions or not exists(select 1 from private.plans where id=c.plan_id and active) then raise exception 'code_unavailable'; end if;
 if exists(select 1 from private.professional_access where professional_id=owner_id and status in ('suspended','cancelled')) then raise exception 'access_unavailable'; end if;
 -- Codes cannot replace an existing live commercial/courtesy access.
 if (private.resolve_effective_entitlements(owner_id)->>'allowed')::boolean then raise exception 'access_already_active'; end if;
 until_time:=case when c.access_kind='founder' then null else now()+make_interval(days=>c.duration_days) end;
 if c.access_kind='founder' then
 insert into private.access_grants(professional_id,plan_id,starts_at,ends_at,grant_kind) values(owner_id,c.plan_id,now(),null,'founder');
 else
 insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source) values(owner_id,c.plan_id,'trial',now(),until_time,'beta_code')
 on conflict(professional_id) do update set plan_id=excluded.plan_id,status='trial',starts_at=excluded.starts_at,ends_at=excluded.ends_at,source='beta_code',updated_at=now();
 end if;
 insert into private.access_code_redemptions(id,code_id,professional_id) values(redemption,c.id,owner_id);
 update private.access_codes set redeemed_count=redeemed_count+1 where id=c.id;
 if c.initial_ai_credits>0 then perform private.adjust_ai_credits(owner_id,redemption,c.initial_ai_credits); end if;
 insert into private.admin_audit(actor_user,action,target_professional,entity,entity_id,metadata) values(owner_id,'code_redeemed',owner_id,'access_codes',c.id::text,jsonb_build_object('credits',c.initial_ai_credits,'ends_at',until_time));
 return private.resolve_effective_entitlements(owner_id);
end $$;

create or replace function private.admin_professional_row(p_owner uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.full_name,'email',u.email,'created_at',p.created_at,
 'onboarding_completed',p.onboarding_completed,'last_activity',u.last_sign_in_at,'access',private.resolve_effective_entitlements(p.id),
 'credits',coalesce((select (case when billing_period_end>now() then included_credits-reserved_included else 0 end)+purchased_credits-reserved_purchased from private.ai_accounts where professional_id=p.id),0))
 from public.professional_profiles p join auth.users u on u.id=p.id where p.id=p_owner
$$;
revoke all on function private.admin_professional_row(uuid) from public,anon,authenticated,service_role;



create or replace function private.enforce_commercial_write() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 owner_id uuid; cap jsonb; used bigint;
begin
 owner_id:=coalesce(row_data->>'professional_id',row_data->>'owner_id')::uuid;
 -- Shared catalog rows are maintained by existing internal publication workflows.
 if owner_id is null then return case when tg_op='DELETE' then old else new end; end if;
 perform private.require_entitlement(owner_id,tg_argv[0]);
 if tg_op='UPDATE' and coalesce(to_jsonb(old)->>'professional_id',to_jsonb(old)->>'owner_id') is distinct from owner_id::text then
  raise exception 'owner_immutable' using errcode='42501';
 end if;
 if tg_table_name='patients' and (tg_op='INSERT' or (tg_op='UPDATE' and (to_jsonb(old)->>'status'<>'active' or to_jsonb(old)->>'archived_at' is not null or to_jsonb(old)->>'deleted_at' is not null))) and row_data->>'status'='active' and row_data->>'archived_at' is null and row_data->>'deleted_at' is null then
  -- Serializes quota checks across REST, RPC and server paths for this owner.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8317));
  cap:=private.get_limit(owner_id,'patients.limit');
  if cap<>'"unlimited"'::jsonb then
   select count(*) into used from public.patients where professional_id=owner_id and status='active' and archived_at is null and deleted_at is null;
   if used>=(cap::text)::numeric then raise exception 'patients_limit_reached' using errcode='42501'; end if;
  end if;
 elsif tg_table_name='consultations' and tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8317));
  cap:=private.get_limit(owner_id,'consultations.monthly_limit');
  if cap<>'"unlimited"'::jsonb then
   select coalesce((select consultations from private.commercial_usage_months where professional_id=owner_id and period_start=date_trunc('month',now() at time zone 'UTC')::date),0) into used;
   if used>=(cap::text)::numeric then raise exception 'consultations_limit_reached' using errcode='42501'; end if;
  end if;
  insert into private.commercial_usage_months(professional_id,period_start,consultations) values(owner_id,date_trunc('month',now() at time zone 'UTC')::date,1)
  on conflict(professional_id,period_start) do update set consultations=private.commercial_usage_months.consultations+1;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.enforce_commercial_write() from public,anon,authenticated,service_role;


-- Existing ledger, with business-period idempotency in addition to request keys.
alter table private.ai_credit_ledger add column allocation_period_start timestamptz;
alter table private.ai_credit_ledger add column allocation_period_end timestamptz;
alter table private.ai_credit_ledger add column allocation_amount numeric(18,3);
alter table private.ai_credit_ledger add constraint allocation_period_valid check(
 (allocation_period_start is null and allocation_period_end is null) or
 (type='PLAN_ALLOCATION' and allocation_period_start<allocation_period_end and allocation_amount>=0));
create unique index ai_one_allocation_per_month on private.ai_credit_ledger(professional_id,allocation_period_start) where type='PLAN_ALLOCATION' and allocation_period_start is not null;

create function private.grant_credits_for_period(p_owner uuid,p_key uuid,p_type text,p_amount numeric,p_start timestamptz,p_end timestamptz,p_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare a private.ai_accounts; entry private.ai_credit_ledger; delta numeric;
begin
 if p_key is null or p_type is null or p_type not in ('PLAN_ALLOCATION','PURCHASE') or p_amount is null or p_amount<0 or p_amount>1000000 or p_amount<>round(p_amount,3) then raise exception 'invalid_allocation'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 select * into entry from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key;
 if found then
  if entry.type<>p_type or entry.allocation_amount is distinct from p_amount or entry.allocation_period_start is distinct from p_start or entry.allocation_period_end is distinct from p_end then raise exception 'idempotency_conflict'; end if;
  return false;
 end if;
 if p_type='PLAN_ALLOCATION' then
  if p_start is null or p_end is null or p_start>=p_end or p_start>p_at or p_end<=p_at then raise exception 'invalid_period'; end if;
  if exists(select 1 from private.ai_credit_ledger where professional_id=p_owner and type='PLAN_ALLOCATION' and allocation_period_start=p_start) then return false; end if;
  if a.billing_period_end>p_start then raise exception 'overlapping_credit_period'; end if;
  if a.billing_period_start is not null and p_start<=a.billing_period_start then raise exception 'invalid_period'; end if;
  -- Defer renewal until outstanding included-credit reservations are reconciled.
  if a.reserved_included>0 then raise exception 'unsettled_period'; end if;
  delta:=p_amount-a.included_credits;
  insert into private.ai_credit_ledger(professional_id,type,included_delta,operation_key,allocation_period_start,allocation_period_end,allocation_amount)
   values(p_owner,'PLAN_ALLOCATION',delta,p_key,p_start,p_end,p_amount);
  update private.ai_accounts set included_credits=p_amount,credits_included_per_period=p_amount,billing_period_start=p_start,billing_period_end=p_end where professional_id=p_owner;
 else
  if p_start is not null or p_end is not null then raise exception 'invalid_period'; end if;
  insert into private.ai_credit_ledger(professional_id,type,purchased_delta,operation_key,allocation_amount) values(p_owner,'PURCHASE',p_amount,p_key,p_amount);
  update private.ai_accounts set purchased_credits=purchased_credits+p_amount where professional_id=p_owner;
 end if;
 return true;
end $$;
revoke all on function private.grant_credits_for_period(uuid,uuid,text,numeric,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
-- The service wrapper keeps the original signature used by the IA ledger.
create or replace function public.ai_grant_credits(p_owner uuid,p_key uuid,p_type text,p_amount numeric,p_start timestamptz default null,p_end timestamptz default null)
returns void language plpgsql security invoker set search_path='' as $$
begin perform private.grant_credits_for_period(p_owner,p_key,p_type,p_amount,p_start,p_end,now()); end $$;
grant execute on function private.grant_credits_for_period(uuid,uuid,text,numeric,timestamptz,timestamptz,timestamptz) to service_role;

-- UTC calendar months anchored to the original commercial access, including Jan 31.
-- Private clock argument exists for deterministic offline tests; public API uses now().
create function private.allocate_plan_month(p_owner uuid,p_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.professional_access; e jsonb; anchor timestamp; month_count integer; start_time timestamptz; end_time timestamptz; amount numeric; op uuid; applied boolean;
begin
 perform 1 from public.professional_profiles where id=p_owner for update;
 select * into a from private.professional_access where professional_id=p_owner for update;
 if a.professional_id is null or a.status not in ('active','trial','grace') or a.starts_at>p_at or (a.ends_at is not null and a.ends_at<=p_at) or a.billing_interval not in ('monthly','annual') then return '{"allocated":false,"reason":"no_monthly_allocation"}'; end if;
 -- A temporary or permanent grant takes precedence over recurring base access.
 if exists(select 1 from private.access_grants where professional_id=p_owner and revoked_at is null and starts_at<=p_at and (ends_at is null or ends_at>p_at)) then return '{"allocated":false,"reason":"grant_active"}'; end if;
 select coalesce((select value from private.professional_overrides where professional_id=p_owner and entitlement_key='ai.monthly_credits' and revoked_at is null and starts_at<=p_at and (ends_at is null or ends_at>p_at) order by starts_at desc,created_at desc,id desc limit 1),value)::text::numeric into amount from private.plan_entitlements where plan_id=a.plan_id and entitlement_key='ai.monthly_credits';
 if coalesce(amount,0)=0 then return '{"allocated":false,"reason":"no_included_credits"}'; end if;
 anchor:=coalesce(a.credit_anchor_at,a.starts_at) at time zone 'UTC';
 month_count:=(extract(year from p_at at time zone 'UTC')::integer-extract(year from anchor)::integer)*12+extract(month from p_at at time zone 'UTC')::integer-extract(month from anchor)::integer;
 start_time:=(anchor+make_interval(months=>month_count)) at time zone 'UTC';
 if start_time>p_at then month_count:=month_count-1; start_time:=(anchor+make_interval(months=>month_count)) at time zone 'UTC'; end if;
 end_time:=(anchor+make_interval(months=>month_count+1)) at time zone 'UTC';
 if a.ends_at is not null then end_time:=least(end_time,a.ends_at); end if;
 -- No mid-period top-up on upgrades, reactivation, retries or price changes.
 if exists(select 1 from private.ai_credit_ledger where professional_id=p_owner and type='PLAN_ALLOCATION' and allocation_period_start=start_time) then return '{"allocated":false,"reason":"already_allocated"}'; end if;
 if exists(select 1 from private.ai_accounts where professional_id=p_owner and billing_period_end>start_time) then return '{"allocated":false,"reason":"current_period_preserved"}'; end if;
 op:=md5(p_owner::text||':plan-month:'||extract(epoch from start_time)::text)::uuid;
 applied:=private.grant_credits_for_period(p_owner,op,'PLAN_ALLOCATION',amount,start_time,end_time,p_at);
 return jsonb_build_object('allocated',applied,'amount',amount,'starts_at',start_time,'ends_at',end_time);
end $$;
revoke all on function private.allocate_plan_month(uuid,timestamptz) from public,anon,authenticated,service_role;
create function private.allocate_current_plan_month(p_owner uuid) returns jsonb language sql security definer set search_path='' as $$select private.allocate_plan_month(p_owner,now())$$;
create function public.allocate_plan_credits(p_owner uuid) returns jsonb language sql security invoker set search_path='' as $$select private.allocate_current_plan_month(p_owner)$$;
revoke all on function private.allocate_current_plan_month(uuid),public.allocate_plan_credits(uuid) from public,anon,authenticated,service_role;
grant execute on function private.allocate_current_plan_month(uuid),public.allocate_plan_credits(uuid) to service_role;

-- Read access and operational access are independent for suspended accounts.
-- Existing tenant policies remain in place; these remain restrictive policies.
do $$ declare t text; cap text; policy_name text; begin
 for t,cap in select distinct c.relname,encode(tg.tgargs,'escape') from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and tg.tgname='commercial_write' loop
  cap:=split_part(cap,'\000',1);
  foreach policy_name in array array['commercial_access','commercial_read','commercial_insert','commercial_update','commercial_delete'] loop execute format('drop policy if exists %I on public.%I',policy_name,t); end loop;
  execute format('create policy commercial_read on public.%I as restrictive for select to authenticated using ((select private.my_read_feature(%L)) %s)',t,cap,case when cap='consultation_design' then 'or (select private.my_read_feature(''consultations''))' else '' end);
  execute format('create policy commercial_insert on public.%I as restrictive for insert to authenticated with check ((select private.my_feature(%L)))',t,cap);
  execute format('create policy commercial_update on public.%I as restrictive for update to authenticated using ((select private.my_feature(%L))) with check ((select private.my_feature(%L)))',t,cap,cap);
  execute format('create policy commercial_delete on public.%I as restrictive for delete to authenticated using ((select private.my_feature(%L)))',t,cap);
 end loop;
end $$;
-- Cover the professional-owned catalogs/workspaces as well as clinical records.
do $$ declare t text; cap text; begin
 for t,cap in select * from (values ('food_items','diet_workshop'),('recipes','diet_workshop'),('recipe_items','diet_workshop'),('professional_measurement_workspaces','consultations'),('professional_measurement_workspace_items','consultations'),('professional_devices','consultations'),('professional_device_capabilities','consultations'),('laboratory_custom_analytes','consultations'),('laboratory_panel_templates','consultations')) x(t,c) loop
  execute format('create trigger commercial_write before insert or update or delete on public.%I for each row execute function private.enforce_commercial_write(%L)',t,cap);
  execute format('create policy commercial_read on public.%I as restrictive for select to authenticated using ((select private.my_read_feature(%L)))',t,cap);
  execute format('create policy commercial_insert on public.%I as restrictive for insert to authenticated with check ((select private.my_feature(%L)))',t,cap);
  execute format('create policy commercial_update on public.%I as restrictive for update to authenticated using ((select private.my_feature(%L))) with check ((select private.my_feature(%L)))',t,cap,cap);
  execute format('create policy commercial_delete on public.%I as restrictive for delete to authenticated using ((select private.my_feature(%L)))',t,cap);
 end loop;
end $$;

-- Basic library: personal items plus three initial shared bases. No clinical edits.
alter table public.diet_library_items add column access_tier text not null default 'full' check(access_tier in ('basic','full'));
with ranked as (select id,row_number() over(order by name,id) n from public.diet_library_items where owner_id is null and not archived)
update public.diet_library_items i set access_tier='basic' from ranked r where i.id=r.id and r.n<=3;
create policy commercial_library_tier on public.diet_library_items as restrictive for select to authenticated using(owner_id=(select auth.uid()) or access_tier='basic' or (select private.my_read_feature('diet_library.full')));
-- Definer application paths must also check the tier, before content is returned/applied.
create function private.require_library_item(p_id uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.diet_library_items where id=p_id and (owner_id=auth.uid() or (owner_id is null and (access_tier='basic' or private.can_use_feature(auth.uid(),'diet_library.full'))))) then raise exception 'library_tier_required' using errcode='42501'; end if;
end $$;
revoke all on function private.require_library_item(uuid) from public,anon,authenticated,service_role;
do $$ declare signature regprocedure; original text; begin
 foreach signature in array array['public.apply_diet_library(uuid,bigint,uuid,bigint,uuid,jsonb)'::regprocedure,'public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text)'::regprocedure] loop
  original:=pg_get_functiondef(signature);
  execute regexp_replace(original,'\mbegin\M',E'begin\n perform private.require_library_item(p_source_id);','i');
 end loop;
end $$;

create function private.require_portal_capability(p_owner uuid,p_action text,p_format text) returns void language plpgsql stable security definer set search_path='' as $$
declare capability text:='patient_superlink'; can_read boolean;
begin
 if p_action='export_plan' then capability:=case p_format when 'tex' then 'exports.tex' else 'exports' end; end if;
 can_read:=p_action in ('inbox','view','messages','read','notes','plan','plan_options','plan_preview','goal_candidates','plan_history','plan_version','export_plan','challenge','verify','verify_professional','logout');
 if can_read then
  if not private.can_read_feature(p_owner,capability) then raise exception 'entitlement_required' using errcode='42501'; end if;
 else perform private.require_entitlement(p_owner,capability); end if;
end $$;
revoke all on function private.require_portal_capability(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.require_portal_capability(uuid,text,text) to service_role;
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('public.patient_portal(text,jsonb)'::regprocedure);
 amended:=replace(original,'perform private.require_entitlement((p_data->>''owner'')::uuid,''patient_superlink'');','perform private.require_portal_capability((p_data->>''owner'')::uuid,p_action,p_data->>''format'');');
 amended:=replace(amended,'perform private.require_entitlement(p.professional_id,''patient_superlink'');','perform private.require_portal_capability(p.professional_id,p_action,p_data->>''format'');');
 amended:=replace(amended,'if p_action=''export_plan'' then perform private.require_entitlement(p.professional_id,''exports''); end if;','');
 if amended=original then raise exception 'unexpected_portal_guard'; end if;
 execute amended;
end $$;

-- Reading an existing copilot workspace remains possible in read-only mode.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
 amended:=replace(original,'perform private.require_my_entitlement(''consultations'');',E'if p_kind is not null then perform private.require_my_entitlement(''consultations'');\n elsif not private.can_read_feature(auth.uid(),''consultations'') then raise exception ''entitlement_required'' using errcode=''42501''; end if;');
 if amended=original then raise exception 'unexpected_clinical_read_guard'; end if; execute amended;
 original:=pg_get_functiondef('public.ai_diet_draft(uuid,text,jsonb)'::regprocedure);
 amended:=regexp_replace(original,'\mbegin\M',E'begin\n if p_action in (''apply'',''bind'') then perform private.require_entitlement(p_owner,''ai.diet_draft''); end if;','i');
 if amended=original then raise exception 'unexpected_diet_guard'; end if; execute amended;
end $$;
