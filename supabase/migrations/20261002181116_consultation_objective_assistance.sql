-- Clinician controlled, credit metered suggestions for consultation objectives.
insert into private.entitlement_catalog(key,label,category,value_type,display_order)
values ('ai.consultation_support','Apoyo IA para objetivos de consulta','IA','boolean',125)
on conflict (key) do update set label=excluded.label,category=excluded.category,value_type=excluded.value_type;

insert into private.plan_entitlements(plan_id,entitlement_key,value)
select id,'ai.consultation_support',to_jsonb(code in ('profesional','full_access'))
from private.plans
on conflict (plan_id,entitlement_key) do nothing;

-- Use the already priced low-cost clinical model. The feature is explicitly
-- requested, bounded to 512 output tokens, and uses the existing credit ledger.
insert into private.ai_feature_config(
  feature,enabled,provider,model,prompt_version,max_input_tokens,max_output_tokens,
  reasoning_level,temperature,timeout_ms,max_provider_attempts,credit_multiplier,
  credits_per_usd,input_usd_per_million,cached_usd_per_million,
  output_usd_per_million,pricing_version,execution_mode
)
select 'consultation_support',true,provider,'gpt-5.6-luna','consultation_support@1',
  8192,512,'low',null,60000,1,credit_multiplier,credits_per_usd,
  input_usd_per_million,cached_usd_per_million,output_usd_per_million,
  pricing_version,'real'
from private.ai_feature_config where feature='recall_24h'
on conflict (feature) do update set
  enabled=true,provider='openai',model='gpt-5.6-luna',
  prompt_version='consultation_support@1',max_input_tokens=8192,max_output_tokens=512,
  reasoning_level='low',temperature=null,timeout_ms=60000,max_provider_attempts=1,
  execution_mode='real',updated_at=now();

create or replace function private.ai_live_pilot_eligible(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select production_enabled from private.ai_live_pilot_configuration where id),false)
 and exists(select 1 from public.professional_profiles where id=p_owner and onboarding_completed)
 and private.credit_owner_environment(p_owner)='live'
 and not exists(select 1 from private.ai_credit_purchases where professional_id=p_owner and mode='test' and credited_at is not null and credits_purchased+bonus_credits>reversed_credits)
 and coalesce((private.resolve_effective_entitlements(p_owner)->>'allowed')::boolean,false)
 and not coalesce((private.resolve_effective_entitlements(p_owner)->>'read_only')::boolean,true)
 and not exists(select 1 from private.professional_access where professional_id=p_owner and source='billing' and billing_mode='test')
 and (coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.recall_24h')::boolean,false)
   or coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.pes')::boolean,false)
   or coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.diet_draft')::boolean,false)
   or coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>'ai.consultation_support')::boolean,false))
$$;

create or replace function private.ai_feature_allowed(p_owner uuid,p_feature text)
returns boolean language sql security definer set search_path='' as $$
 select private.ai_live_pilot_eligible(p_owner)
 and exists(select 1 from private.ai_feature_config c where c.feature=p_feature and c.enabled and c.execution_mode='real')
 and exists(select 1 from private.ai_processing_consents c
   join private.ai_live_pilot_configuration cfg on cfg.id and c.notice_version=cfg.consent_version
   where c.professional_id=p_owner and c.revoked_at is null and c.patient_authorization_confirmed)
 and exists(select 1 from private.ai_pilot_limits l where l.professional_id=p_owner and l.enabled
   and l.starts_at<=now() and (l.ends_at is null or l.ends_at>now()))
 and coalesce((private.resolve_effective_entitlements(p_owner)->'values'->>
   case p_feature when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes'
     when 'diet_draft' then 'ai.diet_draft' when 'consultation_support' then 'ai.consultation_support'
     else 'ai.unsupported' end)::boolean,false)
$$;

revoke all on function private.ai_live_pilot_eligible(uuid),private.ai_feature_allowed(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.ai_live_pilot_eligible(uuid),private.ai_feature_allowed(uuid,text) to service_role;

-- The shared ledger checks plan entitlements before config/reservation/claim.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('public.ai_server(text,uuid,jsonb)'::regprocedure);
  amended:=replace(definition,
    'when ''diet_draft'' then ''ai.diet_draft'' else ''ai.unsupported'' end',
    'when ''diet_draft'' then ''ai.diet_draft'' when ''consultation_support'' then ''ai.consultation_support'' else ''ai.unsupported'' end');
  if amended=definition then raise exception 'ai_server_entitlement_patch_failed'; end if;
  execute amended;
end $$;

create or replace function private.ai_live_pilot_policy_valid()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select production_enabled and production_daily_credits>0 and production_daily_generations between 1 and 1000
 from private.ai_live_pilot_configuration where id),false)
 and not exists(select 1 from private.ai_feature_config where enabled and (feature not in ('recall_24h','pes_diagnosis','diet_draft','consultation_support') or execution_mode<>'real'))
 and exists(select 1 from pg_proc where oid='private.ai_feature_allowed(uuid,text)'::regprocedure
   and position('ai_processing_consents' in prosrc)>0 and position('resolve_effective_entitlements' in prosrc)>0)
$$;
revoke all on function private.ai_live_pilot_policy_valid() from public,anon,authenticated,service_role;
grant execute on function private.ai_live_pilot_policy_valid() to service_role;

-- Keep server supplied context as the source of truth. Include the structured
-- narrative fields and recent numeric history, bounded to protect latency/cost.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('public.ai_clinical_source(uuid,uuid,uuid,integer)'::regprocedure);
  amended:=replace(definition,
    '''medical_changes'',''indicators_reviewed'',''barriers'',''adjustments'',''professional_notes''])',
    '''medical_changes'',''indicators_reviewed'',''barriers'',''adjustments'',''professional_notes'',''measurement_notes'',''indicator_progress'',''first_actions''])');
  if amended=definition then raise exception 'clinical_assistance_answer_keys_patch_failed'; end if;
  definition:=amended;
  amended:=replace(definition,$old$    union all
    select 'Cálculo registrado$old$,$new$    union all
    select 'Historial · ' || coalesce((select coalesce(t.display_name,t.name) from public.measurement_types t
      where t.id=h.measurement_type_id and (t.created_by is null or t.created_by=p_owner)),h.measurement_type_id),
      (h.value#>>'{}') || ' ' || coalesce(h.unit,'[unidad sin registrar]') || ' · consulta ' || h.consultation_date::date::text
      from (select m.measurement_type_id,m.value,m.unit,c.consultation_date
        from public.consultation_measurements m join public.consultations c
          on c.id=m.consultation_id and c.professional_id=m.professional_id and c.patient_id=m.patient_id
        where m.professional_id=p_owner and m.patient_id=p_patient and c.status='completed'
          and c.deleted_at is null and c.id<>p_consultation and m.data_type in ('number','percentage','ratio')
        order by c.consultation_date desc,m.measured_at desc limit 20) h
    union all
    select 'Historial calculado · ' || h.result_key || ' · ' || h.method_name,
      h.displayed_result || ' ' || h.unit || ' · consulta ' || h.consultation_date::date::text
      from (select r.result_key,r.method_name,r.displayed_result,r.unit,c.consultation_date
        from public.consultation_calculation_results r join public.consultations c
          on c.id=r.consultation_id and c.professional_id=r.professional_id and c.patient_id=r.patient_id
        where r.professional_id=p_owner and r.patient_id=p_patient and c.status='completed'
          and c.deleted_at is null and c.id<>p_consultation
        order by c.consultation_date desc,r.calculated_at desc limit 12) h
    union all
    select 'Cálculo registrado$new$);
  if amended=definition then raise exception 'clinical_assistance_history_patch_failed'; end if;
  execute amended;
end $$;

-- Include this feature's unit cost in the existing administrator cost preview.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('private.admin_commercial_costs()'::regprocedure);
  amended:=replace(definition,
    '''recall_24h'',''pes_diagnosis'',''diet_draft''',
    '''recall_24h'',''pes_diagnosis'',''diet_draft'',''consultation_support''');
  if amended=definition then raise exception 'admin_ai_cost_preview_patch_failed'; end if;
  execute amended;
end $$;

-- Readiness UI describes the permitted AI feature set; keep its policy truthful.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
  amended:=replace(definition,
    'R24h, PES y Taller según los permisos contratados.',
    'R24h, PES, Taller y objetivos de consulta según los permisos contratados.');
  if amended=definition then raise exception 'ai_readiness_description_patch_failed'; end if;
  execute amended;
end $$;
