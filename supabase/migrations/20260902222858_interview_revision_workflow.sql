-- Explicit draft upgrades append a revision. Neither completed records nor old
-- answers are rewritten. All RPCs execute as the caller, with RLS still enabled.
alter table public.consultation_snapshots
  add column revision integer not null default 1 check (revision > 0),
  drop constraint consultation_snapshots_professional_id_consultation_id_key,
  add constraint consultation_snapshots_revision_key unique (professional_id, consultation_id, revision);
alter table public.consultation_answers
  add column revision integer not null default 1 check (revision > 0),
  drop constraint consultation_answers_professional_id_consultation_id_questi_key,
  add constraint consultation_answers_revision_key unique (professional_id, consultation_id, revision, question_key),
  add constraint consultation_answers_snapshot_fk foreign key (professional_id, consultation_id, revision)
    references public.consultation_snapshots (professional_id, consultation_id, revision) on delete cascade;

create function private.current_consultation_revision(target uuid, expected integer)
returns boolean language sql stable security invoker set search_path = '' as $$
  select expected = (select max(s.revision) from public.consultation_snapshots s
    where s.consultation_id = target and s.professional_id = (select auth.uid()));
$$;
revoke all on function private.current_consultation_revision(uuid, integer) from public, anon;
grant execute on function private.current_consultation_revision(uuid, integer) to authenticated;

-- A restrictive policy composes with the existing owner + draft policies.
create policy consultation_answers_current_insert on public.consultation_answers as restrictive for insert to authenticated
  with check (private.current_consultation_revision(consultation_id, revision));
create policy consultation_answers_current_update on public.consultation_answers as restrictive for update to authenticated
  using (private.current_consultation_revision(consultation_id, revision))
  with check (private.current_consultation_revision(consultation_id, revision));
create policy consultation_answers_current_delete on public.consultation_answers as restrictive for delete to authenticated
  using (private.current_consultation_revision(consultation_id, revision));

create function public.start_consultation_draft(target_patient uuid, requested_type text)
returns public.consultations language plpgsql security invoker set search_path = '' as $$
declare result public.consultations; next_sequence integer;
begin
  if requested_type not in ('initial', 'follow_up') then raise exception 'Invalid consultation type'; end if;
  perform 1 from public.patients where id = target_patient and professional_id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Patient unavailable'; end if;
  select * into result from public.consultations where patient_id = target_patient
    and professional_id = (select auth.uid()) and consultation_type = requested_type and status = 'draft';
  if found then return result; end if;
  select coalesce(max(sequence_number), -1) + 1 into next_sequence from public.consultations
    where patient_id = target_patient and professional_id = (select auth.uid());
  insert into public.consultations (professional_id, patient_id, consultation_type, sequence_number, status)
    values ((select auth.uid()), target_patient, requested_type, next_sequence, 'draft') returning * into result;
  return result;
end;
$$;

create function public.adopt_consultation_template(target_consultation uuid, target_template uuid, expected_revision integer)
returns public.consultation_snapshots language plpgsql security invoker set search_path = '' as $$
declare c public.consultations; t public.consultation_templates; old public.consultation_snapshots;
  result public.consultation_snapshots; next_structure jsonb;
begin
  select * into c from public.consultations where id = target_consultation and professional_id = (select auth.uid()) for update;
  if not found or c.status <> 'draft' then raise insufficient_privilege using message = 'Only an owned draft can be updated'; end if;
  select * into old from public.consultation_snapshots where consultation_id = c.id order by revision desc limit 1;
  if coalesce(old.revision, 0) <> expected_revision then raise exception 'The draft changed. Reload before updating.'; end if;
  select * into t from public.consultation_templates where id = target_template and is_active
    and consultation_type = c.consultation_type and (is_system or professional_id = (select auth.uid()));
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
  select jsonb_build_object('consultation_type', t.consultation_type, 'sections', coalesce(jsonb_agg(
    jsonb_build_object('section_key', s.section_key, 'title', s.title, 'description', s.description,
      'questions', (select coalesce(jsonb_agg(jsonb_build_object('question_key', q.question_key, 'label', q.label,
        'help_text', q.help_text, 'question_type', q.question_type, 'response_area', q.response_area,
        'is_required', q.is_required, 'configuration', q.configuration, 'visibility_condition', q.visibility_condition)
        order by q.display_order), '[]'::jsonb) from public.consultation_template_questions q where q.section_id = s.id and q.is_active))
    order by s.display_order), '[]'::jsonb)) into next_structure
    from public.consultation_template_sections s where s.template_id = t.id and s.is_active;
  if jsonb_array_length(next_structure->'sections') = 0 then raise exception 'Template has no active sections'; end if;
  insert into public.consultation_snapshots (professional_id, consultation_id, patient_id, template_id, template_name, template_version, structure, revision)
    values ((select auth.uid()), c.id, c.patient_id, t.id, t.name, t.version, next_structure, expected_revision + 1) returning * into result;
  -- Copy only matching semantic keys with compatible types/configuration. Changed
  -- questions remain unanswered; their original responses stay in the prior revision.
  if old.id is not null then
    insert into public.consultation_answers (professional_id, consultation_id, patient_id, revision, question_key, section_key, response_area, value)
    select a.professional_id, a.consultation_id, a.patient_id, result.revision, a.question_key, ns->>'section_key', nq->>'response_area', a.value
    from public.consultation_answers a
    cross join lateral jsonb_array_elements(old.structure->'sections') os
    cross join lateral jsonb_array_elements(os->'questions') oq
    cross join lateral jsonb_array_elements(next_structure->'sections') ns
    cross join lateral jsonb_array_elements(ns->'questions') nq
    where a.consultation_id = c.id and a.professional_id = (select auth.uid()) and a.revision = old.revision
      and a.question_key = oq->>'question_key' and a.question_key = nq->>'question_key'
      and oq->>'question_type' = nq->>'question_type' and oq->>'response_area' = nq->>'response_area'
      and (nq->>'question_type' <> 'repeatable_group' or oq->'configuration' = nq->'configuration')
      and (nq->>'question_type' not in ('select','multi_select') or
        (nq->>'question_type' = 'select' and (nq->'configuration'->'options') @> jsonb_build_array(a.value)) or
        (nq->>'question_type' = 'multi_select' and (nq->'configuration'->'options') @> a.value));
  end if;
  return result;
end;
$$;

create function public.save_consultation_responses(target_consultation uuid, expected_revision integer, responses jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.consultations; snap public.consultation_snapshots;
begin
  select * into c from public.consultations where id = target_consultation and professional_id = (select auth.uid()) for update;
  if not found or c.status <> 'draft' then raise insufficient_privilege using message = 'Only an owned draft can be saved'; end if;
  select * into snap from public.consultation_snapshots where consultation_id = c.id order by revision desc limit 1;
  if snap.id is null or snap.revision <> expected_revision then raise exception 'The questionnaire changed. Reload before saving.'; end if;
  if jsonb_typeof(responses) <> 'object' then raise exception 'Responses must be an object'; end if;
  insert into public.consultation_answers (professional_id, consultation_id, patient_id, revision, question_key, section_key, response_area, value)
    select (select auth.uid()), c.id, c.patient_id, snap.revision, q->>'question_key', s->>'section_key', q->>'response_area', responses->(q->>'question_key')
    from jsonb_array_elements(snap.structure->'sections') s cross join lateral jsonb_array_elements(s->'questions') q
    where responses ? (q->>'question_key')
    on conflict (professional_id, consultation_id, revision, question_key)
    do update set value = excluded.value, section_key = excluded.section_key, response_area = excluded.response_area;
end;
$$;

create function public.copy_consultation_template(source_id uuid, new_key text)
returns public.consultation_templates language plpgsql security invoker set search_path = '' as $$
declare source public.consultation_templates; result public.consultation_templates;
begin
  perform 1 from public.professional_profiles where id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Profile unavailable'; end if;
  select * into source from public.consultation_templates where id = source_id and (is_system or professional_id = (select auth.uid()));
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
  insert into public.consultation_templates (professional_id, template_key, name, consultation_type, version, source_template_id, is_default)
    values ((select auth.uid()), new_key, left(source.name, 100) || ' · personal', source.consultation_type, source.version, source.id, false) returning * into result;
  insert into public.consultation_template_sections (template_id, section_key, title, description, display_order, is_active)
    select result.id, section_key, title, description, display_order, is_active from public.consultation_template_sections where template_id = source.id;
  insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, is_active, configuration, visibility_condition)
    select copied.id, q.question_key, q.label, q.help_text, q.question_type, q.response_area, q.is_required, q.display_order, q.is_active, q.configuration, q.visibility_condition
    from public.consultation_template_questions q join public.consultation_template_sections original on original.id = q.section_id
    join public.consultation_template_sections copied on copied.template_id = result.id and copied.section_key = original.section_key
    where original.template_id = source.id;
  update public.consultation_templates set is_default = false where professional_id = (select auth.uid())
    and consultation_type = source.consultation_type and is_default;
  update public.consultation_templates set is_default = true where id = result.id returning * into result;
  return result;
end;
$$;

-- Deferrable order constraints allow an atomic reorder instead of parking rows at
-- a magic index across three network calls.
alter table public.consultation_template_sections
  drop constraint consultation_template_sections_template_id_display_order_key,
  add constraint consultation_sections_order_unique unique (template_id, display_order) deferrable initially immediate;
alter table public.consultation_template_questions
  drop constraint consultation_template_questions_section_id_display_order_key,
  add constraint consultation_questions_order_unique unique (section_id, display_order) deferrable initially immediate;

create function public.save_consultation_template(target_template uuid, expected_updated_at timestamptz, section_data jsonb, question_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare t public.consultation_templates; item jsonb; parent uuid;
begin
  select * into t from public.consultation_templates where id = target_template and professional_id = (select auth.uid()) and not is_system for update;
  if not found then raise insufficient_privilege using message = 'Private template unavailable'; end if;
  if t.updated_at <> expected_updated_at then raise exception 'Template changed. Reload before saving.'; end if;
  if jsonb_typeof(section_data) <> 'array' or jsonb_typeof(question_data) <> 'array' then raise exception 'Invalid template structure'; end if;
  set constraints public.consultation_sections_order_unique, public.consultation_questions_order_unique deferred;
  for item in select * from jsonb_array_elements(section_data) loop
    if exists (select 1 from public.consultation_template_sections where id = (item->>'id')::uuid and template_id <> t.id) then
      raise insufficient_privilege using message = 'Section belongs to another template';
    end if;
    insert into public.consultation_template_sections (id, template_id, section_key, title, description, display_order, is_active)
      values ((item->>'id')::uuid, t.id, item->>'section_key', item->>'title', item->>'description', (item->>'display_order')::integer, (item->>'is_active')::boolean)
      on conflict (id) do update set title = excluded.title, description = excluded.description, display_order = excluded.display_order, is_active = excluded.is_active
      where public.consultation_template_sections.template_id = t.id;
  end loop;
  for item in select * from jsonb_array_elements(question_data) loop
    parent := (item->>'section_id')::uuid;
    if not exists (select 1 from public.consultation_template_sections where id = parent and template_id = t.id) then
      raise insufficient_privilege using message = 'Section unavailable';
    end if;
    if exists (select 1 from public.consultation_template_questions where id = (item->>'id')::uuid and section_id <> parent) then
      raise insufficient_privilege using message = 'Question belongs to another section';
    end if;
    insert into public.consultation_template_questions (id, section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, is_active, configuration, visibility_condition)
      values ((item->>'id')::uuid, parent, item->>'question_key', item->>'label', item->>'help_text', item->>'question_type', item->>'response_area', (item->>'is_required')::boolean, (item->>'display_order')::integer, (item->>'is_active')::boolean, item->'configuration', nullif(item->'visibility_condition', 'null'::jsonb))
      on conflict (id) do update set label = excluded.label, help_text = excluded.help_text, question_type = excluded.question_type,
        response_area = excluded.response_area, is_required = excluded.is_required, display_order = excluded.display_order,
        is_active = excluded.is_active, configuration = excluded.configuration, visibility_condition = excluded.visibility_condition
      where public.consultation_template_questions.section_id = parent;
  end loop;
  if exists (select q.question_key from public.consultation_template_questions q join public.consultation_template_sections s on s.id = q.section_id
    where s.template_id = t.id group by q.question_key having count(*) > 1) then raise exception 'Duplicate question key'; end if;
  update public.consultation_templates set version = version + 1 where id = t.id;
end;
$$;

revoke all on function public.start_consultation_draft(uuid, text) from public, anon;
revoke all on function public.adopt_consultation_template(uuid, uuid, integer) from public, anon;
revoke all on function public.save_consultation_responses(uuid, integer, jsonb) from public, anon;
revoke all on function public.copy_consultation_template(uuid, text) from public, anon;
revoke all on function public.save_consultation_template(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.start_consultation_draft(uuid, text) to authenticated;
grant execute on function public.adopt_consultation_template(uuid, uuid, integer) to authenticated;
grant execute on function public.save_consultation_responses(uuid, integer, jsonb) to authenticated;
grant execute on function public.copy_consultation_template(uuid, text) to authenticated;
grant execute on function public.save_consultation_template(uuid, timestamptz, jsonb, jsonb) to authenticated;
