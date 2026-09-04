begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);

select ok(
  not has_function_privilege(
    'anon',
    'public.set_consultation_template_default(uuid)',
    'execute'
  ),
  'anonymous callers cannot change template defaults'
);

insert into auth.users(id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'template-owner@nuthrick.test'),
  ('c2000000-0000-4000-8000-000000000002', 'template-other@nuthrick.test');
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c1000000-0000-4000-8000-000000000001',
  true
);
insert into public.patients(id, full_name)
values ('c3000000-0000-4000-8000-000000000003', 'Paciente deportivo');

select lives_ok($$
  select public.copy_consultation_template(
    (select id from public.consultation_templates where template_key = 'system_initial_v2'),
    'catalog-sports'
  )
$$, 'copies a system template for the professional');

select isnt(
  (select professional_id from public.consultation_templates where template_key = 'catalog-sports'),
  null::uuid,
  'the copy has an explicit owner'
);
select is(
  (select is_default from public.consultation_templates where template_key = 'catalog-sports'),
  false,
  'a new copy does not silently replace the default'
);
select ok(
  (select description is not null and estimated_duration_minutes is not null
   from public.consultation_templates where template_key = 'catalog-sports'),
  'description and duration are copied'
);

select lives_ok($$
  select public.save_consultation_template_details(
    t.id,
    t.updated_at,
    '{"name":"Consulta inicial deportiva","description":"Actividad, rendimiento y recuperación.","estimated_duration_minutes":75,"display_order":4}'::jsonb,
    (select jsonb_agg(to_jsonb(s) order by s.display_order)
     from public.consultation_template_sections s where s.template_id = t.id),
    (select jsonb_agg(to_jsonb(q) order by q.display_order)
     from public.consultation_template_questions q
     join public.consultation_template_sections s on s.id = q.section_id
     where s.template_id = t.id)
  )
  from public.consultation_templates t where t.template_key = 'catalog-sports'
$$, 'saves metadata and content atomically');

select is(
  (select name from public.consultation_templates where template_key = 'catalog-sports'),
  'Consulta inicial deportiva',
  'the real professional name is retained'
);
select is(
  (select estimated_duration_minutes from public.consultation_templates where template_key = 'catalog-sports'),
  75,
  'duration metadata is retained'
);

select lives_ok($$
  insert into public.consultation_template_sections(
    template_id, section_key, title, description, display_order
  )
  select id, 'training', 'Entrenamiento', 'Rutina y carga habitual.', 99
  from public.consultation_templates where template_key = 'catalog-sports'
$$, 'adds the requested training section');

select lives_ok($$
  insert into public.consultation_template_questions(
    section_id, question_key, label, question_type, response_area,
    is_required, display_order, configuration
  )
  select s.id, 'training_days', '¿Cuántos días entrenas por semana?',
    'number', 'patient_reported', false, 0, '{}'::jsonb
  from public.consultation_template_sections s
  join public.consultation_templates t on t.id = s.template_id
  where t.template_key = 'catalog-sports' and s.section_key = 'training'
$$, 'adds the requested training question');

select lives_ok($$
  select public.set_consultation_template_default(
    (select id from public.consultation_templates where template_key = 'catalog-sports')
  )
$$, 'sets the personal template as default explicitly');
select is(
  (select count(*) from public.consultation_templates
   where professional_id = 'c1000000-0000-4000-8000-000000000001'
     and consultation_type = 'initial' and is_default),
  1::bigint,
  'only one owned initial template is default'
);

select lives_ok($$
  select public.start_consultation_draft(
    'c3000000-0000-4000-8000-000000000003', 'initial'
  )
$$, 'starts the sports consultation');
select lives_ok($$
  select public.adopt_consultation_template(
    (select id from public.consultations where patient_id = 'c3000000-0000-4000-8000-000000000003'),
    (select id from public.consultation_templates where template_key = 'catalog-sports'),
    0
  )
$$, 'creates an immutable questionnaire snapshot');
select lives_ok($$
  select public.save_consultation_responses(
    (select id from public.consultations where patient_id = 'c3000000-0000-4000-8000-000000000003'),
    1,
    '{"training_days":4}'::jsonb
  )
$$, 'saves an answer from the sports template');

select is(
  (select jsonb_path_query_first(
      structure,
      '$.sections[*].questions[*] ? (@.question_key == "training_days").label'
    ) #>> '{}'
   from public.consultation_snapshots
   where patient_id = 'c3000000-0000-4000-8000-000000000003'),
  '¿Cuántos días entrenas por semana?',
  'the snapshot contains the original training question'
);

update public.consultations
set status = 'completed', completed_at = now()
where patient_id = 'c3000000-0000-4000-8000-000000000003';

select lives_ok($$
  delete from public.consultation_templates where template_key = 'catalog-sports'
$$, 'deletes the source template after the consultation is finished');
select is(
  (select template_id from public.consultation_snapshots
   where patient_id = 'c3000000-0000-4000-8000-000000000003'),
  null::uuid,
  'snapshot remains after its source template is deleted'
);
select is(
  (select value from public.consultation_answers
   where patient_id = 'c3000000-0000-4000-8000-000000000003'
     and question_key = 'training_days'),
  '4'::jsonb,
  'historical answer remains unchanged'
);

select set_config(
  'request.jwt.claim.sub',
  'c2000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*) from public.consultation_snapshots),
  0::bigint,
  'another professional cannot read the historical snapshot'
);
select is(
  (select count(*) from public.consultation_answers),
  0::bigint,
  'another professional cannot read the historical answer'
);

select * from finish();
rollback;
