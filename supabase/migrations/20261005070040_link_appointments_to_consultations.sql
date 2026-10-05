-- Consultations and appointments have different lifecycles. The explicit link
-- lets Agenda display clinical progress without guessing from patient/date.
alter table public.consultations
  add column if not exists agenda_entry_id uuid;

alter table public.consultations
  drop constraint if exists consultations_agenda_entry_owner_fkey;
alter table public.consultations
  add constraint consultations_agenda_entry_owner_fkey
  foreign key (professional_id, agenda_entry_id)
  references public.agenda_entries (professional_id, id)
  on delete restrict;

create unique index if not exists consultations_one_current_per_appointment_idx
  on public.consultations (professional_id, agenda_entry_id)
  where agenda_entry_id is not null and deleted_at is null;

create or replace function private.guard_consultation_appointment_link()
returns trigger language plpgsql security invoker
set search_path = ''
as $$
begin
  if new.agenda_entry_id is not null and not exists (
    select 1 from public.agenda_entries e
    where e.id = new.agenda_entry_id
      and e.professional_id = new.professional_id
      and e.patient_id = new.patient_id
      and e.kind = 'appointment'
  ) then
    raise exception 'Appointment does not belong to this patient' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists consultations_appointment_link_guard on public.consultations;
create trigger consultations_appointment_link_guard
  before insert or update of agenda_entry_id, patient_id, professional_id
  on public.consultations
  for each row execute function private.guard_consultation_appointment_link();

create or replace function public.link_consultation_to_appointment(
  p_consultation_id uuid,
  p_appointment_id uuid
)
returns public.consultations language plpgsql security definer
set search_path = ''
as $$
declare
  selected public.consultations%rowtype;
begin
  perform private.require_my_entitlement('consultations');
  select * into selected from public.consultations
  where id = p_consultation_id and professional_id = (select auth.uid())
    and deleted_at is null and status in ('draft', 'completed')
  for update;
  if not found then
    raise exception 'Consultation unavailable' using errcode = '42501';
  end if;
  if selected.agenda_entry_id is not null and selected.agenda_entry_id <> p_appointment_id then
    raise exception 'Consultation already linked' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.agenda_entries e
    where e.id = p_appointment_id and e.professional_id = (select auth.uid())
      and e.patient_id = selected.patient_id and e.kind = 'appointment'
      and e.status = 'confirmed'
  ) then
    raise exception 'Appointment unavailable for this patient' using errcode = '23514';
  end if;
  update public.consultations
  set agenda_entry_id = p_appointment_id
  where id = selected.id
  returning * into selected;
  return selected;
end;
$$;

revoke all on function public.link_consultation_to_appointment(uuid,uuid) from public, anon;
grant execute on function public.link_consultation_to_appointment(uuid,uuid) to authenticated;

comment on column public.consultations.agenda_entry_id is
  'Explicit appointment corresponding to this consultation; attendance confirmation remains on agenda_entries.';
