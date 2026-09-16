begin;
set local search_path = public, extensions;

-- All commands are server-only. Browser clients may read their own agenda,
-- but cannot insert appointments or bypass the common availability engine.
alter table public.availability_settings
  add column public_booking_enabled boolean not null default true,
  add column alternative_requests_enabled boolean not null default true,
  add column minimum_notice_minutes integer not null default 120
    check (minimum_notice_minutes between 0 and 43200);

alter table public.professional_locations add constraint professional_locations_owner_id_key unique(professional_id,id);
alter table public.availability_slots
  add column booking_modality text check (booking_modality in ('online','in_person')),
  add column booking_location_id uuid references public.professional_locations(id) on delete restrict,
  add constraint availability_slot_location_mode check
    (booking_location_id is null or booking_modality = 'in_person'),
  add constraint availability_booking_location_owner_fk foreign key(professional_id,booking_location_id)
    references public.professional_locations(professional_id,id) on delete restrict;
create index availability_booking_location_idx on public.availability_slots(booking_location_id)
  where booking_location_id is not null;

create table public.agenda_entries (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  kind text not null check (kind in ('appointment','block')),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  modality text check (modality in ('online','in_person')),
  location_snapshot jsonb,
  contact_name text check (char_length(contact_name) between 2 and 160),
  contact_email text check (char_length(contact_email) <= 320),
  email_verified_at timestamptz,
  patient_id uuid,
  source text not null check (source in ('public','professional','request','block')),
  outside_schedule_authorized boolean not null default false,
  calendar_status text not null default 'not_connected'
    check (calendar_status in ('not_connected','pending','synced','failed','conflict')),
  calendar_checked_at timestamptz,
  calendar_check_error text check (calendar_check_error = 'google_unavailable'),
  notification_status text not null default 'pending'
    check (notification_status in ('pending','sent','failed','unknown','not_required')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '1 day'),
  check (kind = 'block' or (contact_name is not null and contact_email is not null
    and email_verified_at is not null and modality is not null)),
  foreign key (professional_id,patient_id) references public.patients(professional_id,id) on delete restrict,
  unique(professional_id,id),
  exclude using gist (professional_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
    where (status = 'confirmed')
);
create index agenda_entries_owner_date_idx on public.agenda_entries(professional_id,starts_at);
create index agenda_entries_patient_idx on public.agenda_entries(professional_id,patient_id) where patient_id is not null;
create index agenda_entries_check_idx on public.agenda_entries(calendar_checked_at nulls first)
  where status='confirmed' and kind='appointment';

create table public.agenda_requests (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  contact_name text not null check (char_length(contact_name) between 2 and 160),
  contact_email text not null check (char_length(contact_email) <= 320),
  email_verified_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  timezone text not null,
  modality text not null check (modality in ('online','in_person')),
  location_id uuid references public.professional_locations(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'pending_professional' check (status in
    ('pending_professional','pending_requester','confirmed','rejected','cancelled','expired')),
  expires_at timestamptz not null,
  entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(professional_id,entry_id) references public.agenda_entries(professional_id,id),
  unique(professional_id,id)
);
create index agenda_requests_owner_status_idx on public.agenda_requests(professional_id,status,starts_at);
create index agenda_requests_entry_idx on public.agenda_requests(professional_id,entry_id) where entry_id is not null;
create index agenda_requests_location_idx on public.agenda_requests(location_id) where location_id is not null;

create table public.agenda_audit (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  actor text not null check (actor in ('professional','verified_contact','system')),
  action text not null,
  subject_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index agenda_audit_owner_subject_idx on public.agenda_audit(professional_id,subject_id,created_at);

create table private.agenda_verifications (
  id uuid primary key,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  email text not null check (char_length(email) <= 320),
  code_hash text not null,
  proof_hash text,
  attempts integer not null default 0 check (attempts between 0 and 6),
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index agenda_verifications_owner_idx on private.agenda_verifications(professional_id,created_at);
create unique index agenda_verifications_proof_idx on private.agenda_verifications(proof_hash) where proof_hash is not null;

create table private.agenda_operations (
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  operation_key uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(professional_id,operation_key)
);

-- Store encrypted refresh tokens, never plain credentials or browser-readable rows.
create table private.agenda_google_connections (
  professional_id uuid primary key references public.professional_profiles(id) on delete cascade,
  encrypted_refresh_token text not null,
  busy_calendar_ids text[] not null default '{}',
  write_calendar_id text,
  revision integer not null default 1,
  active boolean not null default false,
  needs_reauthorization boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.agenda_busy_checks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  connection_revision integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds')
);
create index agenda_busy_checks_owner_idx on private.agenda_busy_checks(professional_id,expires_at);

create table private.agenda_response_tokens (
  token_hash text primary key,
  professional_id uuid not null,
  request_id uuid not null,
  revision integer not null,
  action text not null check(action = 'respond'),
  expires_at timestamptz not null,
  used_at timestamptz,
  decision text check(decision in ('accept','reject')),
  result jsonb,
  foreign key(professional_id,request_id) references public.agenda_requests(professional_id,id) on delete cascade
);
create index agenda_response_request_idx on private.agenda_response_tokens(professional_id,request_id);

create table private.agenda_outbox (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  subject_id uuid not null,
  kind text not null check(kind in ('verification','confirmation','request','proposal','rejection','cancellation','calendar_insert','calendar_cancel')),
  revision integer not null default 1,
  payload jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','unknown')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_id text,
  error_code text,
  created_at timestamptz not null default now(),
  unique(professional_id,subject_id,kind,revision)
);
create index agenda_outbox_ready_idx on private.agenda_outbox(available_at) where status = 'pending';
create table private.agenda_rate_limits (
  bucket_hash text primary key,
  hits integer not null default 1,
  resets_at timestamptz not null
);
create table private.agenda_oauth_states (
  state_hash text primary key,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  purpose text not null check(purpose in ('gmail','calendar')),
  encrypted_verifier text not null,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create index agenda_oauth_owner_idx on private.agenda_oauth_states(professional_id);
create table private.agenda_mail_sender (
  singleton boolean primary key default true check(singleton),
  email text not null,
  encrypted_refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- Explicit grants: only the server can mutate core state. Owners get read-only
-- access so the app can render its own agenda using its normal authenticated client.
do $$ declare t text; begin
  foreach t in array array['agenda_entries','agenda_requests','agenda_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy owner_read on public.%I for select to authenticated using (professional_id = (select auth.uid()))',t);
  end loop;
  foreach t in array array['agenda_verifications','agenda_operations','agenda_google_connections','agenda_busy_checks','agenda_response_tokens','agenda_outbox','agenda_rate_limits','agenda_oauth_states','agenda_mail_sender'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public, anon, authenticated',t);
    execute format('grant all on private.%I to service_role',t);
  end loop;
end $$;
grant usage on schema private to service_role;
grant usage,select on sequence public.agenda_audit_id_seq to service_role;

-- A slot with no explicit assignment is usable only when its option is
-- unambiguous. A multi-location practice must assign each weekly slot.
create function private.agenda_choices(p_owner uuid)
returns table(modality text,location_id uuid)
language sql stable security invoker set search_path = '' as $$
  select 'online'::text,null::uuid from public.professional_profiles where id=p_owner and care_modalities && array['online','hybrid']
  union all
  select 'in_person',l.id from public.professional_locations l join public.professional_profiles p on p.id=l.professional_id
    where p.id=p_owner and l.is_active and p.care_modalities && array['in_person','hybrid']
$$;
create function private.agenda_options(p_owner uuid)
returns table(slot_id uuid,weekday integer,start_time time,end_time time,modality text,location_id uuid)
language sql stable security invoker set search_path = '' as $$
  with profile as (select care_modalities from public.professional_profiles where id=p_owner),
  locations as (select id from public.professional_locations where professional_id=p_owner and is_active),
  choices as (
    select 'online'::text mode,null::uuid place from profile where care_modalities && array['online','hybrid']
    union all
    select 'in_person',l.id from locations l,profile p where p.care_modalities && array['in_person','hybrid']
  )
  select s.id,s.weekday::integer,s.start_time,s.end_time,c.mode,c.place
  from public.availability_slots s cross join choices c
  where s.professional_id=p_owner and (
    (s.booking_modality is not null and s.booking_modality=c.mode and s.booking_location_id is not distinct from c.place)
    or (s.booking_modality is null and (select count(*) from choices)=1)
  )
$$;

-- Candidate instants are UTC, then checked against an IANA-local weekly range.
-- This preserves both distinct instants in a repeated DST hour, and does not
-- invent nonexistent wall-clock times. The full real interval must fit.
create function private.agenda_fits(p_owner uuid,p_start timestamptz,p_end timestamptz,p_mode text,p_location uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.availability_settings a,private.agenda_options(p_owner) o
    where a.professional_id=p_owner and o.modality=p_mode and o.location_id is not distinct from p_location
      and p_end = p_start + make_interval(mins=>a.default_duration_minutes)
      and extract(second from p_start)=0
      and mod(extract(epoch from ((p_start at time zone a.timezone)::time-o.start_time))::integer,a.default_duration_minutes*60)=0
      and not exists (
        select 1 from generate_series(p_start,p_end-interval '1 second',interval '1 minute') t
        where extract(dow from t at time zone a.timezone)::integer <> o.weekday
          or (t at time zone a.timezone)::time < o.start_time
          or (t at time zone a.timezone)::time >= o.end_time
      )
      and (p_end at time zone a.timezone) <= (p_start at time zone a.timezone)::date+o.end_time
  )
$$;

create function public.agenda_context(p_slug text,p_from date,p_days integer default 7)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare p public.professional_profiles; a public.availability_settings; data jsonb; begin
  select * into p from public.professional_profiles where public_slug=p_slug and is_public and onboarding_completed;
  if not found then return jsonb_build_object('error','profile_unavailable'); end if;
  select * into a from public.availability_settings where professional_id=p.id;
  if not found or not a.public_booking_enabled then return jsonb_build_object('error','booking_unavailable'); end if;
  if p_days not between 1 and 14 or p_from is null then raise exception 'invalid_range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('start',t,'end',t+make_interval(mins=>a.default_duration_minutes),
    'modality',o.modality,'locationId',o.location_id) order by t,o.modality,o.location_id),'[]') into data
  from generate_series(p_from::timestamp at time zone a.timezone,
    least((p_from+p_days)::timestamp at time zone a.timezone,
      (((now() at time zone a.timezone)::date+a.booking_horizon_days+1)::timestamp at time zone a.timezone))-interval '1 minute',
    interval '1 minute') t
  cross join (select distinct modality,location_id from private.agenda_options(p.id)) o
  where t >= now()+make_interval(mins=>a.minimum_notice_minutes)
    and private.agenda_fits(p.id,t,t+make_interval(mins=>a.default_duration_minutes),o.modality,o.location_id)
    and not exists(select 1 from public.agenda_entries e where e.professional_id=p.id and e.status='confirmed'
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(t,t+make_interval(mins=>a.default_duration_minutes),'[)'));
  return jsonb_build_object('professionalId',p.id,'name',p.full_name,'slug',p.public_slug,'timezone',a.timezone,
    'duration',a.default_duration_minutes,'horizonDays',a.booking_horizon_days,'minimumNoticeMinutes',a.minimum_notice_minutes,
    'requestsEnabled',a.alternative_requests_enabled,'hasSchedule',exists(select 1 from private.agenda_options(p.id)),
    'googleConnected',exists(select 1 from private.agenda_google_connections where professional_id=p.id and active),
    'locations',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'address',address)),'[]')
      from public.professional_locations where professional_id=p.id and is_active),
    'options',(select coalesce(jsonb_agg(x),'[]') from (select distinct modality,location_id from private.agenda_choices(p.id)) x),
    'slots',data);
end $$;

create function private.agenda_assert_time(p_owner uuid,p_start timestamptz,p_end timestamptz,p_mode text,p_location uuid,p_exception boolean,p_busy_check uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.availability_settings; g private.agenda_google_connections; begin
  select * into a from public.availability_settings where professional_id=p_owner for share;
  if not found or p_start is null or p_end is null or p_start < now()+make_interval(mins=>a.minimum_notice_minutes)
    or (p_start at time zone a.timezone)::date > (now() at time zone a.timezone)::date+a.booking_horizon_days
    or p_end<>p_start+make_interval(mins=>a.default_duration_minutes) then raise exception 'invalid_time'; end if;
  if not exists(select 1 from private.agenda_choices(p_owner) where modality=p_mode and location_id is not distinct from p_location)
    then raise exception 'invalid_option'; end if;
  if not p_exception and not private.agenda_fits(p_owner,p_start,p_end,p_mode,p_location) then raise exception 'outside_schedule'; end if;
  if exists(select 1 from public.agenda_entries where professional_id=p_owner and status='confirmed'
    and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'slot_taken'; end if;
  select * into g from private.agenda_google_connections where professional_id=p_owner and active for share;
  if found and (g.needs_reauthorization or not exists(select 1 from private.agenda_busy_checks
    where id=p_busy_check and professional_id=p_owner and connection_revision=g.revision
      and starts_at<=p_start and ends_at>=p_end and expires_at>clock_timestamp()
      and checked_at>=clock_timestamp()-interval '30 seconds')) then raise exception 'google_unavailable'; end if;
end $$;

create function private.agenda_insert_appointment(p_owner uuid,p_name text,p_email text,p_verified timestamptz,
  p_start timestamptz,p_end timestamptz,p_mode text,p_location uuid,p_source text,p_exception boolean,p_busy_check uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare entry uuid; connected boolean; tz text; location jsonb; begin
  perform private.agenda_assert_time(p_owner,p_start,p_end,p_mode,p_location,p_exception,p_busy_check);
  select timezone into tz from public.availability_settings where professional_id=p_owner;
  select jsonb_build_object('id',id,'name',name,'address',address) into location from public.professional_locations
    where id=p_location and professional_id=p_owner and is_active;
  select exists(select 1 from private.agenda_google_connections where professional_id=p_owner and active) into connected;
  insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,modality,location_snapshot,
    contact_name,contact_email,email_verified_at,source,outside_schedule_authorized,calendar_status)
  values(p_owner,'appointment',p_start,p_end,tz,p_mode,location,p_name,p_email,p_verified,p_source,p_exception,
    case when connected then 'pending' else 'not_connected' end) returning id into entry;
  insert into private.agenda_outbox(professional_id,subject_id,kind) values(p_owner,entry,'confirmation');
  if connected then
    insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
      select p_owner,entry,'calendar_insert',jsonb_build_object('calendarId',write_calendar_id,'eventId','n'||replace(entry::text,'-',''))
      from private.agenda_google_connections where professional_id=p_owner;
  end if;
  return entry;
end $$;

create function public.agenda_book(p_slug text,p_proof_hash text,p_operation_key uuid,p_payload jsonb,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; a public.availability_settings; v private.agenda_verifications;
  previous private.agenda_operations; entry uuid; answer jsonb; stamp timestamptz; finish timestamptz;
  mode text; place uuid; operation_payload jsonb; begin
  select id into owner_id from public.professional_profiles where public_slug=p_slug;
  if owner_id is null or p_operation_key is null then raise exception 'profile_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,981));
  operation_payload:=jsonb_build_object('kind','public','proof',p_proof_hash,'data',p_payload);
  select * into previous from private.agenda_operations where professional_id=owner_id and operation_key=p_operation_key;
  if found then
    if previous.payload<>operation_payload then raise exception 'idempotency_mismatch'; end if;
    return previous.result;
  end if;
  if not exists(select 1 from public.professional_profiles where id=owner_id and is_public and onboarding_completed)
    then raise exception 'profile_unavailable'; end if;
  select * into a from public.availability_settings where professional_id=owner_id for share;
  if not found or not a.public_booking_enabled then raise exception 'booking_unavailable'; end if;
  select * into v from private.agenda_verifications where professional_id=owner_id and proof_hash=p_proof_hash for update;
  if not found or v.verified_at is null or v.used_at is not null or v.expires_at<=now() then raise exception 'verification_required'; end if;
  if char_length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 160 or p_payload->>'kind' not in ('appointment','request')
    or p_payload->>'kind' is null then raise exception 'invalid_contact'; end if;
  stamp:=(p_payload->>'start')::timestamptz; finish:=stamp+make_interval(mins=>a.default_duration_minutes);
  mode:=p_payload->>'modality'; place:=nullif(p_payload->>'locationId','')::uuid;
  if p_payload->>'kind'='request' then
    if not a.alternative_requests_enabled or stamp is null or stamp<=now()
      or (stamp at time zone a.timezone)::date>(now() at time zone a.timezone)::date+a.booking_horizon_days
      or not exists(select 1 from private.agenda_choices(owner_id) where modality=mode and location_id is not distinct from place)
      then raise exception 'invalid_request'; end if;
    insert into public.agenda_requests(professional_id,contact_name,contact_email,email_verified_at,starts_at,ends_at,timezone,modality,location_id,expires_at)
    values(owner_id,btrim(p_payload->>'name'),v.email,v.verified_at,stamp,finish,a.timezone,mode,place,least(stamp,now()+interval '72 hours')) returning id into entry;
    insert into private.agenda_outbox(professional_id,subject_id,kind) values(owner_id,entry,'request');
    answer:=jsonb_build_object('id',entry,'status','pending_professional','start',stamp,'end',finish,'timezone',a.timezone);
  else
    entry:=private.agenda_insert_appointment(owner_id,btrim(p_payload->>'name'),v.email,v.verified_at,stamp,finish,mode,place,'public',false,p_busy_check);
    answer:=jsonb_build_object('id',entry,'status','confirmed','start',stamp,'end',finish,'timezone',a.timezone);
  end if;
  update private.agenda_verifications set used_at=now() where id=v.id;
  insert into private.agenda_operations values(owner_id,p_operation_key,operation_payload,answer,now());
  insert into public.agenda_audit(professional_id,actor,action,subject_id) values(owner_id,'verified_contact',p_payload->>'kind',entry);
  return answer;
end $$;

-- No permission to these RPCs for anon/authenticated. p_actor is a trusted
-- server argument, obtained from Auth.getUser(), never from a request body.
create function public.agenda_manage(p_actor uuid,p_operation_key uuid,p_payload jsonb,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.agenda_requests; e public.agenda_entries; previous private.agenda_operations;
  id uuid; answer jsonb; action text:=p_payload->>'action'; a public.availability_settings; begin
  if p_actor is null or p_operation_key is null then raise exception 'unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,981));
  select * into previous from private.agenda_operations where professional_id=p_actor and operation_key=p_operation_key;
  if found then
    if previous.payload<>jsonb_build_object('kind','manage','data',p_payload-'tokenHash'-'encryptedToken') then raise exception 'idempotency_mismatch'; end if;
    return previous.result;
  end if;
  select * into a from public.availability_settings where professional_id=p_actor;
  if action in ('accept','propose','reject') then
    select * into r from public.agenda_requests where agenda_requests.id=(p_payload->>'id')::uuid and professional_id=p_actor for update;
    if not found then raise exception 'not_found'; end if;
    if r.status not in ('pending_professional','pending_requester') or r.expires_at<=now() then raise exception 'request_expired'; end if;
    if action='accept' then
      if r.status<>'pending_professional' then raise exception 'invalid_transition'; end if;
      id:=private.agenda_insert_appointment(p_actor,r.contact_name,r.contact_email,r.email_verified_at,r.starts_at,r.ends_at,
        r.modality,r.location_id,'request',coalesce((p_payload->>'allowOutsideSchedule')::boolean,false),p_busy_check);
      update public.agenda_requests set status='confirmed',entry_id=id,updated_at=now() where agenda_requests.id=r.id;
    elsif action='reject' then
      update public.agenda_requests set status='rejected',updated_at=now() where agenda_requests.id=r.id;
      insert into private.agenda_outbox(professional_id,subject_id,kind,revision) values(p_actor,r.id,'rejection',r.revision);
    else
      if p_payload->>'tokenHash' is null or p_payload->>'encryptedToken' is null then raise exception 'invalid_token'; end if;
      perform private.agenda_assert_time(p_actor,(p_payload->>'start')::timestamptz,
        (p_payload->>'start')::timestamptz+make_interval(mins=>a.default_duration_minutes),r.modality,r.location_id,true,p_busy_check);
      update public.agenda_requests set status='pending_requester',revision=revision+1,
        starts_at=(p_payload->>'start')::timestamptz,ends_at=(p_payload->>'start')::timestamptz+make_interval(mins=>a.default_duration_minutes),
        expires_at=least((p_payload->>'start')::timestamptz,now()+interval '48 hours'),updated_at=now()
        where agenda_requests.id=r.id returning * into r;
      insert into private.agenda_response_tokens(token_hash,professional_id,request_id,revision,action,expires_at)
        values(p_payload->>'tokenHash',p_actor,r.id,r.revision,'respond',r.expires_at);
      insert into private.agenda_outbox(professional_id,subject_id,kind,revision,payload)
        values(p_actor,r.id,'proposal',r.revision,jsonb_build_object('encryptedToken',p_payload->>'encryptedToken'));
    end if;
    answer:=jsonb_build_object('id',r.id,'status',case action when 'accept' then 'confirmed' when 'reject' then 'rejected' else 'pending_requester' end);
  elsif action in ('cancel','link') then
    select * into e from public.agenda_entries where agenda_entries.id=(p_payload->>'id')::uuid and professional_id=p_actor for update;
    if not found then raise exception 'not_found'; end if;
    if action='cancel' then
      update public.agenda_entries set status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where agenda_entries.id=e.id;
      if e.status='confirmed' and e.kind='appointment' then
        insert into private.agenda_outbox(professional_id,subject_id,kind) values(p_actor,e.id,'cancellation') on conflict do nothing;
        if e.calendar_status<>'not_connected' then
          insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
            select p_actor,e.id,'calendar_cancel',payload from private.agenda_outbox where subject_id=e.id and kind='calendar_insert' on conflict do nothing;
        end if;
      end if;
      update public.agenda_requests set status='cancelled',updated_at=now() where professional_id=p_actor and entry_id=e.id;
    else
      if e.kind<>'appointment' or not exists(select 1 from public.patients where patients.id=(p_payload->>'patientId')::uuid and professional_id=p_actor and deleted_at is null)
        then raise exception 'invalid_patient'; end if;
      update public.agenda_entries set patient_id=(p_payload->>'patientId')::uuid where agenda_entries.id=e.id;
    end if;
    answer:=jsonb_build_object('id',e.id,'status',case action when 'cancel' then 'cancelled' else e.status end);
  elsif action='block' then
    if (p_payload->>'start')::timestamptz<=now() then raise exception 'invalid_time'; end if;
    insert into public.agenda_entries(professional_id,kind,starts_at,ends_at,timezone,source,notification_status)
      values(p_actor,'block',(p_payload->>'start')::timestamptz,(p_payload->>'end')::timestamptz,a.timezone,'block','not_required') returning agenda_entries.id into id;
    answer:=jsonb_build_object('id',id,'status','confirmed');
  else raise exception 'invalid_action'; end if;
  insert into private.agenda_operations values(p_actor,p_operation_key,jsonb_build_object('kind','manage','data',p_payload-'tokenHash'-'encryptedToken'),answer,now());
  insert into public.agenda_audit(professional_id,actor,action,subject_id,details)
    values(p_actor,'professional',action,(answer->>'id')::uuid,case when action='link' then jsonb_build_object('previousPatientId',e.patient_id,'patientId',p_payload->>'patientId') else '{}' end);
  return answer;
end $$;

create function public.agenda_respond(p_token_hash text,p_decision text,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t private.agenda_response_tokens; r public.agenda_requests; entry uuid; answer jsonb; begin
  select * into t from private.agenda_response_tokens where token_hash=p_token_hash;
  if not found then raise exception 'invalid_token'; end if;
  perform pg_advisory_xact_lock(hashtextextended(t.professional_id::text,981));
  select * into t from private.agenda_response_tokens where token_hash=p_token_hash for update;
  if t.used_at is not null then
    if t.decision<>p_decision then raise exception 'token_used'; end if;
    return t.result;
  end if;
  select * into r from public.agenda_requests where id=t.request_id for update;
  if t.expires_at<=now() or r.expires_at<=now() or r.revision<>t.revision or r.status<>'pending_requester' then raise exception 'request_expired'; end if;
  if p_decision='accept' then
    entry:=private.agenda_insert_appointment(t.professional_id,r.contact_name,r.contact_email,r.email_verified_at,
      r.starts_at,r.ends_at,r.modality,r.location_id,'request',true,p_busy_check);
    update public.agenda_requests set status='confirmed',entry_id=entry,updated_at=now() where id=r.id;
    answer:=jsonb_build_object('id',entry,'status','confirmed');
  elsif p_decision='reject' then
    update public.agenda_requests set status='rejected',updated_at=now() where id=r.id;
    answer:=jsonb_build_object('id',r.id,'status','rejected');
  else raise exception 'invalid_action'; end if;
  update private.agenda_response_tokens set used_at=now(),decision=p_decision,result=answer where token_hash=p_token_hash;
  insert into public.agenda_audit(professional_id,actor,action,subject_id) values(t.professional_id,'verified_contact',p_decision,r.id);
  return answer;
end $$;

create function public.agenda_check_code(p_id uuid,p_code_hash text,p_proof_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v private.agenda_verifications; begin
  select * into v from private.agenda_verifications where id=p_id for update;
  if not found or v.expires_at<=now() or v.used_at is not null or v.attempts>=6 or v.verified_at is not null
    then return '{"error":"invalid_code"}'::jsonb; end if;
  update private.agenda_verifications set attempts=attempts+1 where id=p_id;
  if v.code_hash<>p_code_hash then return '{"error":"invalid_code"}'::jsonb; end if;
  update private.agenda_verifications set verified_at=now(),proof_hash=p_proof_hash,expires_at=now()+interval '15 minutes' where id=p_id;
  return '{"verified":true}'::jsonb;
end $$;

create function public.agenda_rate_limit(p_bucket_hash text,p_max integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare used integer; begin
  if p_max not between 1 and 1000 or p_seconds not between 1 and 86400 then return false; end if;
  insert into private.agenda_rate_limits(bucket_hash,hits,resets_at) values(p_bucket_hash,1,now()+make_interval(secs=>p_seconds))
    on conflict(bucket_hash) do update set hits=case when agenda_rate_limits.resets_at<=now() then 1 else agenda_rate_limits.hits+1 end,
      resets_at=case when agenda_rate_limits.resets_at<=now() then now()+make_interval(secs=>p_seconds) else agenda_rate_limits.resets_at end
    returning hits into used;
  return used<=p_max;
end $$;

-- Narrow, service-role-only access to the non-exposed schema for the Edge
-- Function. No private schema is added to the public Data API.
create function public.agenda_server(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid:=nullif(p_data->>'owner','')::uuid; answer jsonb; job private.agenda_outbox;
  t private.agenda_response_tokens; r public.agenda_requests; state private.agenda_oauth_states;
  operation private.agenda_operations; expected jsonb; checked public.agenda_entries; begin
  if p_action='resolve_local' then
    return jsonb_build_object('instants',(select coalesce(jsonb_agg(candidate.instant order by candidate.instant),'[]')
      from public.availability_settings a,
      generate_series(((p_data->>'localTime')::timestamp at time zone 'UTC')-interval '15 hours',
        ((p_data->>'localTime')::timestamp at time zone 'UTC')+interval '15 hours',interval '1 minute') candidate(instant)
      where a.professional_id=owner_id and candidate.instant at time zone a.timezone=(p_data->>'localTime')::timestamp));
  elsif p_action in ('replay','replay_manage') then
    if p_action='replay' then
      select id into owner_id from public.professional_profiles where public_slug=p_data->>'slug';
      expected:=jsonb_build_object('kind','public','proof',p_data->>'proof','data',p_data->'payload');
    else expected:=jsonb_build_object('kind','manage','data',(p_data->'payload')-'tokenHash'-'encryptedToken'); end if;
    select * into operation from private.agenda_operations where professional_id=owner_id and operation_key=(p_data->>'key')::uuid;
    if not found then return '{}'; end if;
    if operation.payload<>expected then return '{"error":"idempotency_mismatch"}'; end if;
    return jsonb_build_object('result',operation.result);
  elsif p_action='verification_status' then
    return jsonb_build_object('valid',exists(select 1 from private.agenda_verifications where id=(p_data->>'id')::uuid and expires_at>now() and verified_at is null));
  elsif p_action='create_verification' then
    if not exists(select 1 from public.professional_profiles p join public.availability_settings a on a.professional_id=p.id
      where p.id=owner_id and p.is_public and p.onboarding_completed and a.public_booking_enabled) then raise exception 'profile_unavailable'; end if;
    insert into private.agenda_verifications(id,professional_id,email,code_hash,expires_at)
      values((p_data->>'id')::uuid,owner_id,p_data->>'email',p_data->>'codeHash',now()+interval '10 minutes');
    insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
      values(owner_id,(p_data->>'id')::uuid,'verification',jsonb_build_object('encryptedCode',p_data->>'encryptedCode','email',p_data->>'email'));
    return '{"created":true}';
  elsif p_action='credentials' then
    return jsonb_build_object('calendar',(select to_jsonb(g) from private.agenda_google_connections g where professional_id=owner_id),
      'sender',(select to_jsonb(s) from private.agenda_mail_sender s where singleton));
  elsif p_action='oauth_begin' then
    insert into private.agenda_oauth_states(state_hash,professional_id,purpose,encrypted_verifier)
      values(p_data->>'stateHash',owner_id,p_data->>'purpose',p_data->>'encryptedVerifier');
    return '{}';
  elsif p_action='oauth_consume' then
    delete from private.agenda_oauth_states where state_hash=p_data->>'stateHash' returning * into state;
    if not found or state.expires_at<=now() then return '{"error":"invalid_oauth_state"}'; end if;
    return to_jsonb(state);
  elsif p_action='oauth_save' then
    if p_data->>'purpose'='gmail' then
      insert into private.agenda_mail_sender(singleton,email,encrypted_refresh_token)
        values(true,p_data->>'email',p_data->>'encryptedToken') on conflict(singleton) do update
        set email=excluded.email,encrypted_refresh_token=excluded.encrypted_refresh_token,updated_at=now();
    else
      insert into private.agenda_google_connections(professional_id,encrypted_refresh_token)
        values(owner_id,p_data->>'encryptedToken') on conflict(professional_id) do update
        set encrypted_refresh_token=excluded.encrypted_refresh_token,needs_reauthorization=false,revision=agenda_google_connections.revision+1,updated_at=now();
    end if;
    return '{}';
  elsif p_action='calendars' then
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,981));
    if jsonb_array_length(p_data->'busy') not between 1 and 20 or nullif(p_data->>'write','') is null then raise exception 'invalid_calendars'; end if;
    update private.agenda_google_connections set busy_calendar_ids=array(select jsonb_array_elements_text(p_data->'busy')),
      write_calendar_id=p_data->>'write',active=true,revision=revision+1,updated_at=now() where professional_id=owner_id;
    if not found then raise exception 'google_unavailable'; end if;
    return '{}';
  elsif p_action='busy_clear' then
    insert into private.agenda_busy_checks(professional_id,connection_revision,starts_at,ends_at)
      values(owner_id,(p_data->>'revision')::integer,(p_data->>'start')::timestamptz,(p_data->>'end')::timestamptz) returning jsonb_build_object('id',id) into answer;
    return answer;
  elsif p_action='response_info' then
    select * into t from private.agenda_response_tokens where token_hash=p_data->>'tokenHash';
    if not found then return '{"error":"invalid_token"}'; end if;
    if t.used_at is not null then return jsonb_build_object('result',t.result,'decision',t.decision); end if;
    select * into r from public.agenda_requests where id=t.request_id;
    if r.revision<>t.revision or r.status<>'pending_requester' or t.expires_at<=now() or r.expires_at<=now() then return '{"error":"request_expired"}'; end if;
    return jsonb_build_object('professionalId',r.professional_id,'name',(select full_name from public.professional_profiles where id=r.professional_id),
      'start',r.starts_at,'end',r.ends_at,'timezone',r.timezone,'modality',r.modality,'location',(select jsonb_build_object('name',name,'address',address) from public.professional_locations where id=r.location_id),'expiresAt',r.expires_at);
  elsif p_action='claim_job' then
    -- Serialize short claims, not provider calls. This prevents two workers
    -- claiming insert/cancel jobs for the same event in the same snapshot.
    perform pg_advisory_xact_lock(981,2);
    -- A timed-out send may have succeeded. Never automatically repeat an
    -- uncertain email. Calendar inserts are recoverable by deterministic ID.
    with expired as (
      update private.agenda_outbox set status=case when kind like 'calendar_%' then 'pending' else 'unknown' end,
        error_code='worker_interrupted' where status='processing' and claimed_at<now()-interval '5 minutes'
        returning subject_id,kind
    ) update public.agenda_entries set notification_status='unknown'
      where id in (select subject_id from expired where kind='confirmation');
    select o.* into job from private.agenda_outbox o where o.status='pending' and o.available_at<=now()
      and (owner_id is null or o.professional_id=owner_id)
      and (nullif(p_data->>'subject','') is null or o.subject_id=(p_data->>'subject')::uuid)
      and (o.kind not like 'calendar_%' or not exists(
        select 1 from private.agenda_outbox running where running.subject_id=o.subject_id
        and running.kind like 'calendar_%' and running.status='processing'))
      order by o.created_at,o.id for update of o skip locked limit 1;
    if not found then return 'null'; end if;
    update private.agenda_outbox set status='processing',claimed_at=now(),attempts=attempts+1 where id=job.id returning * into job;
    return to_jsonb(job)||jsonb_build_object('entry',(select to_jsonb(e) from public.agenda_entries e where e.id=job.subject_id),
      'request',(select to_jsonb(q) from public.agenda_requests q where q.id=job.subject_id),
      'professional',(select jsonb_build_object('name',full_name,'slug',public_slug) from public.professional_profiles where id=job.professional_id));
  elsif p_action='complete_job' then
    select * into job from private.agenda_outbox where id=(p_data->>'id')::uuid and status='processing'
      and attempts=(p_data->>'attempt')::integer for update;
    -- A recovered lease fences completion by the superseded worker.
    if not found then return '{"stale":true}'; end if;
    update private.agenda_outbox set status=p_data->>'status',provider_id=p_data->>'providerId',error_code=p_data->>'errorCode',
      available_at=now()+interval '5 minutes' where id=job.id;
    if job.kind like 'calendar_%' then
      update public.agenda_entries set calendar_status=case
        when p_data->>'status'='pending' or (status='cancelled' and job.kind='calendar_insert') then 'pending'
        when p_data->>'status'='sent' then 'synced' else 'failed' end where id=job.subject_id;
    elsif job.kind='confirmation' then
      update public.agenda_entries set notification_status=case when p_data->>'status'='sent' then 'sent' when p_data->>'status'='unknown' then 'unknown' else 'failed' end where id=job.subject_id;
    end if;
    return '{}';
  elsif p_action='claim_calendar_check' then
    select e.* into checked from public.agenda_entries e
      join private.agenda_google_connections g on g.professional_id=e.professional_id and g.active
      where e.status='confirmed' and e.kind='appointment' and e.ends_at>now()
        and (owner_id is null or e.professional_id=owner_id)
        and (e.calendar_checked_at is null or e.calendar_checked_at<now()-interval '15 minutes')
        and exists(select 1 from private.agenda_outbox o where o.subject_id=e.id and o.kind='calendar_insert' and o.status='sent')
      order by e.calendar_checked_at nulls first,e.starts_at for update of e skip locked limit 1;
    if not found then return 'null'; end if;
    update public.agenda_entries set calendar_checked_at=clock_timestamp() where id=checked.id returning * into checked;
    return jsonb_build_object('entry',to_jsonb(checked),'target',(select payload from private.agenda_outbox where subject_id=checked.id and kind='calendar_insert'),
      'revision',(select revision from private.agenda_google_connections where professional_id=checked.professional_id));
  elsif p_action='complete_calendar_check' then
    select * into checked from public.agenda_entries where id=(p_data->>'id')::uuid and status='confirmed'
      and calendar_checked_at=(p_data->>'checkedAt')::timestamptz for update;
    if not found or not exists(select 1 from private.agenda_google_connections g where g.professional_id=checked.professional_id
      and g.active and g.revision=(p_data->>'revision')::integer) then return '{"stale":true}'; end if;
    update public.agenda_entries set calendar_check_error=case when p_data->>'error'='google_unavailable' then 'google_unavailable' else null end,
      calendar_status=case when p_data->>'error'='google_unavailable' then calendar_status
        when (p_data->>'conflict')::boolean then 'conflict' else 'synced' end where id=checked.id;
    if p_data->>'error' is null and coalesce((p_data->>'conflict')::boolean,false)<>(checked.calendar_status='conflict') then
      insert into public.agenda_audit(professional_id,actor,action,subject_id)
        values(checked.professional_id,'system',case when (p_data->>'conflict')::boolean then 'calendar_conflict_detected' else 'calendar_conflict_cleared' end,checked.id);
    end if;
    return '{}';
  elsif p_action='retry_sync' then
    update private.agenda_outbox set status='pending',available_at=now() where professional_id=owner_id and subject_id=(p_data->>'id')::uuid
      and kind like 'calendar_%' and status in ('failed','unknown');
    return '{}';
  elsif p_action='expire' then
    update public.agenda_requests set status='expired',updated_at=now() where status in ('pending_professional','pending_requester') and expires_at<=now();
    delete from private.agenda_oauth_states where expires_at<now()-interval '1 hour';
    delete from private.agenda_busy_checks where expires_at<now()-interval '1 hour';
    delete from private.agenda_rate_limits where resets_at<now()-interval '1 day';
    delete from private.agenda_verifications where expires_at<now()-interval '1 day';
    return '{}';
  end if;
  raise exception 'invalid_server_action';
end $$;

-- Pin privileges for every function introduced here (including private helpers).
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace)
    and proname in ('agenda_choices','agenda_options','agenda_fits','agenda_context','agenda_assert_time','agenda_insert_appointment','agenda_book','agenda_manage','agenda_respond','agenda_check_code','agenda_rate_limit','agenda_server') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
