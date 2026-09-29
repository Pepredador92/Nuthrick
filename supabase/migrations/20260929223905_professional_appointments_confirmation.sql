begin;
alter table public.agenda_entries add column patient_confirmed_at timestamptz;
-- Existing consent is evidence of a public reservation, never inferred from
-- the professional's confirmation or from the fact that a slot is occupied.
update public.agenda_entries set patient_confirmed_at=registration_consented_at where registration_consented_at is not null;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.agenda_entries'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%email_verified_at IS NOT NULL%' loop
   execute format('alter table public.agenda_entries drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.agenda_entries add constraint agenda_contact_origin_check check (
 kind='block' or (contact_name is not null and modality is not null and
 (source='professional' or (contact_email is not null and email_verified_at is not null))));
create function private.agenda_patient_confirmation() returns trigger language plpgsql set search_path='' as $$ begin
 if new.patient_confirmed_at is null and new.registration_consented_at is not null then
  new.patient_confirmed_at:=new.registration_consented_at;
 end if;
 return new;
end $$;
create trigger agenda_patient_confirmation before insert or update of registration_consented_at on public.agenda_entries
 for each row execute function private.agenda_patient_confirmation();

create table private.appointment_links (
 entry_id uuid primary key references public.agenda_entries(id) on delete cascade,
 token_hash text not null unique,
 encrypted_token text not null,
 starts_at timestamptz not null,
 expires_at timestamptz not null
);
alter table private.appointment_links enable row level security;
grant all on private.appointment_links to service_role;

-- Used by patient-facing appointment and presence endpoints. Access is checked
-- against the current link/email, so revocation invalidates an existing session.
create function private.active_portal_patient(p_hash text) returns uuid
language sql stable security invoker set search_path='' as $$
 select p.id from private.portal_sessions s join public.patients p on p.id=s.patient_id
 join private.patient_portals portal on portal.patient_id=p.id
 where s.token_hash=p_hash and s.expires_at>now() and p.portal_access_enabled
 and p.deleted_at is null and p.status<>'archived'
 and portal.link_hash is not null and portal.link_expires_at>now()
 and s.link_hash=portal.link_hash and s.email is not distinct from portal.recipient_email
 and nullif(lower(btrim(p.email)),'') is not distinct from portal.recipient_email
$$;

create function private.appointment_projection(e public.agenda_entries) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'starts_at',e.starts_at,'ends_at',e.ends_at,'timezone',e.timezone,
 'modality',e.modality,'location_snapshot',e.location_snapshot,'status',e.status,
 'patient_confirmed_at',e.patient_confirmed_at,'professional_confirmed_at',e.professional_confirmed_at,
 'professional_name',(select full_name from public.professional_profiles where id=e.professional_id))
$$;

create function public.agenda_appointment_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=(p_data->>'owner')::uuid; pid uuid; p public.patients;
 e public.agenda_entries; a public.availability_settings; saved private.agenda_operations;
 link private.appointment_links; stamp timestamptz; finish timestamptz; mode text; place uuid; result jsonb;
begin
 if octet_length(p_data::text)>16000 then raise exception 'invalid_input'; end if;
 if p_action in ('options','create','link','replay_create') and owner_id is null then raise exception 'unauthorized'; end if;
 if owner_id is not null then perform private.require_entitlement(owner_id,'agenda'); end if;
 if p_action='replay_create' then
  select * into saved from private.agenda_operations where professional_id=owner_id and operation_key=(p_data->>'operationKey')::uuid;
  if not found then return null; end if;
  if saved.payload<>jsonb_build_object('kind','manual_appointment','data',p_data) then raise exception 'idempotency_mismatch'; end if;
  return saved.result;
 elsif p_action='options' then
  select * into a from public.availability_settings where professional_id=owner_id;
  if not found then raise exception 'booking_unavailable'; end if;
  return jsonb_build_object('timezone',a.timezone,'duration',a.default_duration_minutes,
   'minimumNoticeMinutes',a.minimum_notice_minutes,'horizonDays',a.booking_horizon_days,
   'options',(select coalesce(jsonb_agg(jsonb_build_object('modality',c.modality,'location_id',c.location_id,
     'label',case when c.modality='online' then 'En línea' else l.name end)),'[]')
     from private.agenda_choices(owner_id) c left join public.professional_locations l on l.id=c.location_id));
 elsif p_action='create' then
  if p_data->>'operationKey' is null then raise exception 'invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,981));
  select * into saved from private.agenda_operations where professional_id=owner_id and operation_key=(p_data->>'operationKey')::uuid;
  if found then
   if saved.payload<>jsonb_build_object('kind','manual_appointment','data',p_data-'busyCheck') then raise exception 'idempotency_mismatch'; end if;
   return saved.result;
  end if;
  select * into p from public.patients where id=(p_data->>'patientId')::uuid and professional_id=owner_id and deleted_at is null and status='active' for share;
  if not found then raise exception 'invalid_patient'; end if;
  select * into a from public.availability_settings where professional_id=owner_id;
  stamp:=(p_data->>'start')::timestamptz; finish:=stamp+make_interval(mins=>a.default_duration_minutes);
  mode:=p_data->>'modality'; place:=(p_data->>'locationId')::uuid;
  perform private.agenda_assert_time(owner_id,stamp,finish,mode,place,coalesce((p_data->>'allowOutsideSchedule')::boolean,false),(p_data->>'busyCheck')::uuid);
  insert into public.agenda_entries(professional_id,patient_id,kind,source,starts_at,ends_at,timezone,modality,
   location_snapshot,contact_name,contact_email,contact_phone,requires_confirmation,notification_status,outside_schedule_authorized)
  values(owner_id,p.id,'appointment','professional',stamp,finish,a.timezone,mode,
   (select jsonb_build_object('id',id,'name',name,'address',address) from public.professional_locations where id=place),
   p.full_name,p.email,case when p.phone like '+%' then p.phone else coalesce(p.country_code,'')||p.phone end,true,'not_required',
   coalesce((p_data->>'allowOutsideSchedule')::boolean,false)) returning * into e;
  result:=private.appointment_projection(e);
  insert into private.agenda_operations values(owner_id,(p_data->>'operationKey')::uuid,jsonb_build_object('kind','manual_appointment','data',p_data-'busyCheck'),result,now());
  insert into public.agenda_audit(professional_id,actor,action,subject_id) values(owner_id,'professional','create_appointment',e.id);
  return result;
 elsif p_action='link' then
  select * into e from public.agenda_entries where id=(p_data->>'id')::uuid and professional_id=owner_id and kind='appointment' for update;
  if not found or e.status<>'confirmed' or e.starts_at<=now() then raise exception 'invalid_transition'; end if;
  select * into link from private.appointment_links where entry_id=e.id;
  if not found or link.starts_at<>e.starts_at or link.expires_at<=now() then
   if nullif(p_data->>'tokenHash','') is null or nullif(p_data->>'encryptedToken','') is null then raise exception 'invalid_token'; end if;
   insert into private.appointment_links values(e.id,p_data->>'tokenHash',p_data->>'encryptedToken',e.starts_at,e.starts_at)
   on conflict(entry_id) do update set token_hash=excluded.token_hash,encrypted_token=excluded.encrypted_token,starts_at=excluded.starts_at,expires_at=excluded.expires_at
   returning * into link;
  end if;
  return jsonb_build_object('encryptedToken',link.encrypted_token,'phone',e.contact_phone);
 elsif p_action in ('list','patient_confirm','info') then
  if p_data->>'sessionHash' is not null then
   pid:=private.active_portal_patient(p_data->>'sessionHash');
   if pid is null then raise exception 'portal_unavailable'; end if;
   select professional_id into owner_id from public.patients where id=pid;
   perform private.require_portal_capability(owner_id,'view',null);
  elsif owner_id is not null and p_action='list' then pid:=(p_data->>'patientId')::uuid;
  else
   select * into link from private.appointment_links where token_hash=p_data->>'tokenHash' and expires_at>now();
   if not found then raise exception 'invalid_token'; end if;
   select * into e from public.agenda_entries where id=link.entry_id;
   if e.status<>'confirmed' or e.starts_at<>link.starts_at then raise exception 'invalid_token'; end if;
  end if;
  if p_action='list' then
   if owner_id is null then raise exception 'unauthorized'; end if;
   return jsonb_build_object('appointments',(select coalesce(jsonb_agg(t.value order by t.starts_at),'[]') from (
    select private.appointment_projection(entry)||case when p_data->>'owner' is not null
      then jsonb_build_object('contact_name',entry.contact_name,'contact_phone',entry.contact_phone,'patient_id',entry.patient_id) else '{}'::jsonb end value,entry.starts_at
    from public.agenda_entries entry where entry.professional_id=owner_id and (pid is null or entry.patient_id=pid)
     and entry.kind='appointment' and entry.status='confirmed' and entry.starts_at>now()
    order by entry.starts_at limit 50) t));
  end if;
  if pid is not null then
   select * into e from public.agenda_entries where id=(p_data->>'id')::uuid and patient_id=pid and professional_id=owner_id and kind='appointment';
   if not found then raise exception 'not_found'; end if;
  end if;
  if e.status<>'confirmed' or e.starts_at<=now() then raise exception 'invalid_transition'; end if;
  if p_action='patient_confirm' then
   -- Same owner lock as creation/cancellation/professional confirmation.
   perform pg_advisory_xact_lock(hashtextextended(e.professional_id::text,981));
   select * into e from public.agenda_entries where id=e.id for update;
   if e.status<>'confirmed' or e.starts_at<=now() or (link.entry_id is not null and e.starts_at<>link.starts_at) then raise exception 'invalid_transition'; end if;
   if e.patient_confirmed_at is null then
    update public.agenda_entries set patient_confirmed_at=now() where id=e.id returning * into e;
    insert into public.agenda_audit(professional_id,actor,action,subject_id) values(e.professional_id,'verified_contact','patient_confirm',e.id);
   end if;
  end if;
  return private.appointment_projection(e);
 end if;
 raise exception 'invalid_action';
end $$;

create function private.appointment_confirmation_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.patient_confirmed_at is distinct from old.patient_confirmed_at and new.patient_confirmed_at is not null then
  insert into public.professional_notifications(professional_id,type,actor_name,resource_id,resource_type,title,metadata,dedupe_key)
  values(new.professional_id,'appointment_changed',coalesce(new.contact_name,'Paciente'),new.id,'agenda_entry',
   coalesce(new.contact_name,'Paciente')||' confirmó su cita',jsonb_build_object('startsAt',new.starts_at),'patient-confirmed:'||new.id)
  on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;
create trigger appointment_confirmation_notification after update of patient_confirmed_at on public.agenda_entries
 for each row execute function private.appointment_confirmation_notification();

create function public.agenda_upcoming_notifications() returns void language sql security invoker set search_path='' as $$
 insert into public.professional_notifications(professional_id,type,actor_name,resource_id,resource_type,title,metadata,dedupe_key)
 select professional_id,'appointment_changed',coalesce(contact_name,'Paciente'),id,'agenda_entry',
 'Próxima cita: '||coalesce(contact_name,'Paciente'),jsonb_build_object('startsAt',starts_at,'upcoming',true),
 'upcoming:'||id||':'||starts_at::text from public.agenda_entries
 where kind='appointment' and status='confirmed' and starts_at>now() and starts_at<=now()+interval '24 hours'
 on conflict(dedupe_key) do nothing
$$;

-- A manual appointment can be made for a patient without an email. Calendar
-- creation still works, while mail is queued only for an existing recipient.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('public.agenda_confirm_reservation(uuid,uuid,jsonb,uuid)'::regprocedure);
 amended:=original;
 amended:=replace(amended,'insert into private.agenda_outbox(professional_id,subject_id,kind,revision) values(p_actor,e.id,''confirmation'',2);',
 'if nullif(btrim(e.contact_email),'''') is not null then
 insert into private.agenda_outbox(professional_id,subject_id,kind,revision) values(p_actor,e.id,''confirmation'',2);
 else update public.agenda_entries set notification_status=''not_required'' where id=e.id; end if;');
 if amended=original then raise exception 'confirmation_patch_missing'; end if;
 execute amended;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace)
 and proname in ('agenda_patient_confirmation','active_portal_patient','appointment_projection','agenda_appointment_action','appointment_confirmation_notification','agenda_upcoming_notifications') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
