begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(30);

select ok(not has_function_privilege('anon', 'public.adopt_consultation_template(uuid,uuid,integer)', 'execute'), 'anonymous callers cannot upgrade drafts');
select ok(not has_function_privilege('anon', 'public.save_consultation_responses(uuid,integer,jsonb)', 'execute'), 'anonymous callers cannot save answers');
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','interview-owner@nuthrick.test'),
 ('92000000-0000-4000-8000-000000000002','interview-other@nuthrick.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into public.patients(id,full_name) values ('93000000-0000-4000-8000-000000000003','Interview test fixture');

select lives_ok($$select public.start_consultation_draft('93000000-0000-4000-8000-000000000003','initial')$$, 'starts a draft');
select lives_ok($$select public.start_consultation_draft('93000000-0000-4000-8000-000000000003','initial')$$, 'reopening is idempotent');
select is((select count(*) from public.consultations),1::bigint,'only one draft is created');
select lives_ok($$select public.copy_consultation_template((select id from public.consultation_templates where template_key='system_initial_v1'),'interview-test-personal')$$,'copies legacy template atomically with explicit owner');
select is((select count(*) from public.consultation_template_sections where template_id=(select id from public.consultation_templates where template_key='interview-test-personal')),
  (select count(*) from public.consultation_template_sections where template_id=(select id from public.consultation_templates where template_key='system_initial_v1')),'copies every section');
select lives_ok($$select public.adopt_consultation_template((select id from public.consultations limit 1),(select id from public.consultation_templates where template_key='interview-test-personal'),0)$$,'creates a first snapshot');
select lives_ok($$select public.save_consultation_responses((select id from public.consultations limit 1),1,'{"main_reason":"Mejorar hábitos","clinical_notes":"Original private note","unrecognized_key":"ignored"}')$$,'saves recognized answers');
select is((select count(*) from public.consultation_answers where question_key='unrecognized_key'),0::bigint,'ignores fabricated question keys');
select lives_ok($$select public.adopt_consultation_template((select id from public.consultations limit 1),(select id from public.consultation_templates where template_key='system_initial_v2'),1)$$,'explicit upgrade creates a revision');
select is((select count(*) from public.consultation_snapshots),2::bigint,'keeps both snapshots');
select is((select value from public.consultation_answers where question_key='clinical_notes' and revision=1),'"Original private note"'::jsonb,'old answers remain intact');
select is((select value from public.consultation_answers where question_key='main_reason' and revision=2),'"Mejorar hábitos"'::jsonb,'copies a compatible choice');
select throws_ok($$select public.save_consultation_responses((select id from public.consultations limit 1),1,'{"main_reason":"old tab overwrite"}')$$,'P0001','The questionnaire changed. Reload before saving.','rejects stale writes');
select lives_ok($$update public.consultation_answers set value='"changed"' where revision=1$$,'old answer update is filtered by RLS');
select is((select value from public.consultation_answers where question_key='clinical_notes' and revision=1),'"Original private note"'::jsonb,'archived revision is read-only even while draft');
select lives_ok($$select public.save_consultation_responses((select id from public.consultations limit 1),2,'{"medical_history_status":"No","interview_notes":"New note"}')$$,'new answers save in current revision');

select lives_ok($$select public.copy_consultation_template((select id from public.consultation_templates where template_key='system_initial_v2'),'interview-test-new-copy')$$,'creates another independent personal template');
select lives_ok($$select public.set_consultation_template_default((select id from public.consultation_templates where template_key='interview-test-new-copy'))$$,'the professional explicitly chooses the default');
select is((select count(*) from public.consultation_templates where is_default),1::bigint,'exactly one personal default remains');
select lives_ok($$select public.save_consultation_template(t.id,t.updated_at,
  (select jsonb_agg(to_jsonb(s) || jsonb_build_object(
    'display_order',(select max(s2.display_order) from public.consultation_template_sections s2 where s2.template_id=t.id)-s.display_order,
    'is_active',s.display_order<>(select min(s2.display_order) from public.consultation_template_sections s2 where s2.template_id=t.id)
  )) from public.consultation_template_sections s where s.template_id=t.id),
  (select jsonb_agg(to_jsonb(q)) from public.consultation_template_questions q join public.consultation_template_sections s on s.id=q.section_id where s.template_id=t.id))
  from public.consultation_templates t where t.template_key='interview-test-new-copy'$$,'saving and reordering an entire private template is atomic');
select is(
  (select version from public.consultation_templates where template_key='interview-test-new-copy'),
  2,
  'editing increments the private version'
);
select is((select count(*) from public.consultation_template_sections s join public.consultation_templates t on t.id=s.template_id where t.template_key='interview-test-new-copy' and not s.is_active),1::bigint,'disabled sections are retained');
select throws_ok($$select public.save_consultation_template(t.id,t.updated_at,'[]','[]') from public.consultation_templates t where t.template_key='system_initial_v2'$$,'42501','Private template unavailable','system templates cannot be edited');

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.consultation_snapshots),0::bigint,'another professional cannot read snapshots');
select is((select count(*) from public.consultation_answers),0::bigint,'another professional cannot read answers');
select throws_ok($$select public.start_consultation_draft('93000000-0000-4000-8000-000000000003','initial')$$,'42501','Patient unavailable','another professional cannot start work on this patient');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update public.consultations set status='completed' where patient_id='93000000-0000-4000-8000-000000000003';
select throws_ok($$select public.adopt_consultation_template((select id from public.consultations limit 1),(select id from public.consultation_templates where template_key='system_initial_v2'),2)$$,'42501','Only an owned draft can be updated','completed consultations cannot be upgraded');
select throws_ok($$select public.save_consultation_responses((select id from public.consultations limit 1),2,'{"interview_notes":"overwrite completed"}')$$,'42501','Only an owned draft can be saved','completed answers cannot be overwritten');
select * from finish();
rollback;
