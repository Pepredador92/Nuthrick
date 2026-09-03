begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

select ok(not has_function_privilege('anon', 'public.reopen_consultation_for_edit(uuid)', 'execute'), 'anonymous callers cannot reopen consultations');
select ok(not has_function_privilege('anon', 'public.delete_consultation_record(uuid)', 'execute'), 'anonymous callers cannot delete consultations');

insert into auth.users(id,email) values
  ('94000000-0000-4000-8000-000000000001','editing-owner@nuthrick.test'),
  ('95000000-0000-4000-8000-000000000002','editing-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
insert into public.patients(id,full_name) values ('96000000-0000-4000-8000-000000000003','Editing test fixture');

select lives_ok($$select public.start_consultation_draft('96000000-0000-4000-8000-000000000003','initial')$$, 'starts an owned consultation');
select lives_ok($$select public.adopt_consultation_template((select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'),(select id from public.consultation_templates where template_key='system_initial_v2'),0)$$, 'creates the initial snapshot');
select lives_ok($$select public.save_consultation_responses((select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'),1,'{"main_reason":"Seguimiento de hábitos"}')$$, 'saves an answer before closing');
update public.consultations set status='completed', completed_at=now() where patient_id='96000000-0000-4000-8000-000000000003';
select lives_ok($$select public.reopen_consultation_for_edit((select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'))$$, 'reopens a completed consultation');
select is((select status from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'),'draft','reopened consultation becomes a draft');
select is((select max(revision) from public.consultation_snapshots where consultation_id=(select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003')),2,'reopening keeps the prior revision');
select is((select value from public.consultation_answers where consultation_id=(select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003') and question_key='main_reason' and revision=2),'"Seguimiento de hábitos"'::jsonb,'reopened revision preserves answers');

select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.delete_consultation_record((select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'))$$,'42501','Consultation unavailable','another professional cannot delete a consultation');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.delete_consultation_record((select id from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'))$$, 'owner can delete a consultation');
select is((select count(*) from public.consultations where patient_id='96000000-0000-4000-8000-000000000003'),0::bigint,'deleting removes the consultation');
select is((select count(*) from public.consultation_snapshots where patient_id='96000000-0000-4000-8000-000000000003'),0::bigint,'deleting removes its snapshots');

select * from finish();
rollback;
