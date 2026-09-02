alter table public.consultations add constraint consultations_owner_patient_unique unique (professional_id, id, patient_id);
alter table public.consultation_notes drop constraint consultation_notes_professional_id_consultation_id_fkey;
alter table public.consultation_notes add constraint consultation_notes_consultation_patient_fkey
  foreign key (professional_id, consultation_id, patient_id)
  references public.consultations(professional_id, id, patient_id) on delete cascade;
create index consultation_notes_consultation_patient_idx on public.consultation_notes (professional_id, consultation_id, patient_id);
