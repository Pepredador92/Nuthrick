-- ADMIN-1. Commercial data is private. Public RPCs are invoker facades;
-- privileged implementations authenticate the actor, never an email/JWT metadata.
create table private.platform_admins (
 user_id uuid primary key references auth.users(id) on delete restrict,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table private.plans (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[a-z][a-z0-9_]{2,59}$'),
 name text not null check(length(btrim(name)) between 2 and 100),
 description text not null default '' check(length(description)<=1000),
 active boolean not null default true,
 display_order integer not null default 0,
 monthly_price numeric(12,2) check(monthly_price>=0),
 annual_price numeric(12,2) check(annual_price>=0),
 currency text not null default 'MXN' check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.entitlement_catalog (
 key text primary key, label text not null, category text not null,
 value_type text not null check(value_type in ('boolean','limit')),
 display_order integer not null
);
create table private.plan_entitlements (
 plan_id uuid not null references private.plans(id) on delete restrict,
 entitlement_key text not null references private.entitlement_catalog(key),
 value jsonb not null, primary key(plan_id,entitlement_key)
);
create index plan_entitlements_key on private.plan_entitlements(entitlement_key);
create table private.professional_access (
 professional_id uuid primary key references public.professional_profiles(id) on delete restrict,
 plan_id uuid not null references private.plans(id) on delete restrict,
 status text not null check(status in ('trial','active','grace','suspended','cancelled')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 source text not null check(source in ('manual','legacy','beta_code','billing')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create index professional_access_plan on private.professional_access(plan_id);
-- Temporary plan grants replace the base plan only during their window.
-- Suspension/cancellation of the base account always wins over all grants.
create table private.access_grants (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.professional_profiles(id) on delete restrict,
 plan_id uuid not null references private.plans(id) on delete restrict,
 starts_at timestamptz not null, ends_at timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index access_grants_owner on private.access_grants(professional_id,starts_at desc);
create index access_grants_plan on private.access_grants(plan_id);
create table private.professional_overrides (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.professional_profiles(id) on delete restrict,
 entitlement_key text not null references private.entitlement_catalog(key), value jsonb not null,
 starts_at timestamptz not null, ends_at timestamptz,
 revoked_at timestamptz, created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create index professional_overrides_owner on private.professional_overrides(professional_id,entitlement_key,starts_at desc);
create index professional_overrides_key on private.professional_overrides(entitlement_key);
create table private.access_codes (
 id uuid primary key default gen_random_uuid(), code_hash text not null unique,
 name text not null check(length(btrim(name)) between 2 and 100),
 plan_id uuid not null references private.plans(id) on delete restrict,
 duration_days integer not null check(duration_days between 1 and 3660),
 initial_ai_credits numeric(18,3) not null default 0 check(initial_ai_credits between 0 and 1000000),
 max_redemptions integer not null check(max_redemptions between 1 and 100000),
 redeemed_count integer not null default 0 check(redeemed_count>=0 and redeemed_count<=max_redemptions),
 starts_at timestamptz not null, expires_at timestamptz not null,
 active boolean not null default true, created_at timestamptz not null default now(),
 check(expires_at>starts_at)
);
create index access_codes_plan on private.access_codes(plan_id);
create table private.access_code_redemptions (
 id uuid primary key default gen_random_uuid(), code_id uuid not null references private.access_codes(id),
 professional_id uuid not null references public.professional_profiles(id),
 created_at timestamptz not null default now(), unique(code_id,professional_id)
);
create index access_code_redemptions_owner on private.access_code_redemptions(professional_id);
create table private.admin_audit (
 id bigint generated always as identity primary key,
 actor_admin uuid references auth.users(id) on delete restrict,
 actor_user uuid references auth.users(id) on delete restrict,
 action text not null, target_professional uuid references public.professional_profiles(id) on delete restrict,
 entity text not null, entity_id text, reason text check(length(reason)<=500),
 metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index admin_audit_target on private.admin_audit(target_professional,created_at desc);
create index admin_audit_actor on private.admin_audit(actor_admin);
create index admin_audit_user on private.admin_audit(actor_user);

do $$ declare t text; begin
 foreach t in array array['platform_admins','plans','entitlement_catalog','plan_entitlements','professional_access','access_grants','professional_overrides','access_codes','access_code_redemptions','admin_audit'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  -- Explicit deny policy documents the RPC-only boundary and avoids missing-policy lints.
  execute format('create policy admin_rpc_only on private.%I to authenticated using (false)',t);
 end loop;
end $$;
revoke all on sequence private.admin_audit_id_seq from public,anon,authenticated,service_role;

insert into private.entitlement_catalog(key,label,category,value_type,display_order) values
 ('patients','Pacientes','Clínica','boolean',10),
 ('consultations','Consultas','Clínica','boolean',20),
 ('consultation_design','Diseño de consulta','Clínica','boolean',30),
 ('diet_workshop','Taller de dietas','Taller','boolean',40),
 ('diet_library','Biblioteca de dietas','Taller','boolean',50),
 ('public_profile','Perfil público','Paciente','boolean',60),
 ('patient_superlink','Superlink y mensajes','Paciente','boolean',70),
 ('exports','Exportaciones','Paciente','boolean',80),
 ('agenda','Agenda','Agenda','boolean',90),
 ('ai.recall_24h','Recordatorio de 24 horas','IA','boolean',100),
 ('ai.pes','Diagnóstico PES','IA','boolean',110),
 ('ai.diet_draft','Borrador de dieta','IA','boolean',120),
 ('ai.credit_purchase','Recarga de créditos (preparación)','IA','boolean',130),
 ('patients.limit','Máximo de pacientes','Límites','limit',140),
 ('consultations.monthly_limit','Consultas por mes','Límites','limit',150),
 ('ai.monthly_credits','Créditos IA mensuales configurados','Límites','limit',160);

create function private.validate_entitlement_value() returns trigger language plpgsql set search_path='' as $$
declare kind text; begin
 select value_type into kind from private.entitlement_catalog where key=new.entitlement_key;
 if kind='boolean' and jsonb_typeof(new.value)='boolean' then return new; end if;
 if kind='limit' and (new.value='"unlimited"'::jsonb or
  (jsonb_typeof(new.value)='number' and (new.value::text)::numeric between 0 and 100000000 and (new.value::text)::numeric=trunc((new.value::text)::numeric))) then return new; end if;
 raise exception 'invalid_entitlement_value' using errcode='22023';
end $$;
create trigger validate_plan_entitlement before insert or update on private.plan_entitlements for each row execute function private.validate_entitlement_value();
create trigger validate_professional_override before insert or update on private.professional_overrides for each row execute function private.validate_entitlement_value();
revoke all on function private.validate_entitlement_value() from public,anon,authenticated,service_role;

insert into private.plans(code,name,description,display_order) values
 ('full_access','Nuthrick Full Access','Acceso administrativo temporal. No es un precio comercial definitivo.',0),
 ('beta','Nuthrick Beta','Piloto SaaS con cero créditos IA incluidos.',10),
 ('legacy','Acceso previo','Continuidad de las cuentas existentes; sin privilegios administrativos ni créditos adicionales.',20);
insert into private.plan_entitlements(plan_id,entitlement_key,value)
 select p.id,c.key,case when c.value_type='limit' then case when c.key='ai.monthly_credits' then '0'::jsonb else '"unlimited"'::jsonb end
 else to_jsonb(c.key<>'ai.credit_purchase' and (p.code='full_access' or c.key not like 'ai.%')) end
 from private.plans p cross join private.entitlement_catalog c;
-- One-time preservation only: new accounts receive no implicit paid/admin access.
insert into private.professional_access(professional_id,plan_id,status,source)
 select pr.id,p.id,'active','legacy' from public.professional_profiles pr cross join private.plans p where p.code='legacy';
insert into private.admin_audit(action,target_professional,entity,entity_id,reason,metadata)
 select 'legacy_preserved',a.professional_id,'professional_access',a.professional_id::text,'Migración ADMIN-1',jsonb_build_object('source','legacy') from private.professional_access a;

create function private.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.platform_admins where user_id=auth.uid() and enabled)
$$;
create function private.require_platform_admin() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_platform_admin() then raise exception 'admin_required' using errcode='42501'; end if;
 return auth.uid();
end $$;
revoke all on function private.is_platform_admin(),private.require_platform_admin() from public,anon,authenticated,service_role;

-- Internal resolver: caller wrappers enforce self/admin/service access.
-- Precedence: account suspension > live grant plan > base plan; live override wins
-- over that plan. Newest starts_at, then created_at/id makes overlap deterministic.
create function private.resolve_effective_entitlements(p_owner uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.professional_access; g private.access_grants; pid uuid; st text; allowed boolean:=false;
 start_time timestamptz; end_time timestamptz; vals jsonb; sources jsonb;
begin
 select * into a from private.professional_access where professional_id=p_owner;
 select * into g from private.access_grants where professional_id=p_owner and revoked_at is null and starts_at<=now() and ends_at>now() order by starts_at desc,created_at desc,id desc limit 1;
 pid:=a.plan_id; st:=coalesce(a.status,'unassigned'); start_time:=a.starts_at; end_time:=a.ends_at;
 if st not in ('suspended','cancelled') then
  if g.id is not null then pid:=g.plan_id; st:='trial'; start_time:=g.starts_at; end_time:=g.ends_at;
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
 return jsonb_build_object('plan_id',pid,'plan_name',(select name from private.plans where id=pid),'status',st,'starts_at',start_time,'ends_at',end_time,'allowed',allowed,'values',coalesce(vals,'{}'),'sources',coalesce(sources,'{}'));
end $$;
revoke all on function private.resolve_effective_entitlements(uuid) from public,anon,authenticated,service_role;

create function private.can_use_feature(p_owner uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.resolve_effective_entitlements(p_owner)->'values'->p_key='true'::jsonb,false)
$$;
create function private.require_entitlement(p_owner uuid,p_key text) returns void language plpgsql stable security definer set search_path='' as $$
begin if not private.can_use_feature(p_owner,p_key) then raise exception 'entitlement_required' using errcode='42501'; end if; end $$;
create function private.get_limit(p_owner uuid,p_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.entitlement_catalog where key=p_key and value_type='limit') then private.resolve_effective_entitlements(p_owner)->'values'->p_key else '0'::jsonb end
$$;
revoke all on function private.can_use_feature(uuid,text),private.require_entitlement(uuid,text),private.get_limit(uuid,text) from public,anon,authenticated,service_role;

create function private.my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object('is_admin',private.is_platform_admin(),'access',private.resolve_effective_entitlements(auth.uid()));
end $$;
create function public.my_access() returns jsonb language sql security invoker set search_path='' as $$select private.my_access()$$;
revoke all on function private.my_access(),public.my_access() from public,anon,service_role;
grant execute on function private.my_access(),public.my_access() to authenticated;

-- Atomic ledger primitive. Courtesy/manual credits use the existing durable
-- purchased bucket; the ledger type/audit distinguish them from purchases.
create function private.adjust_ai_credits(p_owner uuid,p_key uuid,p_amount numeric) returns void language plpgsql set search_path='' as $$
declare a private.ai_accounts; old_delta numeric; purchased_change numeric; included_change numeric:=0; available_included numeric; begin
 if p_key is null or p_amount is null or p_amount=0 or abs(p_amount)>1000000 or p_amount<>round(p_amount,3) then raise exception 'invalid_adjustment'; end if;
 insert into private.ai_accounts(professional_id) values(p_owner) on conflict do nothing;
 select * into a from private.ai_accounts where professional_id=p_owner for update;
 select purchased_delta+included_delta into old_delta from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key and type='ADMIN_ADJUSTMENT';
 if found then if old_delta<>p_amount then raise exception 'idempotency_conflict'; end if; return; end if;
 if exists(select 1 from private.ai_credit_ledger where professional_id=p_owner and operation_key=p_key) then raise exception 'idempotency_conflict'; end if;
 available_included:=case when a.billing_period_end>now() then a.included_credits-a.reserved_included else 0 end;
 if a.purchased_credits-a.reserved_purchased+available_included+p_amount<0 then raise exception 'insufficient_unreserved_credits'; end if;
 purchased_change:=case when p_amount>0 then p_amount else -least(-p_amount,a.purchased_credits-a.reserved_purchased) end;
 included_change:=p_amount-purchased_change;
 insert into private.ai_credit_ledger(professional_id,type,included_delta,purchased_delta,operation_key) values(p_owner,'ADMIN_ADJUSTMENT',included_change,purchased_change,p_key);
 update private.ai_accounts set purchased_credits=purchased_credits+purchased_change,included_credits=included_credits+included_change where professional_id=p_owner;
end $$;
revoke all on function private.adjust_ai_credits(uuid,uuid,numeric) from public,anon,authenticated,service_role;

create function private.admin_ai_summary(p_owner uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'available',coalesce((select (case when billing_period_end>now() then included_credits-reserved_included else 0 end)+purchased_credits-reserved_purchased from private.ai_accounts where professional_id=p_owner),0),
 'included',coalesce((select case when billing_period_end>now() then included_credits-reserved_included else 0 end from private.ai_accounts where professional_id=p_owner),0),
 'purchased',coalesce((select purchased_credits-reserved_purchased from private.ai_accounts where professional_id=p_owner),0),
 'consumed',coalesce((select sum(charged_credits) from private.ai_generations where professional_id=p_owner),0),
 'usage',coalesce((select jsonb_agg(to_jsonb(u)) from (select feature,count(*) as executions,sum(charged_credits) as credits from private.ai_generations where professional_id=p_owner and started_at>=now()-interval '30 days' group by feature) u),'[]'),
 'ledger',coalesce((select jsonb_agg(to_jsonb(l)) from (select type,included_delta,purchased_delta,created_at from private.ai_credit_ledger where professional_id=p_owner order by created_at desc,id desc limit 30) l),'[]'))
$$;
revoke all on function private.admin_ai_summary(uuid) from public,anon,authenticated,service_role;

-- Hash lookup only. Codes are normalized, never returned from storage.
create function private.redeem_access_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 until_time:=now()+make_interval(days=>c.duration_days);
 insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source) values(owner_id,c.plan_id,'trial',now(),until_time,'beta_code')
 on conflict(professional_id) do update set plan_id=excluded.plan_id,status='trial',starts_at=excluded.starts_at,ends_at=excluded.ends_at,source='beta_code',updated_at=now();
 insert into private.access_code_redemptions(id,code_id,professional_id) values(redemption,c.id,owner_id);
 update private.access_codes set redeemed_count=redeemed_count+1 where id=c.id;
 if c.initial_ai_credits>0 then perform private.adjust_ai_credits(owner_id,redemption,c.initial_ai_credits); end if;
 insert into private.admin_audit(actor_user,action,target_professional,entity,entity_id,metadata) values(owner_id,'code_redeemed',owner_id,'access_codes',c.id::text,jsonb_build_object('credits',c.initial_ai_credits,'ends_at',until_time));
 return private.resolve_effective_entitlements(owner_id);
end $$;
create function public.redeem_access_code(p_code text) returns jsonb language sql security invoker set search_path='' as $$select private.redeem_access_code(p_code)$$;
revoke all on function private.redeem_access_code(text),public.redeem_access_code(text) from public,anon,service_role;
grant execute on function private.redeem_access_code(text),public.redeem_access_code(text) to authenticated;

create function private.admin_professional_row(p_owner uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.full_name,'email',u.email,'created_at',p.created_at,
 'last_activity',u.last_sign_in_at,'access',private.resolve_effective_entitlements(p.id),
 'credits',coalesce((select (case when billing_period_end>now() then included_credits-reserved_included else 0 end)+purchased_credits-reserved_purchased from private.ai_accounts where professional_id=p.id),0))
 from public.professional_profiles p join auth.users u on u.id=p.id where p.id=p_owner
$$;
revoke all on function private.admin_professional_row(uuid) from public,anon,authenticated,service_role;

create function private.admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  insert into private.plans(id,code,name,description,active,display_order,monthly_price,annual_price,currency)
  values(entity_id,p_data->>'code',p_data->>'name',coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'display_order')::integer,0),nullif(p_data->>'monthly_price','')::numeric,nullif(p_data->>'annual_price','')::numeric,coalesce(p_data->>'currency','MXN'))
  on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,active=excluded.active,display_order=excluded.display_order,monthly_price=excluded.monthly_price,annual_price=excluded.annual_price,currency=excluded.currency,updated_at=clock_timestamp();
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
  insert into private.access_codes(id,code_hash,name,plan_id,duration_days,initial_ai_credits,max_redemptions,starts_at,expires_at,active)
  values(entity_id,coalesce(c.code_hash,encode(sha256(convert_to(code_value,'UTF8')),'hex')),p_data->>'name',plan_id_value,(p_data->>'duration_days')::integer,coalesce((p_data->>'initial_ai_credits')::numeric,0),(p_data->>'max_redemptions')::integer,(p_data->>'starts_at')::timestamptz,(p_data->>'expires_at')::timestamptz,coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,plan_id=excluded.plan_id,duration_days=excluded.duration_days,initial_ai_credits=excluded.initial_ai_credits,max_redemptions=excluded.max_redemptions,starts_at=excluded.starts_at,expires_at=excluded.expires_at,active=excluded.active;
  after_value:=(select to_jsonb(v)-'code_hash' from private.access_codes v where id=entity_id);
 else
  owner_id:=(p_data->>'professional_id')::uuid;
  perform 1 from public.professional_profiles where id=owner_id for update;
  if not found then raise exception 'not_found'; end if;
  if reason_value is null and p_action<>'grant_access' then raise exception 'reason_required'; end if;
  select * into a from private.professional_access where professional_id=owner_id for update;
  entity_name:='professional_access'; entity_id:=owner_id;
  before_value:=to_jsonb(a);
  if p_action in ('set_access','grant_access') then
   plan_id_value:=(p_data->>'plan_id')::uuid;
   if not exists(select 1 from private.plans where id=plan_id_value and active) then raise exception 'inactive_plan'; end if;
   start_time:=(p_data->>'starts_at')::timestamptz; end_time:=(p_data->>'ends_at')::timestamptz;
   if p_action='set_access' then
    if p_data->>'status' not in ('trial','active','grace','cancelled') then raise exception 'invalid_status'; end if;
    insert into private.professional_access(professional_id,plan_id,status,starts_at,ends_at,source) values(owner_id,plan_id_value,p_data->>'status',start_time,end_time,'manual')
    on conflict(professional_id) do update set plan_id=excluded.plan_id,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,source='manual',updated_at=now();
    -- A deliberate immediate plan change also ends temporary plan grants.
    update private.access_grants set revoked_at=now() where professional_id=owner_id and revoked_at is null;
   else
    if a.status in ('suspended','cancelled') then raise exception 'reactivation_required'; end if;
    entity_name:='access_grants'; entity_id:=gen_random_uuid();
    insert into private.access_grants(id,professional_id,plan_id,starts_at,ends_at) values(entity_id,owner_id,plan_id_value,start_time,end_time);
    -- A courtesy can stand alone; its expiry/revocation must not leave base access behind.
   end if;
   after_value:=jsonb_build_object('access',private.resolve_effective_entitlements(owner_id),'grant',case when p_action='grant_access' then (select to_jsonb(g) from private.access_grants g where g.id=entity_id) else null end);
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
create function public.admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.admin_api(p_action,p_data)$$;
revoke all on function private.admin_api(text,jsonb),public.admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.admin_api(text,jsonb),public.admin_api(text,jsonb) to authenticated;
