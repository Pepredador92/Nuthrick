begin;
-- Reservation approval/registration and attendance are independent events.
-- Keep the former columns as historical evidence; never infer attendance from
-- accepting a reservation, opening an invitation or adding a calendar event.
alter table public.agenda_entries add column patient_attendance_at timestamptz, add column professional_attendance_at timestamptz;
update public.agenda_entries e set patient_attendance_at=patient_confirmed_at
where patient_confirmed_at>=starts_at-interval '48 hours' and patient_confirmed_at<starts_at
and exists(select 1 from public.agenda_audit a where a.subject_id=e.id and a.action='patient_confirm');
update public.agenda_entries e set professional_attendance_at=professional_confirmed_at
where professional_confirmed_at>=starts_at-interval '48 hours' and professional_confirmed_at<starts_at
and exists(select 1 from public.agenda_audit a where a.subject_id=e.id and a.action='confirm_reservation');
-- An appointment entered by its own professional already has booking approval.
-- Do not send retrospective mail/invitations for existing appointments.
update public.agenda_entries set requires_confirmation=false where kind='appointment' and source='professional' and requires_confirmation;

create or replace function private.appointment_projection(e public.agenda_entries) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'starts_at',e.starts_at,'ends_at',e.ends_at,'timezone',e.timezone,
 'modality',e.modality,'location_snapshot',e.location_snapshot,'status',e.status,
 'patient_confirmed_at',e.patient_confirmed_at,'professional_confirmed_at',e.professional_confirmed_at,
 'patient_attendance_at',e.patient_attendance_at,'professional_attendance_at',e.professional_attendance_at,
 'requires_confirmation',e.requires_confirmation,'confirmation_opens_at',e.starts_at-interval '48 hours',
 'notification_status',e.notification_status,'calendar_status',e.calendar_status,
 'professional_name',(select full_name from public.professional_profiles where id=e.professional_id))
$$;

create function private.agenda_queue_scheduled_entry(p_entry uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.agenda_entries; g private.agenda_google_connections;
begin
 select * into e from public.agenda_entries where id=p_entry;
 select * into g from private.agenda_google_connections where professional_id=e.professional_id and active;
 if nullif(btrim(e.contact_email),'') is not null then
  insert into private.agenda_outbox(professional_id,subject_id,kind) values(e.professional_id,e.id,'confirmation') on conflict do nothing;
 end if;
 if g.professional_id is not null then
  insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
  values(e.professional_id,e.id,'calendar_insert',jsonb_build_object('calendarId',g.write_calendar_id,'eventId','n'||replace(e.id::text,'-',''))) on conflict do nothing;
 end if;
 update public.agenda_entries set notification_status=case when nullif(btrim(e.contact_email),'') is not null then 'pending' else 'not_required' end,
 calendar_status=case when g.professional_id is not null then 'pending' else 'not_connected' end where id=e.id;
end $$;

-- Retain the existing guarded creation, token/session checks and idempotency.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('public.agenda_appointment_action(text,jsonb)'::regprocedure);
 amended:=replace(original,'||p.phone end,true,''not_required''','||p.phone end,false,''not_required''');
 if amended=original then raise exception 'creation_approval_patch_missing'; end if;
 original:=amended;
 amended:=replace(amended,'result:=private.appointment_projection(e);','perform private.agenda_queue_scheduled_entry(e.id);
  select * into e from public.agenda_entries where id=e.id;
  result:=private.appointment_projection(e);');
 if amended=original then raise exception 'creation_delivery_patch_missing'; end if;
 original:=amended;
 amended:=replace(amended,'if e.patient_confirmed_at is null then','if e.starts_at>now()+interval ''48 hours'' then raise exception ''confirmation_too_early''; end if;
   if e.requires_confirmation then raise exception ''reservation_pending''; end if;
   if pid is not null and e.patient_id is distinct from pid then raise exception ''not_found''; end if;
   if link.entry_id is not null and not exists(select 1 from private.appointment_links l where l.entry_id=e.id and l.token_hash=p_data->>''tokenHash'' and l.expires_at>now()) then raise exception ''invalid_token''; end if;
   if e.patient_attendance_at is null then');
 if amended=original then raise exception 'attendance_window_patch_missing'; end if;
 amended:=replace(amended,'set patient_confirmed_at=now()','set patient_attendance_at=now()');
 original:=amended;
 amended:=replace(amended,'''phone'',e.contact_phone','''phone'',case when e.patient_id is null then e.contact_phone else
   (select case when contact.phone like ''+%'' then contact.phone else coalesce(contact.country_code,'''')||contact.phone end
    from public.patients contact where contact.id=e.patient_id and contact.professional_id=e.professional_id and contact.deleted_at is null) end');
 if amended=original then raise exception 'current_phone_patch_missing'; end if;
 execute amended;
end $$;

create function public.agenda_confirm_attendance(p_owner uuid,p_entry uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e public.agenda_entries;
begin
 if p_owner is null then raise exception 'unauthorized'; end if;
 perform private.require_entitlement(p_owner,'agenda');
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,981));
 select * into e from public.agenda_entries where id=p_entry and professional_id=p_owner and kind='appointment' for update;
 if not found then raise exception 'not_found'; end if;
 if e.status<>'confirmed' or e.starts_at<=now() then raise exception 'invalid_transition'; end if;
 if e.starts_at>now()+interval '48 hours' then raise exception 'confirmation_too_early'; end if;
 if e.requires_confirmation then raise exception 'reservation_pending'; end if;
 if e.professional_attendance_at is null then
  update public.agenda_entries set professional_attendance_at=now() where id=e.id returning * into e;
  insert into public.agenda_audit(professional_id,actor,action,subject_id) values(p_owner,'professional','confirm_attendance',e.id);
 end if;
 return private.appointment_projection(e);
end $$;

drop trigger appointment_confirmation_notification on public.agenda_entries;
create or replace function private.appointment_confirmation_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.patient_attendance_at is distinct from old.patient_attendance_at and new.patient_attendance_at is not null then
  insert into public.professional_notifications(professional_id,type,actor_name,resource_id,resource_type,title,metadata,dedupe_key)
  values(new.professional_id,'appointment_changed',coalesce(new.contact_name,'Paciente'),new.id,'agenda_entry',
   coalesce(new.contact_name,'Paciente')||' confirmó su asistencia',jsonb_build_object('startsAt',new.starts_at),
   'attendance:'||new.id||':'||extract(epoch from new.starts_at)::text)
  on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;
create trigger appointment_confirmation_notification after update of patient_attendance_at on public.agenda_entries
 for each row execute function private.appointment_confirmation_notification();

create function private.agenda_reset_attendance() returns trigger language plpgsql set search_path='' as $$
begin
 if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.patient_id is distinct from old.patient_id then
  new.patient_attendance_at:=null; new.professional_attendance_at:=null;
 end if;
 return new;
end $$;
create trigger agenda_reset_attendance before update of starts_at,ends_at,patient_id on public.agenda_entries
 for each row execute function private.agenda_reset_attendance();

create or replace function public.agenda_upcoming_notifications() returns void language sql security invoker set search_path='' as $$
 insert into public.professional_notifications(professional_id,type,actor_name,resource_id,resource_type,title,metadata,dedupe_key)
 select professional_id,'appointment_changed',coalesce(contact_name,'Paciente'),id,'agenda_entry',
 'Confirma tu próxima cita con '||coalesce(contact_name,'Paciente'),jsonb_build_object('startsAt',starts_at,'upcoming',true),
 'upcoming:'||id||':'||starts_at::text from public.agenda_entries
 where kind='appointment' and status='confirmed' and starts_at>now() and starts_at<=now()+interval '48 hours'
 and (patient_attendance_at is null or professional_attendance_at is null)
 on conflict(dedupe_key) do nothing
$$;
revoke all on function private.agenda_queue_scheduled_entry(uuid),private.agenda_reset_attendance(),public.agenda_confirm_attendance(uuid,uuid) from public,anon,authenticated;
grant execute on function private.agenda_queue_scheduled_entry(uuid),private.agenda_reset_attendance(),public.agenda_confirm_attendance(uuid,uuid) to service_role;
commit;
