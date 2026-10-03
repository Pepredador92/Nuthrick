-- Synthetic records only. All changes are rolled back; no AI calls or credits.
begin;
do $$
declare pro uuid; pat uuid; other_pat uuid; current_visit uuid; initial_visit uuid; visit uuid;
  before_stamp text; context jsonb; payload jsonb; rejected boolean; empty_value text; i integer;
begin
  select id into pro from public.professional_profiles
    where private.can_use_feature(id,'consultations') and private.can_use_feature(id,'patients') order by id limit 1;
  if pro is null then raise exception 'No eligible fixture owner'; end if;
  perform set_config('request.jwt.claim.sub',pro::text,true);
  insert into public.patients(professional_id,full_name) values(pro,'SYNTHETIC PES history') returning id into pat;
  insert into public.patients(professional_id,full_name) values(pro,'SYNTHETIC other') returning id into other_pat;
  for i in 0..9 loop
    insert into public.consultations(professional_id,patient_id,consultation_date,sequence_number,consultation_type,status,deleted_at)
    values(pro,case when i=9 then other_pat else pat end,
      '2026-01-01'::timestamptz+i*interval '1 day',i,case when i=0 then 'initial' else 'follow_up' end,
      case when i=7 then 'draft' when i=5 then 'cancelled' else 'completed' end,
      case when i=6 then now() else null end) returning id into visit;
    if i=0 then initial_visit:=visit; end if;
    if i=7 then current_visit:=visit; end if;
    insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
      values(pro,case when i=9 then other_pat else pat end,visit,1,'Synthetic',1,
        '{"sections":[{"section_key":"synthetic","questions":[{"question_key":"pes_problem","question_type":"long_text","response_area":"professional_assessment"},{"question_key":"pes_etiology","question_type":"long_text","response_area":"professional_assessment"},{"question_key":"pes_evidence","question_type":"long_text","response_area":"professional_assessment"},{"question_key":"pes_statement","question_type":"long_text","response_area":"professional_assessment"},{"question_key":"barriers","label":"Barrera registrada","question_type":"long_text","response_area":"professional_assessment"}]}]}');
    insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,section_key,response_area,question_key,value)
      values(pro,case when i=9 then other_pat else pat end,visit,1,'synthetic','professional_assessment','barriers',to_jsonb('history-'||i));
  end loop;
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
    select professional_id,patient_id,consultation_id,2,template_name,template_version,structure
      from public.consultation_snapshots where consultation_id=initial_visit;
  insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,section_key,response_area,question_key,value)
    values(pro,pat,initial_visit,2,'synthetic','professional_assessment','barriers','"initial revised; hypothesis pending confirmation"'),
      (pro,pat,initial_visit,2,'synthetic','professional_assessment','pes_etiology','"approved historical hypothesis"'),
      (pro,pat,current_visit,1,'synthetic','professional_assessment','adherence','"partial"'),
      (pro,pat,current_visit,1,'synthetic','professional_assessment','symptom_detail','"improved"'),
      (pro,pat,current_visit,1,'synthetic','professional_assessment','diagnosis_status','"improving"'),
      (pro,pat,current_visit,1,'synthetic','professional_assessment','pes_etiology','"unapproved current output"');
  update public.consultation_snapshots set clinical_records='{"pes":{"approved_at":"2026-01-01"}}'
    where consultation_id=initial_visit and revision=2;
  context:=public.ai_clinical_source(pro,pat,current_visit,1);
  if jsonb_array_length(context->'facts')<>9 then raise exception 'Unexpected fact count: %',jsonb_array_length(context->'facts'); end if;
  if context::text like '%history-0%' or context::text like '%history-1%' or context::text like '%history-5%'
    or context::text like '%history-6%' or context::text like '%history-8%' or context::text like '%history-9%'
    or context::text like '%unapproved current output%' then raise exception 'Excluded context leaked'; end if;
  if not exists(select 1 from jsonb_array_elements(context->'facts') f where f->>'source' like 'Antecedente de entrevista · 2026-01-01%'
    and f->>'finding' like '%initial revised%') then raise exception 'Initial latest revision missing'; end if;
  if not exists(select 1 from jsonb_array_elements(context->'facts') f where f->>'source' like 'PES previo aprobado · 2026-01-01%')
    then raise exception 'Approved history missing'; end if;
  before_stamp:=context->>'stamp';
  -- Reopened historical interviews create a new revision. A single transaction
  -- has one now() timestamp, so use the revision as the concurrency change here.
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
    select professional_id,patient_id,consultation_id,3,template_name,template_version,structure
      from public.consultation_snapshots where consultation_id=initial_visit and revision=2;
  insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,section_key,response_area,question_key,value)
    select professional_id,patient_id,consultation_id,3,section_key,response_area,question_key,value
      from public.consultation_answers where consultation_id=initial_visit and revision=2;
  update public.consultation_answers set value='"updated historical barrier"',updated_at=clock_timestamp()
    where consultation_id=initial_visit and revision=3 and question_key='barriers';
  if before_stamp=(public.ai_clinical_source(pro,pat,current_visit,1)->>'stamp') then raise exception 'History edit did not invalidate stamp'; end if;
  payload:=jsonb_build_object('stamp',before_stamp,'problem','Recorded problem','etiology','Professionally reviewed factor',
    'signsSymptoms',jsonb_build_array('Recorded evidence'),'pesStatement','Reviewed statement');
  rejected:=false;
  begin perform public.clinical_workspace(current_visit,1,'pes',payload);
  exception when others then if sqlerrm='context_changed' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'Stale approval allowed'; end if;
  payload:=payload||jsonb_build_object('stamp',public.ai_clinical_source(pro,pat,current_visit,1)->>'stamp');
  foreach empty_value in array array['',' ',E'\n\t'] loop
    rejected:=false;
    begin perform public.clinical_workspace(current_visit,1,'pes',payload||jsonb_build_object('etiology',empty_value));
    exception when others then if sqlerrm='invalid_request' then rejected:=true; else raise; end if; end;
    if not rejected then raise exception 'Empty etiology approved'; end if;
  end loop;
  perform public.clinical_workspace(current_visit,1,'pes',payload);
  if not exists(select 1 from public.consultation_snapshots where consultation_id=current_visit and clinical_records ? 'pes')
    then raise exception 'Complete manual PES was not approved'; end if;
  before_stamp:=public.ai_clinical_source(pro,pat,current_visit,1)->>'stamp';
  update public.consultations set status='draft' where id=initial_visit;
  context:=public.ai_clinical_source(pro,pat,current_visit,1);
  if before_stamp=context->>'stamp' or context::text like '%updated historical barrier%' then raise exception 'Reopened history retained'; end if;
  rejected:=false;
  begin perform public.ai_clinical_source(gen_random_uuid(),pat,current_visit,1);
  exception when others then if sqlerrm='context_unavailable' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'Cross-owner context allowed'; end if;
  if has_function_privilege('anon','public.ai_clinical_source(uuid,uuid,uuid,integer)','execute')
    or has_function_privilege('authenticated','public.ai_clinical_source(uuid,uuid,uuid,integer)','execute')
    then raise exception 'Raw source exposed'; end if;
end $$;
rollback;
select 'PES history and approval checks passed; all fixtures rolled back' as result;
