begin;
set local lock_timeout='5s';

-- Read the actual saved design instead of an outdated list of interview keys.
-- The existing loader retains its ownership/revision checks, approved recall,
-- measurements, laboratory results and the selected dated clinical history.
create or replace function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; snapshot public.consultation_snapshots; visit public.consultations;
  interview_facts jsonb; supplement_facts jsonb; planning jsonb;
begin
 result:=private.ai_clinical_source_before_working_drafts(p_owner,p_patient,p_consultation,p_revision);
 select * into visit from public.consultations where id=p_consultation and professional_id=p_owner
   and patient_id=p_patient and status='draft' and deleted_at is null;
 if not found then raise exception 'context_unavailable'; end if;
 select * into snapshot from public.consultation_snapshots where consultation_id=p_consultation
   and professional_id=p_owner and patient_id=p_patient order by revision desc limit 1;
 if snapshot.id is null or snapshot.revision<>p_revision then raise exception 'context_unavailable'; end if;

 with eligible as (
   select c.id,c.consultation_type,c.consultation_date,c.sequence_number,
     row_number() over(order by c.consultation_date desc,c.sequence_number desc,c.id desc) recency
   from public.consultations c where c.professional_id=p_owner and c.patient_id=p_patient
     and c.status='completed' and c.deleted_at is null
     and (c.consultation_date,c.sequence_number,c.id)<(visit.consultation_date,visit.sequence_number,visit.id)
 ), selected as (
   select id from eligible where recency<=3 or id=(select id from eligible where consultation_type='initial'
     order by consultation_date,sequence_number,id limit 1)
 ), relevant_snapshots as (
   select distinct on (s.consultation_id) s.*,c.consultation_date,c.id=visit.id is_current
   from public.consultation_snapshots s join public.consultations c on c.id=s.consultation_id
     and c.professional_id=s.professional_id and c.patient_id=s.patient_id
   where s.professional_id=p_owner and s.patient_id=p_patient and (c.id=visit.id or c.id in(select id from selected))
   order by s.consultation_id,s.revision desc
 ), interview as (
   select s.is_current,s.consultation_date,q->>'question_key' question_key,q->>'label' label,a.value
   from relevant_snapshots s
   cross join lateral jsonb_array_elements(s.structure->'sections') section
   cross join lateral jsonb_array_elements(section->'questions') q
   join public.consultation_answers a on a.consultation_id=s.consultation_id and a.professional_id=p_owner
     and a.patient_id=p_patient and a.revision=s.revision and a.question_key=q->>'question_key'
   -- Do not add generated diagnoses, goals or patient directions as new
   -- interview evidence. Existing decision context for other AI features stays
   -- in the base loader. Keep professional clinical notes and custom questions.
   where a.question_key !~ '^(pes_|recall_|followup_)'
     and a.question_key not in ('objectives','treatment_objective','next_objectives','first_actions',
       'recommendations','patient_instructions','next_appointment')
     and a.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)
 ), facts as (
   select is_current,consultation_date,jsonb_build_object(
     'source',case when is_current then 'Entrevista · ' else 'Antecedente de entrevista · ' || consultation_date::date::text || ' · ' end
       || replace(question_key,'_',' ') || ' · ' || coalesce(label,question_key),
     'finding',value::text,'question_key',question_key,'consultation_date',consultation_date::date
   ) fact from interview
 ), supplements as (
   select s.is_current,s.consultation_date,jsonb_build_object(
     'source',case when s.is_current then 'Entrevista · ' else 'Antecedente de entrevista · ' || s.consultation_date::date::text || ' · ' end
       || 'Complemento clínico para PES',
     'finding',btrim(s.working_drafts->>'pes-clinical-context'),
     'question_key','pes-clinical-context','consultation_date',s.consultation_date::date
   ) fact from relevant_snapshots s
   where jsonb_typeof(s.working_drafts->'pes-clinical-context')='string'
     and nullif(btrim(s.working_drafts->>'pes-clinical-context'),'') is not null
 )
 select coalesce((select jsonb_agg(fact order by is_current desc,consultation_date,fact->>'source') from facts),'[]'::jsonb),
   coalesce((select jsonb_agg(fact order by is_current desc,consultation_date) from supplements),'[]'::jsonb)
 into interview_facts,supplement_facts;

 result:=jsonb_set(result,'{facts}',coalesce((select jsonb_agg(f) from jsonb_array_elements(result->'facts') f
   where not exists(select 1 from jsonb_array_elements(interview_facts) updated where updated->>'source'=f->>'source')),'[]'::jsonb)
   || interview_facts || supplement_facts);
 planning:=private.consultation_planning_objective(snapshot.working_drafts,snapshot.clinical_records,result->'approvedPes');
 -- Only clinical content participates in the stamp, never navigation or an
 -- unrelated working draft. A saved clarification changes the actual context.
 return result||jsonb_build_object('planningObjective',planning,
   'stamp',md5((result->>'stamp')||coalesce(planning::text,'')||interview_facts::text||supplement_facts::text));
end $$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer) to service_role;

-- Editing a clinical clarification requires the same professional re-review as
-- editing an interview answer. Other checkpoint writes do not affect approval.
create function private.review_changed_pes_context() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.working_drafts->'pes-clinical-context' is distinct from old.working_drafts->'pes-clinical-context'
   and coalesce(new.working_drafts->>'pes-clinical-context','') is distinct from coalesce(old.working_drafts->>'pes-clinical-context','')
   and exists(select 1 from public.consultations c where c.id=new.consultation_id
     and c.professional_id=new.professional_id and c.patient_id=new.patient_id and c.status='draft' and c.deleted_at is null) then
   new.clinical_records:=new.clinical_records-'pes'-'objective';
 end if;
 return new;
end $$;
revoke all on function private.review_changed_pes_context() from public,anon,authenticated,service_role;
create trigger review_changed_pes_context before update of working_drafts on public.consultation_snapshots
for each row execute function private.review_changed_pes_context();

commit;
