-- Local-only review iteration. Separate professional approvals; no AI objective,
-- energy calculation, menu generation or publication is performed here.
create function private.invalidate_clinical_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data public.consultation_answers;
begin
  if TG_OP='UPDATE' and new.value is not distinct from old.value then return new; end if;
  if TG_OP='DELETE' then row_data:=old; else row_data:=new; end if;
  -- Only the editable draft revision is affected. Historical approvals stay intact.
  update public.consultation_snapshots s set clinical_records =
    case when row_data.question_key in ('objectives','treatment_objective','next_objectives')
      then s.clinical_records - 'objective'
      else s.clinical_records - 'pes' - 'objective' end
  where s.consultation_id=row_data.consultation_id and s.professional_id=row_data.professional_id
    and s.revision=row_data.revision and exists(select 1 from public.consultations c
      where c.id=s.consultation_id and c.professional_id=s.professional_id and c.status='draft' and c.deleted_at is null);
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.invalidate_clinical_approval() from public,anon,authenticated;
create trigger invalidate_clinical_approval after insert or update or delete on public.consultation_answers
for each row execute function private.invalidate_clinical_approval();

create function private.invalidate_measured_clinical_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb;
begin
  if TG_OP='UPDATE' and (to_jsonb(new)-'updated_at') is not distinct from (to_jsonb(old)-'updated_at') then return new; end if;
  if TG_OP='DELETE' then data:=to_jsonb(old); else data:=to_jsonb(new); end if;
  update public.consultation_snapshots s set clinical_records=clinical_records-'pes'-'objective'
    where s.consultation_id=(data->>'consultation_id')::uuid and s.professional_id=(data->>'professional_id')::uuid
    and s.revision=(select max(v.revision) from public.consultation_snapshots v where v.consultation_id=s.consultation_id and v.professional_id=s.professional_id)
    and exists(select 1 from public.consultations c where c.id=s.consultation_id and c.professional_id=s.professional_id and c.status='draft' and c.deleted_at is null);
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.invalidate_measured_clinical_approval() from public,anon,authenticated;
create trigger invalidate_measured_clinical_approval after insert or update or delete on public.consultation_measurements for each row execute function private.invalidate_measured_clinical_approval();
create trigger invalidate_lab_clinical_approval after insert or update or delete on public.laboratory_results for each row execute function private.invalidate_measured_clinical_approval();
create trigger invalidate_calculation_clinical_approval after insert or update or delete on public.consultation_calculation_results for each row execute function private.invalidate_measured_clinical_approval();

-- Human-readable measurement names and recorded timestamps; no inferred units
-- and no recalculation by the language model.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('public.ai_clinical_source(uuid,uuid,uuid,integer)'::regprocedure);
  amended:=replace(definition,
    '''Antropometría · '' || m.measurement_type_id, m.value::text || '' '' || coalesce(m.unit,'''')',
    '''Antropometría · '' || coalesce((select coalesce(t.display_name,t.name) from public.measurement_types t where t.id=m.measurement_type_id and (t.created_by is null or t.created_by=p_owner)),m.measurement_type_id),
      (m.value#>>''{}'') || '' '' || coalesce(m.unit,''[unidad sin registrar]'') || '' · medición '' || m.measured_at::text');
  if amended=definition then raise exception 'Unexpected measurement context definition'; end if;
  amended:=replace(amended,'''Entrevista · '' || replace(a.question_key,''_'','' '')',
    '''Entrevista · '' || replace(a.question_key,''_'','' '') || coalesce((select '' · '' || (q->>''label'') from jsonb_array_elements(s.structure->''sections'') sec cross join lateral jsonb_array_elements(sec->''questions'') q where q->>''question_key''=a.question_key limit 1),'''')');
  amended:=replace(amended,'coalesce(l.numeric_value::text,l.text_value,'''')','coalesce(l.numeric_value::text,nullif(btrim(l.text_value),''''))');
  amended:=replace(amended,'order by source,finding),''[]'') into facts',
    'order by source,finding) filter(where nullif(btrim(finding),'''') is not null),''[]'') into facts');
  execute amended;
end; $$;

-- Keep existing authorization, context binding and ledger logic. Never restore
-- approvals removed by the answer trigger from a stale pre-save snapshot.
do $$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
  amended:=replace(definition,
    'jsonb_set(s.clinical_records,array[p_kind],saved)',
    'jsonb_set(case when p_kind=''pes'' then clinical_records - ''objective'' else clinical_records - ''pes'' - ''objective'' end,array[p_kind],saved)');
  if amended=definition then raise exception 'Unexpected clinical workspace definition'; end if;
  amended:=replace(amended,
    'or length(p_payload->>''problem'')>500',
    'or length(btrim(p_payload->>''problem'')) not between 1 and 500
      or jsonb_array_length(p_payload->''signsSymptoms'') not between 1 and 30
      or exists(select 1 from jsonb_array_elements(p_payload->''signsSymptoms'') e where jsonb_typeof(e)<>''string'' or length(btrim(e#>>''{}'')) not between 1 and 2000)');
  execute amended;
end; $$;

create function private.clinical_objective(p_consultation uuid,p_revision integer,p_action text default 'read',p_stamp text default null,p_question_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots;
  w jsonb; context jsonb; answers jsonb; goal_value jsonb; goal_text text; approved jsonb;
begin
  if owner is null then raise exception 'context_unavailable' using errcode='42501'; end if;
  select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
  if not found or c.status<>'draft' then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner order by revision desc limit 1 for update;
  if s.id is null or s.revision<>p_revision then raise exception 'context_unavailable'; end if;
  w:=private.clinical_workspace(c.id,p_revision);
  context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
  select coalesce(jsonb_object_agg(question_key,value),'{}') into answers from public.consultation_answers
    where consultation_id=c.id and professional_id=owner and revision=p_revision;
  if p_action='approve' then
    if p_stamp is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
    if not(s.clinical_records ? 'pes') then raise exception 'pes_approval_required'; end if;
    if p_question_key is null or p_question_key not in ('objectives','treatment_objective','next_objectives') or not exists(
      select 1 from jsonb_array_elements(s.structure->'sections') sec cross join lateral jsonb_array_elements(sec->'questions') q
      where q->>'question_key'=p_question_key) then raise exception 'invalid_request'; end if;
    goal_value:=answers->p_question_key;
    if jsonb_typeof(goal_value)='string' then goal_text:=btrim(goal_value#>>'{}');
    elsif jsonb_typeof(goal_value)='array' and jsonb_array_length(goal_value) between 1 and 30
      and not exists(select 1 from jsonb_array_elements(goal_value) e where jsonb_typeof(e)<>'string' or btrim(e#>>'{}')='') then
      select string_agg(v,E'\n') into goal_text from jsonb_array_elements_text(goal_value) v;
    else raise exception 'invalid_request'; end if;
    if goal_text is null or length(goal_text) not between 1 and 12000 then raise exception 'invalid_request'; end if;
    approved:=jsonb_build_object('approved_at',clock_timestamp(),'question_key',p_question_key,'value',goal_value,
      'content',goal_text,'pes_approved_at',s.clinical_records->'pes'->>'approved_at','pes_statement',answers->>'pes_statement',
      'revision',p_revision,'generated_with_ai',false);
    update public.consultation_snapshots set clinical_records=jsonb_set(clinical_records,'{objective}',approved) where id=s.id;
  elsif p_action='revoke' then
    if p_stamp is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
    update public.consultation_snapshots set clinical_records=clinical_records-'objective' where id=s.id;
  elsif p_action<>'read' or p_action is null then raise exception 'invalid_request'; end if;
  select * into s from public.consultation_snapshots where id=s.id;
  return jsonb_build_object('stamp',context->>'stamp','facts',context->'facts','target',w->'target',
    'pes',case when s.clinical_records ? 'pes' then jsonb_build_object('approved_at',s.clinical_records->'pes'->>'approved_at',
      'problem',answers->>'pes_problem','etiology',answers->>'pes_etiology','signsSymptoms',answers->>'pes_evidence','pesStatement',answers->>'pes_statement') else null end,
    'objective',s.clinical_records->'objective');
end; $$;
revoke all on function private.clinical_objective(uuid,integer,text,text,text) from public,anon;
grant execute on function private.clinical_objective(uuid,integer,text,text,text) to authenticated;
create function public.clinical_objective(p_consultation uuid,p_revision integer,p_action text default 'read',p_stamp text default null,p_question_key text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.clinical_objective(p_consultation,p_revision,p_action,p_stamp,p_question_key);
$$;
revoke all on function public.clinical_objective(uuid,integer,text,text,text) from public,anon;
grant execute on function public.clinical_objective(uuid,integer,text,text,text) to authenticated;
