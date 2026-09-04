drop policy if exists consultation_calculation_results_owner_all
  on public.consultation_calculation_results;

create policy consultation_calculation_results_owner_select
  on public.consultation_calculation_results
  for select to authenticated
  using ((select auth.uid()) = professional_id);

create policy consultation_calculation_results_owner_insert
  on public.consultation_calculation_results
  for insert to authenticated
  with check (
    (select auth.uid()) = professional_id
    and exists (
      select 1
      from public.consultations consultation
      where consultation.professional_id = (select auth.uid())
        and consultation.id = consultation_id
        and consultation.patient_id = patient_id
        and consultation.status = 'draft'
    )
  );

create policy consultation_calculation_results_owner_update
  on public.consultation_calculation_results
  for update to authenticated
  using (
    (select auth.uid()) = professional_id
    and exists (
      select 1
      from public.consultations consultation
      where consultation.professional_id = (select auth.uid())
        and consultation.id = consultation_id
        and consultation.patient_id = patient_id
        and consultation.status = 'draft'
    )
  )
  with check (
    (select auth.uid()) = professional_id
    and exists (
      select 1
      from public.consultations consultation
      where consultation.professional_id = (select auth.uid())
        and consultation.id = consultation_id
        and consultation.patient_id = patient_id
        and consultation.status = 'draft'
    )
  );

create policy consultation_calculation_results_owner_delete
  on public.consultation_calculation_results
  for delete to authenticated
  using (
    (select auth.uid()) = professional_id
    and exists (
      select 1
      from public.consultations consultation
      where consultation.professional_id = (select auth.uid())
        and consultation.id = consultation_id
        and consultation.patient_id = patient_id
        and consultation.status = 'draft'
    )
  );
