-- Support the composite consultation ownership foreign key and the workshop's
-- most common lookup when a plan is opened from a consultation.
create index if not exists nutrition_plans_consultation_context_idx
  on public.nutrition_plans (professional_id, consultation_id, patient_id)
  where consultation_id is not null;
