begin;

-- A short, single-professional Live AI pilot. The global provider kill switch
-- remains off until the Edge Function and consent UI are deployed.
create table private.ai_live_pilot_configuration (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  consent_version text not null check (consent_version ~ '^[a-z0-9-]{8,64}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  max_daily_credits numeric(8,3) not null default 5 check (max_daily_credits between 0.1 and 5),
  max_daily_generations integer not null default 5 check (max_daily_generations between 1 and 5),
  max_total_generations integer not null default 60 check (max_total_generations between 1 and 60),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
insert into private.ai_live_pilot_configuration(id,enabled,consent_version,starts_at,ends_at)
values (true,true,'ai-processing-2026-09-30-v1',now(),now()+interval '30 days');

create table private.ai_processing_consents (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete restrict,
  notice_version text not null,
  patient_authorization_confirmed boolean not null check (patient_authorization_confirmed),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= accepted_at)
);
create index ai_processing_consents_active on private.ai_processing_consents(professional_id,accepted_at desc)
  where revoked_at is null;
alter table private.ai_live_pilot_configuration enable row level security;
alter table private.ai_processing_consents enable row level security;
create policy deny_direct on private.ai_live_pilot_configuration for all to anon,authenticated using(false) with check(false);
create policy deny_direct on private.ai_processing_consents for all to anon,authenticated using(false) with check(false);
revoke all on private.ai_live_pilot_configuration,private.ai_processing_consents from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.ai_live_pilot_configuration,private.ai_processing_consents to service_role;

create function private.ai_live_pilot_eligible(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select c.enabled and c.starts_at<=now() and c.ends_at>now()
    from private.ai_live_pilot_configuration c where c.id),false)
    and exists(select 1 from private.billing_live_allowlist a
      join private.billing_subscriptions s on s.professional_id=a.professional_id and s.mode='live'
      join private.professional_access pa on pa.professional_id=a.professional_id and pa.source='billing' and pa.billing_mode='live'
      join public.professional_profiles pp on pp.id=a.professional_id and pp.onboarding_completed
      where a.professional_id=p_owner and a.enabled and s.state='active' and not s.manual_hold
        and pa.status='active'
        and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'read_only')::boolean,true)=false
        and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'allowed')::boolean,false))
    and exists(select 1 from private.ai_pilot_limits l where l.professional_id=p_owner and l.enabled
      and l.starts_at<=now() and (l.ends_at is null or l.ends_at>now()));
$$;
revoke all on function private.ai_live_pilot_eligible(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ai_live_pilot_eligible(uuid) to service_role;

create function private.ai_live_pilot_policy_valid()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select c.enabled and c.ends_at<=c.starts_at+interval '31 days'
      and c.max_daily_credits<=5 and c.max_daily_generations<=5 and c.max_total_generations<=60
      from private.ai_live_pilot_configuration c where c.id),false)
    and (select count(*)=1 from private.billing_live_allowlist where enabled)
    and (select count(*)=1 from private.ai_pilot_limits where enabled and max_daily_credits<=5
      and max_daily_generations<=5 and max_total_generations<=60 and ends_at<=starts_at+interval '31 days')
    and (select count(*)=2 from private.ai_feature_access where enabled and feature in ('recall_24h','pes_diagnosis'))
    and not exists(select 1 from private.ai_feature_access where enabled and feature not in ('recall_24h','pes_diagnosis'))
    and not exists(select 1 from private.ai_feature_config where enabled and feature not in ('recall_24h','pes_diagnosis'));
$$;
revoke all on function private.ai_live_pilot_policy_valid() from public,anon,authenticated,service_role;
grant execute on function private.ai_live_pilot_policy_valid() to service_role;

create function private.ai_processing_consent_status(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v text; c private.ai_processing_consents;
begin
  if p_owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select consent_version into v from private.ai_live_pilot_configuration where id;
  select * into c from private.ai_processing_consents
    where professional_id=p_owner and notice_version=v and revoked_at is null
    order by accepted_at desc limit 1;
  return jsonb_build_object('eligible',private.ai_live_pilot_eligible(p_owner),'version',v,
    'accepted',c.id is not null,'accepted_at',c.accepted_at,'revoked_at',c.revoked_at);
end $$;
revoke all on function private.ai_processing_consent_status(uuid) from public,anon,authenticated,service_role;
grant execute on function private.ai_processing_consent_status(uuid) to service_role;

create function public.my_ai_processing_consent()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  return private.ai_processing_consent_status(auth.uid());
end $$;
revoke all on function public.my_ai_processing_consent() from public,anon,service_role;
grant execute on function public.my_ai_processing_consent() to authenticated;

create function public.accept_ai_processing_consent(p_version text,p_patient_authorization boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); current_version text;
begin
  if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select consent_version into current_version from private.ai_live_pilot_configuration where id and enabled
    and starts_at<=now() and ends_at>now();
  if current_version is null or p_version is distinct from current_version then raise exception 'consent_version_changed'; end if;
  if p_patient_authorization is distinct from true then raise exception 'patient_authorization_required'; end if;
  if not private.ai_live_pilot_eligible(owner) then raise exception 'ai_pilot_unavailable'; end if;
  if not exists(select 1 from private.legal_documents d join private.legal_acceptances a
    on a.document_key=d.key and a.document_version=d.version
    where d.key='privacy' and d.review_status='approved' and a.professional_id=owner) then
    raise exception 'legal_acceptance_required';
  end if;
  insert into private.ai_processing_consents(professional_id,notice_version,patient_authorization_confirmed)
    values(owner,current_version,true);
  return private.ai_processing_consent_status(owner);
end $$;
revoke all on function public.accept_ai_processing_consent(text,boolean) from public,anon,service_role;
grant execute on function public.accept_ai_processing_consent(text,boolean) to authenticated;

create function public.revoke_ai_processing_consent()
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); current_version text;
begin
  if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select consent_version into current_version from private.ai_live_pilot_configuration where id;
  update private.ai_processing_consents set revoked_at=now()
    where professional_id=owner and notice_version=current_version and revoked_at is null;
  return private.ai_processing_consent_status(owner);
end $$;
revoke all on function public.revoke_ai_processing_consent() from public,anon,service_role;
grant execute on function public.revoke_ai_processing_consent() to authenticated;

-- Only the explicitly authorized, active Live subscriber enters the pilot.
do $$
declare pilot record; pilot_count integer;
begin
  select count(*) into pilot_count from private.billing_live_allowlist a
    join private.billing_subscriptions s on s.professional_id=a.professional_id and s.mode='live'
    join private.professional_access pa on pa.professional_id=a.professional_id and pa.source='billing' and pa.billing_mode='live'
    join public.professional_profiles pp on pp.id=a.professional_id and pp.onboarding_completed
    where a.enabled and s.state='active' and not s.manual_hold and pa.status='active'
      and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'read_only')::boolean,true)=false
      and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'allowed')::boolean,false);
  if pilot_count<>1 then raise exception 'ai_pilot_requires_one_active_live_account'; end if;
  select a.professional_id into pilot from private.billing_live_allowlist a
    join private.billing_subscriptions s on s.professional_id=a.professional_id and s.mode='live'
    join private.professional_access pa on pa.professional_id=a.professional_id and pa.source='billing' and pa.billing_mode='live'
    join public.professional_profiles pp on pp.id=a.professional_id and pp.onboarding_completed
    where a.enabled and s.state='active' and not s.manual_hold and pa.status='active'
      and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'read_only')::boolean,true)=false
      and coalesce((private.resolve_effective_entitlements(a.professional_id)->>'allowed')::boolean,false);

  insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations,max_daily_credits,starts_at,ends_at,
    calibration_started_at,calibration_patient_id,calibration_request_limit,calibration_usd_limit,calibration_model_limits)
  values(pilot.professional_id,true,60,5,5,now(),now()+interval '30 days',null,null,null,null,null)
  on conflict(professional_id) do update set enabled=true,max_total_generations=60,max_daily_generations=5,max_daily_credits=5,
    starts_at=now(),ends_at=now()+interval '30 days',calibration_started_at=null,calibration_patient_id=null,
    calibration_request_limit=null,calibration_usd_limit=null,calibration_model_limits=null;

  update private.ai_feature_access set enabled=false where professional_id<>pilot.professional_id;
  insert into private.ai_feature_access(feature,professional_id,enabled)
    values('recall_24h',pilot.professional_id,true),('pes_diagnosis',pilot.professional_id,true)
    on conflict(feature,professional_id) do update set enabled=true,updated_at=now();
  update private.ai_feature_config set enabled=false;
  insert into private.ai_accounts(professional_id,enabled) values(pilot.professional_id,true)
    on conflict(professional_id) do update set enabled=true;
end $$;

create or replace function private.ai_feature_allowed(p_owner uuid,p_feature text)
returns boolean language sql security definer set search_path='' as $$
  select exists(select 1 from private.ai_feature_config c where c.feature=p_feature and c.enabled)
    and exists(select 1 from private.ai_feature_access x where x.feature=p_feature and x.professional_id=p_owner and x.enabled)
    and exists(select 1 from private.ai_pilot_limits l where l.professional_id=p_owner and l.enabled
      and l.starts_at<=now() and (l.ends_at is null or l.ends_at>now()))
    and private.ai_live_pilot_eligible(p_owner)
    and exists(select 1 from private.ai_processing_consents c
      join private.ai_live_pilot_configuration cfg on cfg.id and c.notice_version=cfg.consent_version
      where c.professional_id=p_owner and c.revoked_at is null and c.patient_authorization_confirmed)
    and coalesce((private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean,true)=false
    and coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>
      case p_feature when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes' else 'ai.unsupported' end)::boolean,false);
$$;
revoke all on function private.ai_feature_allowed(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.ai_feature_allowed(uuid,text) to service_role;

-- Keep PRE-LIVE 15/15 meaningful: the AI gate passes only for this bounded,
-- consented two-feature pilot; all other features remain unavailable.
do $$ declare d text; old_fragment text; new_fragment text; begin
  d:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
  old_fragment:=$old$jsonb_build_object('key','openai','label','OpenAI deshabilitado','status',case when openai_enabled then 'blocked' else 'ready' end,'detail',case when openai_enabled then 'Hay una configuración IA habilitada.' else 'No hay features IA reales habilitadas; las pruebas usan mocks.' end)$old$;
  new_fragment:=$new$jsonb_build_object('key','openai','label','Piloto de IA acotado','status',case when not openai_enabled or private.ai_live_pilot_policy_valid() then 'ready' else 'blocked' end,'detail',case when openai_enabled then 'Solo la cuenta Live autorizada, con consentimiento vigente y límites de uso puede acceder a Recordatorio 24 h y diagnóstico PES.' else 'OpenAI está desactivado hasta publicar las barreras del piloto.' end)$new$;
  d:=replace(d,old_fragment,new_fragment);
  if position(new_fragment in d)=0 then raise exception 'pre_live_ai_check_patch_failed'; end if;
  execute d;
  d:=pg_get_functiondef('private.billing_live_readiness()'::regprocedure);
  old_fragment:=$old$jsonb_build_object('key','live_ai','label','Recargas IA fuera del lanzamiento Live','status',case when not exists(select 1 from private.ai_credit_price_mappings where mode<>'test') and not exists(select 1 from private.ai_feature_config where enabled) then 'ready' else 'blocked' end,'detail','ADMIN-3 continúa en TEST; OpenAI no se activa en esta fase.')$old$;
  new_fragment:=$new$jsonb_build_object('key','live_ai','label','Piloto de IA y recargas controlados','status',case when not exists(select 1 from private.ai_feature_config where enabled) or private.ai_live_pilot_policy_valid() then 'ready' else 'blocked' end,'detail','El uso de IA se limita al piloto autorizado, al consentimiento registrado y a topes diarios; las recargas Live continúan independientes del checkout de suscripciones.')$new$;
  d:=replace(d,old_fragment,new_fragment);
  if position(new_fragment in d)=0 then raise exception 'live_ai_check_patch_failed'; end if;
  execute d;
end $$;

commit;
