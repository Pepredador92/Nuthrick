-- Additional assertions share the portal runner's synthetic transaction.
select pg_temp.assert((select s.display_order=15 and q.question_type='long_text' and not q.is_required and q.response_area='professional_assessment'
 from public.consultation_template_sections s join public.consultation_template_questions q on q.section_id=s.id
 where q.question_key='treatment_objective'),'Simple objective must follow PES');
select pg_temp.assert((select version=2 from public.consultation_templates where template_key='system_follow_up_v1'),'Follow-up version changed');
select pg_temp.assert((select count(*)=1 from public.consultation_template_questions where question_key='next_objectives'),'Follow-up question changed');
do $$
declare owner jsonb:='{"owner":"00000000-0000-0000-0000-000000000001","patientId":"10000000-0000-0000-0000-000000000001"}';
 cid uuid; goals jsonb; previous_shared jsonb;
begin
 previous_shared:=public.patient_portal('view',owner)->'shared';
 insert into public.consultations(id,professional_id,patient_id,status,consultation_date,consultation_type)
 values(gen_random_uuid(),(owner->>'owner')::uuid,(owner->>'patientId')::uuid,'draft','2026-09-22','initial') returning id into cid;
 insert into public.consultation_snapshots select id,patient_id,professional_id,1,
 '{"sections":[{"questions":[{"question_key":"treatment_objective","response_area":"professional_assessment"}]}]}' from public.consultations where id=cid;
 insert into public.consultation_answers select id,patient_id,professional_id,1,'treatment_objective','professional_assessment','"Objetivo inicial nuevo"' from public.consultations where id=cid;
 perform pg_temp.assert(not exists(select 1 from private.portal_goals((owner->>'patientId')::uuid,(owner->>'owner')::uuid) where "consultationId"=cid),'Draft offered');
 update public.consultations set status='completed' where id=cid;
 goals:=public.patient_portal('goal_candidates',owner)->'goals';
 perform pg_temp.assert(goals->0->>'content'='Objetivo inicial nuevo' and goals->0->>'questionKey'='treatment_objective','Initial objective not persisted/read');
 insert into public.consultations(id,professional_id,patient_id,status,consultation_date,consultation_type)
 values(gen_random_uuid(),(owner->>'owner')::uuid,(owner->>'patientId')::uuid,'completed','2026-09-23','follow_up') returning id into cid;
 insert into public.consultation_snapshots select id,patient_id,professional_id,1,
 '{"sections":[{"questions":[{"question_key":"next_objectives","response_area":"professional_assessment"}]}]}' from public.consultations where id=cid;
 insert into public.consultation_answers select id,patient_id,professional_id,1,'next_objectives','professional_assessment','[{"objetivo":"Acuerdo de seguimiento"}]' from public.consultations where id=cid;
 goals:=public.patient_portal('goal_candidates',owner)->'goals';
 perform pg_temp.assert(goals->0->>'content'='Acuerdo de seguimiento','Temporal priority failed');
 perform pg_temp.assert(public.patient_portal('view',owner)->'shared'=previous_shared,'Closing silently published objective');
 update public.consultation_answers set value='"   "' where consultation_id=cid;
 goals:=public.patient_portal('goal_candidates',owner)->'goals';
 perform pg_temp.assert(goals->0->>'content'='Objetivo inicial nuevo','Blank newer objective should fall back to prior consultation');
 update public.consultation_answers set value='null' where consultation_id=cid;
 perform pg_temp.assert(public.patient_portal('goal_candidates',owner)->'goals'=goals,'Null objective unsafe');
 perform pg_temp.assert(exists(select 1 from public.consultation_answers where question_key='treatment_objective' and value='"Objetivo inicial nuevo"'),'History overwritten');
end $$;
select 'Initial treatment objective: OK';
-- Exercise the actual production save RPC, not an emulated persistence helper.
create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
alter table public.consultation_snapshots add column id uuid default gen_random_uuid();
alter table public.consultation_answers add column section_key text;
alter table public.consultation_answers add unique(professional_id,consultation_id,revision,question_key);
-- SAVE RESPONSES FUNCTION --
do $$
declare cid uuid:=gen_random_uuid(); patient uuid:='10000000-0000-0000-0000-000000000001';
begin
 insert into public.consultations(id,professional_id,patient_id,status,consultation_type)
 values(cid,auth.uid(),patient,'draft','initial');
 insert into public.consultation_snapshots(consultation_id,patient_id,professional_id,revision,structure)
 values(cid,patient,auth.uid(),1,'{"sections":[{"section_key":"treatment_objective","questions":[{"question_key":"treatment_objective","response_area":"professional_assessment"}]}]}');
 perform public.save_consultation_responses(cid,1,'{"treatment_objective":"Objetivo persistido"}');
 update public.consultations set status='completed' where id=cid;
 perform pg_temp.assert(exists(select 1 from public.consultation_answers where consultation_id=cid and revision=1 and section_key='treatment_objective' and value='"Objetivo persistido"'),'Save/close lost objective');
 perform pg_temp.reject(format('select public.save_consultation_responses(%L,1,%L)',cid,'{"treatment_objective":"No permitido"}'));
 perform pg_temp.assert(exists(select 1 from private.portal_goals(patient,auth.uid()) where "consultationId"=cid and content='Objetivo persistido'),'Saved objective not shareable');
end $$;
