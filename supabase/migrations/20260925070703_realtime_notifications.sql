begin;

create table public.professional_notifications (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  type text not null check (type in ('portal_message','appointment_request','appointment_created','appointment_changed')),
  actor_name text not null check (char_length(actor_name) between 1 and 160),
  resource_id uuid not null,
  resource_type text not null check (resource_type in ('patient','agenda_request','agenda_entry')),
  title text not null check (char_length(title) between 1 and 240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dedupe_key text not null unique
);

create index professional_notifications_inbox_idx
  on public.professional_notifications(professional_id, created_at desc, id desc);
create index professional_notifications_unread_idx
  on public.professional_notifications(professional_id, created_at desc)
  where read_at is null;

alter table public.professional_notifications enable row level security;
revoke all on public.professional_notifications from public, anon;
grant select, update on public.professional_notifications to authenticated;
grant all on public.professional_notifications to service_role;

create policy professional_notifications_read_own
  on public.professional_notifications
  for select
  to authenticated
  using ((select auth.uid()) = professional_id);

create policy professional_notifications_mark_own
  on public.professional_notifications
  for update
  to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

alter publication supabase_realtime add table public.professional_notifications;

create or replace function private.portal_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  patient_name text;
  link_hash text;
begin
  select p.professional_id, p.full_name, portal.link_hash
    into owner_id, patient_name, link_hash
    from private.patient_portals portal
    join public.patients p on p.id = portal.patient_id
   where portal.patient_id = new.patient_id;

  if new.sender = 'patient' and owner_id is not null then
    begin
      insert into public.professional_notifications(
        professional_id, type, actor_name, resource_id, resource_type,
        title, metadata, dedupe_key
      )
      values (
        owner_id,
        'portal_message',
        patient_name,
        new.patient_id,
        'patient',
        'Nuevo mensaje de ' || patient_name,
        jsonb_build_object('patientId', new.patient_id),
        'portal-message:' || new.id::text
      )
      on conflict (dedupe_key) do nothing;
    exception when others then
      null;
    end;
  end if;

  if link_hash is not null then
    begin
      perform realtime.send(
        jsonb_build_object('kind', 'portal_message', 'sender', new.sender),
        'portal_notification',
        'portal:' || link_hash,
        false
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.portal_message_notification() from public, anon, authenticated;

create trigger portal_messages_notifications
  after insert on private.portal_messages
  for each row execute function private.portal_message_notification();

create or replace function private.agenda_request_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.professional_notifications(
      professional_id, type, actor_name, resource_id, resource_type,
      title, metadata, dedupe_key
    )
    values (
      new.professional_id,
      'appointment_request',
      new.contact_name,
      new.id,
      'agenda_request',
      'Nueva solicitud de cita',
      jsonb_build_object(
        'startsAt', new.starts_at,
        'endsAt', new.ends_at,
        'timezone', new.timezone
      ),
      'agenda-request:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function private.agenda_request_notification() from public, anon, authenticated;

create trigger agenda_requests_notifications
  after insert on public.agenda_requests
  for each row execute function private.agenda_request_notification();

create or replace function private.agenda_entry_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'appointment' and new.source in ('public', 'professional') then
    begin
      insert into public.professional_notifications(
        professional_id, type, actor_name, resource_id, resource_type,
        title, metadata, dedupe_key
      )
      values (
        new.professional_id,
        'appointment_created',
        coalesce(new.contact_name, 'Contacto'),
        new.id,
        'agenda_entry',
        'Nueva cita de ' || coalesce(new.contact_name, 'contacto'),
        jsonb_build_object(
          'startsAt', new.starts_at,
          'endsAt', new.ends_at,
          'timezone', new.timezone
        ),
        'agenda-entry:' || new.id::text
      )
      on conflict (dedupe_key) do nothing;
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.agenda_entry_notification() from public, anon, authenticated;

create trigger agenda_entries_notifications
  after insert on public.agenda_entries
  for each row execute function private.agenda_entry_notification();

commit;
