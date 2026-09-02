create or replace function private.touch_patient_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.patients set last_activity_at = now() where id = new.patient_id and professional_id = new.professional_id;
  return new;
end;
$$;

create trigger consultations_touch_patient after insert or update on public.consultations
for each row execute function private.touch_patient_activity();
create trigger measurements_touch_patient after insert or update on public.patient_measurements
for each row execute function private.touch_patient_activity();
create trigger notes_touch_patient after insert or update on public.consultation_notes
for each row execute function private.touch_patient_activity();

drop policy if exists patient_progress_owner_delete on storage.objects;
create policy patient_progress_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'patient-progress'
  and name ~ '^[0-9a-f-]{36}/patients/[0-9a-f-]{36}/[^/]+$'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (select 1 from public.patients p where p.id = (storage.foldername(name))[3]::uuid and p.professional_id = (select auth.uid()))
);
