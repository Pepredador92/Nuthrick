-- SECURITY INVOKER clinical source and AI ledger require explicit reads when
-- auto_expose_new_tables=false. No client grants or RLS policies are broadened.
grant select on public.professional_profiles, public.patients,
  public.consultations, public.consultation_answers, public.consultation_snapshots,
  public.consultation_measurements, public.measurement_types,
  public.consultation_calculation_results, public.laboratory_results
to service_role;
