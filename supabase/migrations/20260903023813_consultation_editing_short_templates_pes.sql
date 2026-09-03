-- Consultations can be deliberately reopened without overwriting the prior
-- questionnaire revision. Deletion removes the questionnaire while preserving
-- independent measurements, notes and plans as unlinked patient history.
create function public.reopen_consultation_for_edit(target_consultation uuid)
returns public.consultations language plpgsql security invoker set search_path = '' as $$
declare c public.consultations; previous public.consultation_snapshots; copied public.consultation_snapshots;
begin
  select * into c from public.consultations
    where id = target_consultation and professional_id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  if c.status = 'draft' then return c; end if;

  select * into previous from public.consultation_snapshots
    where consultation_id = c.id and professional_id = (select auth.uid())
    order by revision desc limit 1;
  if previous.id is not null then
    insert into public.consultation_snapshots (
      professional_id, consultation_id, patient_id, template_id, template_name,
      template_version, structure, revision
    ) values (
      previous.professional_id, previous.consultation_id, previous.patient_id,
      previous.template_id, previous.template_name, previous.template_version,
      previous.structure, previous.revision + 1
    ) returning * into copied;
    insert into public.consultation_answers (
      professional_id, consultation_id, patient_id, revision, question_key,
      section_key, response_area, value
    ) select professional_id, consultation_id, patient_id, copied.revision,
      question_key, section_key, response_area, value
      from public.consultation_answers
      where consultation_id = c.id and professional_id = (select auth.uid())
        and revision = previous.revision;
  end if;
  update public.consultations set status = 'draft', completed_at = null
    where id = c.id returning * into c;
  return c;
end;
$$;

create function public.delete_consultation_record(target_consultation uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.consultations;
begin
  select * into c from public.consultations
    where id = target_consultation and professional_id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  update public.patient_measurements set consultation_id = null
    where consultation_id = c.id and professional_id = (select auth.uid());
  update public.patient_notes set consultation_id = null
    where consultation_id = c.id and professional_id = (select auth.uid());
  update public.nutrition_plans set consultation_id = null
    where consultation_id = c.id and professional_id = (select auth.uid());
  delete from public.questionnaire_submissions
    where consultation_id = c.id and professional_id = (select auth.uid());
  delete from public.consultations
    where id = c.id and professional_id = (select auth.uid());
end;
$$;

revoke all on function public.reopen_consultation_for_edit(uuid) from public, anon;
revoke all on function public.delete_consultation_record(uuid) from public, anon;
grant execute on function public.reopen_consultation_for_edit(uuid) to authenticated;
grant execute on function public.delete_consultation_record(uuid) to authenticated;

-- Compact 30-minute versions retain only a high-yield conversational core.
-- They are separate system templates, so the full interview remains available.
do $$
declare source_template uuid; target_template uuid; source_section record; source_question record;
begin
  if not exists (select 1 from public.consultation_templates where template_key = 'system_initial_brief_v1') then
    select id into source_template from public.consultation_templates where template_key = 'system_initial_v2';
    insert into public.consultation_templates (template_key, name, consultation_type, version, is_system, is_active)
      values ('system_initial_brief_v1', 'Consulta inicial breve · 30 min', 'initial', 1, true, true)
      returning id into target_template;
    for source_section in
      select s.* from public.consultation_template_sections s
      where s.template_id = source_template and exists (
        select 1 from public.consultation_template_questions q where q.section_id = s.id and q.question_key = any(array[
          'main_reason','expectations','consult_now','medical_history_status','medical_diagnoses_v2',
          'medication_status','medication_list_v2','appetite','digestive_screen','sleep_hours',
          'exercise_status','recall_24h_v2','usual_pattern','daily_schedule','food_reactions_status',
          'food_reactions_v2','access_barriers','eating_drivers','interview_priorities','interview_review'
        ])
      ) order by s.display_order
    loop
      insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
        values (target_template, source_section.section_key, source_section.title, source_section.description, source_section.display_order);
      for source_question in
        select q.* from public.consultation_template_questions q where q.section_id = source_section.id
          and q.question_key = any(array[
            'main_reason','expectations','consult_now','medical_history_status','medical_diagnoses_v2',
            'medication_status','medication_list_v2','appetite','digestive_screen','sleep_hours',
            'exercise_status','recall_24h_v2','usual_pattern','daily_schedule','food_reactions_status',
            'food_reactions_v2','access_barriers','eating_drivers','interview_priorities','interview_review'
          ]) order by q.display_order
      loop
        insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, configuration, visibility_condition)
          select ts.id, source_question.question_key, source_question.label, source_question.help_text, source_question.question_type, source_question.response_area, source_question.is_required, source_question.display_order, source_question.configuration, source_question.visibility_condition
          from public.consultation_template_sections ts where ts.template_id = target_template and ts.section_key = source_section.section_key;
      end loop;
    end loop;
  end if;

  if not exists (select 1 from public.consultation_templates where template_key = 'system_follow_up_brief_v1') then
    select id into source_template from public.consultation_templates where template_key = 'system_follow_up_v1';
    insert into public.consultation_templates (template_key, name, consultation_type, version, is_system, is_active)
      values ('system_follow_up_brief_v1', 'Consulta de seguimiento breve · 30 min', 'follow_up', 1, true, true)
      returning id into target_template;
    for source_section in select * from public.consultation_template_sections where template_id = source_template order by display_order loop
      insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
        values (target_template, source_section.section_key, source_section.title, source_section.description, source_section.display_order);
      for source_question in
        select q.* from public.consultation_template_questions q where q.section_id = source_section.id
          and q.question_key = any(array['changes_since_last','progress_perception','symptoms_changes','medical_changes','indicators_reviewed','diagnosis_status','barriers','adjustments','next_objectives','professional_notes','next_appointment'])
          order by q.display_order
      loop
        insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, configuration, visibility_condition)
          select ts.id, source_question.question_key, source_question.label, source_question.help_text, source_question.question_type, source_question.response_area, source_question.is_required, source_question.display_order, source_question.configuration, source_question.visibility_condition
          from public.consultation_template_sections ts where ts.template_id = target_template and ts.section_key = source_section.section_key;
      end loop;
    end loop;
  end if;
end;
$$;

-- PES stays a professional aid: it never infers or assigns a diagnosis.
do $$
declare target_template uuid; pes_section_id uuid; next_order integer;
begin
  for target_template in select id from public.consultation_templates
    where template_key in ('system_initial_v2','system_follow_up_v1','system_initial_brief_v1','system_follow_up_brief_v1')
  loop
    select id into pes_section_id from public.consultation_template_sections
      where template_id = target_template and section_key = 'nutrition_diagnosis';
    if pes_section_id is null then
      select coalesce(max(display_order), -1) + 1 into next_order from public.consultation_template_sections where template_id = target_template;
      insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
        values (target_template, 'nutrition_diagnosis', 'Diagnóstico nutricional (PES)',
          'Guía profesional: redacta un problema nutricional, su etiología y los signos o síntomas que lo sustentan. La herramienta no genera ni valida un diagnóstico por sí sola.', next_order)
        returning id into pes_section_id;
    end if;
    insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, display_order, configuration)
    values
      (pes_section_id, 'pes_problem', 'Problema nutricional (P)', '¿Qué problema nutricional priorizarás? Usa terminología clínica según tu juicio.', 'short_text', 'professional_assessment', 0, '{"max_length":500}'::jsonb),
      (pes_section_id, 'pes_etiology', 'Etiología (E)', '¿Con qué está relacionado el problema? Describe causas o factores modificables.', 'long_text', 'professional_assessment', 1, '{"max_length":1500}'::jsonb),
      (pes_section_id, 'pes_evidence', 'Signos y síntomas (S)', '¿Qué datos de la entrevista, exploración o estudios lo evidencian?', 'long_text', 'professional_assessment', 2, '{"max_length":1500}'::jsonb),
      (pes_section_id, 'pes_statement', 'Enunciado PES final', 'Redacta: “Problema relacionado con Etiología, evidenciado por Signos y síntomas”. Revísalo y ajústalo antes de cerrar.', 'long_text', 'professional_assessment', 3, '{"max_length":2000}'::jsonb)
    on conflict (section_id, question_key) do nothing;
  end loop;
  update public.consultation_templates set version = version + 1
    where template_key in ('system_initial_v2','system_follow_up_v1');
end;
$$;
