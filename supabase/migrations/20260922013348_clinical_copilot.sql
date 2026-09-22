-- Clinical records follow the existing interview revision. PES text remains in answers.
alter table public.consultation_snapshots add column clinical_records jsonb not null default '{}'::jsonb;
-- Broad/default grants must not permit forging approved clinical metadata.
revoke update on public.consultation_snapshots from public,anon,authenticated;
grant update(id,professional_id,consultation_id,patient_id,template_id,template_name,template_version,structure,created_at,revision)
  on public.consultation_snapshots to authenticated;
alter table private.ai_generations add column clinical_revision integer;
alter table private.ai_generations add column clinical_stamp text;
update private.ai_feature_config set prompt_version = feature || '@1', enabled = false
where feature in ('pes_diagnosis','recall_24h');

create function private.copy_clinical_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.clinical_records := coalesce((select s.clinical_records from public.consultation_snapshots s
    where s.professional_id = new.professional_id and s.consultation_id = new.consultation_id
      and s.revision = new.revision - 1), '{}'::jsonb);
  return new;
end; $$;
revoke all on function private.copy_clinical_revision() from public, anon, authenticated;
create trigger copy_clinical_revision before insert on public.consultation_snapshots
for each row execute function private.copy_clinical_revision();

-- Raw context only for the server. Ownership checked before any clinical reads.
create function public.ai_clinical_source(p_owner uuid, p_patient uuid, p_consultation uuid, p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.consultation_snapshots; p public.patients; facts jsonb; stamp text;
begin
  if not exists(select 1 from public.consultations c where c.id=p_consultation and c.patient_id=p_patient
    and c.professional_id=p_owner and c.status='draft' and c.deleted_at is null)
    then raise exception 'context_unavailable'; end if;
  select * into p from public.patients where id=p_patient and professional_id=p_owner and deleted_at is null;
  if not found then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where consultation_id=p_consultation and professional_id=p_owner
    order by revision desc limit 1;
  if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
  with source as (
    select 'Entrevista · ' || replace(a.question_key,'_',' ') as source, a.value::text as finding
    from public.consultation_answers a where a.professional_id=p_owner and a.consultation_id=p_consultation and a.revision=p_revision
      and a.question_key = any(array['main_reason','expectations','consult_now','medical_history_status','medical_diagnoses_v2',
      'medication_status','medication_list_v2','appetite','digestive_screen','sleep_hours','exercise_status','recall_24h_v2',
      'usual_pattern','daily_schedule','food_reactions_status','food_reactions_v2','access_barriers','eating_drivers',
      'interview_priorities','objectives','next_objectives','changes_since_last','progress_perception','symptoms_changes',
      'medical_changes','indicators_reviewed','barriers','adjustments','professional_notes'])
      and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
    union all
    select 'Antropometría · ' || m.measurement_type_id, m.value::text || ' ' || coalesce(m.unit,'')
      from public.consultation_measurements m where m.professional_id=p_owner and m.consultation_id=p_consultation and m.patient_id=p_patient
    union all
    select 'Cálculo registrado · ' || m.result_key || ' · ' || m.method_name || ' · ' || m.method_version,
      m.displayed_result || ' ' || m.unit || ' · calculado ' || m.calculated_at::text
      from public.consultation_calculation_results m where m.professional_id=p_owner and m.consultation_id=p_consultation and m.patient_id=p_patient
      and not exists(select 1 from public.consultation_measurements newer where newer.professional_id=p_owner and newer.consultation_id=p_consultation and newer.updated_at>m.calculated_at)
    union all
    select 'Laboratorio · ' || l.analyte_name_snapshot, coalesce(l.numeric_comparator,'') || coalesce(l.numeric_value::text,l.text_value,'') || ' ' || coalesce(l.unit,'')
      from public.laboratory_results l where l.professional_id=p_owner and l.consultation_id=p_consultation and l.patient_id=p_patient
    union all
    select 'Recordatorio confirmado', (select jsonb_agg(jsonb_build_object('tiempo',i->>'mealLabel','alimento',i->'food'->>'name','cantidad',i->'quantity','unidad',i->>'unit'))::text
      from jsonb_array_elements(s.clinical_records->'recall'->'items') i) where s.clinical_records ? 'recall'
  ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'finding',finding) order by source,finding),'[]') into facts from source;
  -- Optimistic concurrency token contains revision/timestamps, never a clinical text hash.
  select md5(concat_ws('|',s.id,s.revision,s.clinical_records->>'updated_at',
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_answers a where a.professional_id=p_owner and a.consultation_id=p_consultation and a.revision=p_revision),
    (select string_agg(m.id::text || m.updated_at::text,',' order by m.id) from public.consultation_measurements m where m.professional_id=p_owner and m.consultation_id=p_consultation),
    (select string_agg(l.id::text || l.updated_at::text,',' order by l.id) from public.laboratory_results l where l.professional_id=p_owner and l.consultation_id=p_consultation),
    (select string_agg(a.id::text || a.updated_at::text,',' order by a.id) from public.consultation_calculation_results a where a.professional_id=p_owner and a.consultation_id=p_consultation))) into stamp;
  return jsonb_build_object('facts',facts,'stamp',stamp,'identifiers',jsonb_build_array(p.name,p.email,p.phone));
end; $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

create function public.ai_bind_clinical_context(p_owner uuid,p_generation uuid,p_revision integer,p_stamp text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update private.ai_generations set clinical_revision=p_revision,clinical_stamp=p_stamp
    where id=p_generation and professional_id=p_owner and status='reserved' and clinical_revision is null;
  if not found then raise exception 'context_unavailable'; end if;
end; $$;
revoke all on function public.ai_bind_clinical_context(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ai_bind_clinical_context(uuid,uuid,integer,text) to service_role;

create function private.clinical_workspace(p_consultation uuid,p_revision integer,p_kind text default null,p_payload jsonb default null,p_generation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid := (select auth.uid()); c public.consultations; s public.consultation_snapshots;
  context jsonb; audit jsonb; g private.ai_generations; item jsonb; f public.food_items; items jsonb := '[]';
  quantity numeric; unit text; portion numeric; answers jsonb; existing_answers jsonb; saved jsonb;
begin
  if owner is null then raise insufficient_privilege using message='context_unavailable'; end if;
  select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
  if not found or c.status<>'draft' then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where professional_id=owner and consultation_id=c.id order by revision desc limit 1 for update;
  if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
  context := public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
  if p_kind is null then
    return jsonb_build_object('records',s.clinical_records,'stamp',context->>'stamp','target',
      (select jsonb_build_object('energy_kcal',n.target_calories,'protein_g',n.macro_distribution->'macros'->'PROTEIN'->'grams',
        'carbohydrate_g',n.macro_distribution->'macros'->'CARBOHYDRATE'->'grams','fat_g',n.macro_distribution->'macros'->'FAT'->'grams')
        from public.nutrition_plans n where n.professional_id=owner and n.patient_id=c.patient_id and n.consultation_id=c.id and n.status<>'archived'
        order by n.updated_at desc limit 1),'readiness',jsonb_build_object(
      'interview',exists(select 1 from jsonb_array_elements(context->'facts') e where e->>'source' like 'Entrevista%'),
      'objective',exists(select 1 from jsonb_array_elements(context->'facts') e where e->>'source' like '%objectives%'),
      'anthropometry',exists(select 1 from jsonb_array_elements(context->'facts') e where e->>'source' like 'Antropometría%'),
      'laboratories',exists(select 1 from jsonb_array_elements(context->'facts') e where e->>'source' like 'Laboratorio%')));
  end if;
  if p_kind not in ('pes','recall') or p_payload is null or octet_length(p_payload::text)>80000 then raise exception 'invalid_request'; end if;
  if p_payload->>'stamp' is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
  audit := jsonb_build_object('generated_with_ai',false,'approved_at',now());
  if p_generation is not null then
    select * into g from private.ai_generations where id=p_generation and professional_id=owner
      and patient_id=c.patient_id and consultation_id=c.id and status='succeeded'
      and feature=case when p_kind='pes' then 'pes_diagnosis' else 'recall_24h' end;
    if not found or g.clinical_revision is distinct from p_revision then raise exception 'generation_unavailable'; end if;
    if p_kind='pes' and g.clinical_stamp is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
    audit := jsonb_build_object('generated_with_ai',true,'generation_id',g.id,'prompt_version',g.prompt_version,'model',g.model,'generated_at',g.started_at,'approved_at',now());
  end if;
  if p_kind='pes' then
    if jsonb_typeof(p_payload->'problem') is distinct from 'string' or jsonb_typeof(p_payload->'etiology') is distinct from 'string'
      or jsonb_typeof(p_payload->'signsSymptoms') is distinct from 'array' or jsonb_typeof(p_payload->'pesStatement') is distinct from 'string'
      or length(p_payload->>'problem')>500 or length(p_payload->>'etiology')>1500 or length(p_payload->>'pesStatement') not between 1 and 2000
      then raise exception 'invalid_request'; end if;
    answers := jsonb_build_object('pes_problem',p_payload->>'problem','pes_etiology',p_payload->>'etiology',
      'pes_evidence',(select string_agg(v, E'\n') from jsonb_array_elements_text(p_payload->'signsSymptoms') v),'pes_statement',p_payload->>'pesStatement');
    if not exists(select 1 from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q where q->>'question_key'='pes_statement')
      then raise exception 'pes_not_in_template'; end if;
    select coalesce(jsonb_object_agg(question_key,value),'{}') into existing_answers from public.consultation_answers where professional_id=owner and consultation_id=c.id and revision=p_revision;
    perform public.save_consultation_responses(c.id,p_revision,existing_answers || answers);
    saved := audit || jsonb_build_object('evidence',p_payload->'evidence','missingContext',p_payload->'missingContext','uncertainties',p_payload->'uncertainties');
  else
    if jsonb_typeof(p_payload->'narrative') is distinct from 'string' or length(p_payload->>'narrative')>8000
      or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 150 then raise exception 'invalid_request'; end if;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      select * into f from public.food_items where id=(item->>'foodId')::uuid and active and (owner_id is null or owner_id=owner);
      if not found then raise exception 'food_unavailable'; end if;
      quantity := (item->>'quantity')::numeric; unit := item->>'unit';
      if quantity is null or quantity<=0 or quantity>10000 or length(coalesce(item->>'mealLabel','')) not between 1 and 120 then raise exception 'invalid_request'; end if;
      portion := f.portion_amount;
      if f.portion_fraction is not null then portion := (f.portion_fraction->>'numerator')::numeric / (f.portion_fraction->>'denominator')::numeric; end if;
      if unit=f.portion_unit then null;
      elsif unit='g' and f.edible_grams>0 then quantity := quantity/f.edible_grams*portion;
      else raise exception 'unit_unavailable'; end if;
      -- No client or model totals accepted. Frozen catalog portion is recalculated by the existing exchange engine on reading.
      items := items || jsonb_build_array(jsonb_build_object('mealLabel',item->>'mealLabel','rawText',left(item->>'rawText',2000),
        'quantity',quantity,'unit',f.portion_unit,'food',jsonb_build_object('id',f.id,'name',f.name,'group_code',f.group_code,
        'portion_amount',portion,'portion_unit',f.portion_unit,'portion_description',f.portion_description,
        'exchange_system_code',f.exchange_system_code,'exchange_catalog_version',f.exchange_catalog_version,
        'source',f.source,'source_version',f.source_version,'is_custom',f.is_custom,'attributes',f.attributes)));
    end loop;
    saved := audit || jsonb_build_object('narrative',p_payload->>'narrative','items',items,'schema_version',1);
  end if;
  update public.consultation_snapshots set clinical_records=jsonb_set(s.clinical_records,array[p_kind],saved) || jsonb_build_object('updated_at',now()) where id=s.id;
  return saved;
end; $$;
revoke all on function private.clinical_workspace(uuid,integer,text,jsonb,uuid) from public,anon;
grant execute on function private.clinical_workspace(uuid,integer,text,jsonb,uuid) to authenticated;
create function public.clinical_workspace(p_consultation uuid,p_revision integer,p_kind text default null,p_payload jsonb default null,p_generation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
select private.clinical_workspace(p_consultation,p_revision,p_kind,p_payload,p_generation); $$;
revoke all on function public.clinical_workspace(uuid,integer,text,jsonb,uuid) from public,anon;
grant execute on function public.clinical_workspace(uuid,integer,text,jsonb,uuid) to authenticated;
