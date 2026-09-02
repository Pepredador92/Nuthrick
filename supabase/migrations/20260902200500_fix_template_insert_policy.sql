-- Defaults are applied after RLS checks for INSERT. The coalesced check admits
-- omitted owner/default values while rejecting an explicit system template.
drop policy if exists consultation_templates_insert on public.consultation_templates;
create policy consultation_templates_insert on public.consultation_templates for insert to authenticated
  with check (coalesce(professional_id, (select auth.uid())) = (select auth.uid()) and not coalesce(is_system, false));
