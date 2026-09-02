-- Cover composite foreign keys and keep one policy per action for predictable RLS.
create index if not exists consultation_snapshots_consultation_patient_idx
  on public.consultation_snapshots (professional_id, consultation_id, patient_id);
create index if not exists consultation_snapshots_template_idx
  on public.consultation_snapshots (template_id) where template_id is not null;
create index if not exists consultation_answers_consultation_patient_idx
  on public.consultation_answers (professional_id, consultation_id, patient_id);
create index if not exists consultation_templates_source_idx
  on public.consultation_templates (source_template_id) where source_template_id is not null;

drop policy if exists consultation_template_sections_write on public.consultation_template_sections;
create policy consultation_template_sections_insert on public.consultation_template_sections for insert to authenticated
  with check (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system));
create policy consultation_template_sections_update on public.consultation_template_sections for update to authenticated
  using (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system));
create policy consultation_template_sections_delete on public.consultation_template_sections for delete to authenticated
  using (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system));

drop policy if exists consultation_template_questions_write on public.consultation_template_questions;
create policy consultation_template_questions_insert on public.consultation_template_questions for insert to authenticated
  with check (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system));
create policy consultation_template_questions_update on public.consultation_template_questions for update to authenticated
  using (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system));
create policy consultation_template_questions_delete on public.consultation_template_questions for delete to authenticated
  using (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system));
