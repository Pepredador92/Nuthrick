-- A mistaken appointment association is administrative metadata, including on
-- a completed consultation. Keep clinical records and appointment states intact.
-- The private definer permits this narrow update on completed consultations;
-- ordinary client updates remain subject to the existing draft-only RLS policy.
create function private.unlink_consultation_from_appointment(
  p_consultation_id uuid,
  p_appointment_id uuid
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid := (select auth.uid());
  selected public.consultations;
begin
  if owner is null then
    raise insufficient_privilege using message = 'Consultation unavailable';
  end if;
  if p_consultation_id is null or p_appointment_id is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  perform private.require_my_entitlement('agenda');
  perform private.require_my_entitlement('consultations');
  select * into selected from public.consultations
    where id = p_consultation_id and professional_id = owner
      and deleted_at is null
    for update;
  if not found then
    raise insufficient_privilege using message = 'Consultation unavailable';
  end if;
  perform private.require_retention_patient(owner, selected.patient_id);
  -- Cancelled/past appointments may also contain an accidental association.
  perform 1 from public.agenda_entries
    where id = p_appointment_id and professional_id = owner
      and patient_id = selected.patient_id and kind = 'appointment'
    for share;
  if not found then
    raise insufficient_privilege using message = 'Appointment unavailable';
  end if;
  -- A retry after an uncertain network response is harmless. A stale tab must
  -- never remove a newer association with a different appointment.
  if selected.agenda_entry_id is null then return; end if;
  if selected.agenda_entry_id <> p_appointment_id then
    raise exception 'consultation_appointment_changed' using errcode = '23514';
  end if;
  update public.consultations set agenda_entry_id = null
    where id = selected.id and professional_id = owner
      and agenda_entry_id = p_appointment_id;
end;
$$;
revoke all on function private.unlink_consultation_from_appointment(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.unlink_consultation_from_appointment(uuid, uuid)
  to authenticated;

create function public.unlink_consultation_from_appointment(
  p_consultation_id uuid,
  p_appointment_id uuid
)
returns void language sql security invoker set search_path = ''
as $$
  select private.unlink_consultation_from_appointment(p_consultation_id, p_appointment_id);
$$;
revoke all on function public.unlink_consultation_from_appointment(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unlink_consultation_from_appointment(uuid, uuid)
  to authenticated;
