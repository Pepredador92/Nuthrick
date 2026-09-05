-- Cover foreign keys used by report deletion, patient history and RLS checks.
create index laboratory_custom_analytes_first_report_idx
  on public.laboratory_custom_analytes(first_report_id) where first_report_id is not null;
create index laboratory_panel_templates_professional_idx
  on public.laboratory_panel_templates(professional_id) where professional_id is not null;
create index laboratory_results_analyte_idx
  on public.laboratory_results(analyte_id) where analyte_id is not null;
create index laboratory_results_consultation_idx
  on public.laboratory_results(professional_id, consultation_id);
create index laboratory_results_custom_analyte_idx
  on public.laboratory_results(professional_id, custom_analyte_id) where custom_analyte_id is not null;

-- Split ALL policies so their implicit SELECT permission does not duplicate the
-- dedicated read policy for templates.
drop policy laboratory_panel_templates_private_write on public.laboratory_panel_templates;
create policy laboratory_panel_templates_private_insert on public.laboratory_panel_templates for insert to authenticated
  with check (professional_id = (select auth.uid()) and not is_system);
create policy laboratory_panel_templates_private_update on public.laboratory_panel_templates for update to authenticated
  using (professional_id = (select auth.uid()) and not is_system)
  with check (professional_id = (select auth.uid()) and not is_system);
create policy laboratory_panel_templates_private_delete on public.laboratory_panel_templates for delete to authenticated
  using (professional_id = (select auth.uid()) and not is_system);

drop policy laboratory_panel_template_items_private_write on public.laboratory_panel_template_items;
create policy laboratory_panel_template_items_private_insert on public.laboratory_panel_template_items for insert to authenticated
  with check (exists (select 1 from public.laboratory_panel_templates t join public.measurement_types m on m.id = analyte_id where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system and m.created_by is null and m.category = 'laboratory' and m.is_active));
create policy laboratory_panel_template_items_private_update on public.laboratory_panel_template_items for update to authenticated
  using (exists (select 1 from public.laboratory_panel_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.laboratory_panel_templates t join public.measurement_types m on m.id = analyte_id where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system and m.created_by is null and m.category = 'laboratory' and m.is_active));
create policy laboratory_panel_template_items_private_delete on public.laboratory_panel_template_items for delete to authenticated
  using (exists (select 1 from public.laboratory_panel_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system));
