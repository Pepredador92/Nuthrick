begin;

-- status='confirmed' continues to mean a durable time allocation for the
-- exclusion constraint. requires_confirmation tracks professional approval
-- separately: pending reservations occupy time but are not final appointments.
alter table public.agenda_entries
  add column requires_confirmation boolean not null default false,
  add column professional_confirmed_at timestamptz,
  add column contact_birth_date date,
  add column contact_country_code text check (contact_country_code ~ '^\+[1-9][0-9]{0,2}$'),
  add column contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column registration_status text not null default 'none' check (registration_status in ('none','created','review')),
  add column registration_consented_at timestamptz;
alter table public.agenda_requests
  add column patient_id uuid,
  add column contact_birth_date date,
  add column contact_country_code text check (contact_country_code ~ '^\+[1-9][0-9]{0,2}$'),
  add column contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column registration_status text not null default 'none' check (registration_status in ('none','created','review')),
  add column registration_consented_at timestamptz,
  add foreign key (professional_id,patient_id) references public.patients(professional_id,id) on delete restrict;
create index agenda_requests_patient_idx on public.agenda_requests(professional_id,patient_id);
create index if not exists patients_owner_phone_agenda_idx on public.patients(professional_id,phone) where phone is not null;

create function public.agenda_book_registered(p_slug text,p_proof_hash text,p_operation_key uuid,p_payload jsonb,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare answer jsonb; owner_id uuid; subject uuid; patient uuid; mail text; tz text;
  registration jsonb:=p_payload->'registration'; birthday date; country text; v_phone text; fullname text; duplicate boolean;
begin
  if registration is null or jsonb_typeof(registration)<>'object' or registration->>'consent' is distinct from 'true'
    then raise exception 'registration_required'; end if;
  begin birthday:=(registration->>'birthDate')::date;
  exception when others then raise exception 'invalid_birth_date'; end;
  country:=registration->>'countryCode'; v_phone:=registration->>'phone';
  if birthday is null or birthday<date '1900-01-01' or birthday>current_date then raise exception 'invalid_birth_date'; end if;
  if country is null or country !~ '^\+[1-9][0-9]{0,2}$' or v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or left(v_phone,length(country))<>country then raise exception 'invalid_phone'; end if;
  -- The existing core acquires the professional lock, checks the verified
  -- email, profile, fresh Google permit, conflicts and durable idempotency.
  -- Everything below is in that SAME transaction: failures roll it all back.
  answer:=public.agenda_book(p_slug,p_proof_hash,p_operation_key,p_payload,p_busy_check);
  subject:=(answer->>'id')::uuid;
  if p_payload->>'kind'='appointment' then
    select professional_id,contact_email,timezone,contact_name,patient_id into owner_id,mail,tz,fullname,patient
      from public.agenda_entries where id=subject;
    if exists(select 1 from public.agenda_entries where id=subject and registration_consented_at is not null) then return answer; end if;
  else
    select professional_id,contact_email,timezone,contact_name,patient_id into owner_id,mail,tz,fullname,patient
      from public.agenda_requests where id=subject;
    if exists(select 1 from public.agenda_requests where id=subject and registration_consented_at is not null) then return answer; end if;
  end if;
  if birthday>(now() at time zone tz)::date then raise exception 'invalid_birth_date'; end if;
  -- A verified mailbox may be shared by a family. Never attach an existing
  -- clinical record based on asserted demographics; leave possible matches
  -- for the owner, including archived/deleted records to avoid recreating them.
  select exists(select 1 from public.patients p where p.professional_id=owner_id and
    (lower(btrim(p.email))=lower(mail) or p.phone=v_phone or
      (lower(regexp_replace(btrim(p.full_name),'\s+',' ','g'))=lower(regexp_replace(fullname,'\s+',' ','g')) and p.birth_date=birthday))) into duplicate;
  if not duplicate then
    insert into public.patients(professional_id,full_name,email,country_code,phone,birth_date,timezone,portal_access_enabled)
      values(owner_id,fullname,mail,country,v_phone,birthday,tz,false) returning id into patient;
  end if;
  if p_payload->>'kind'='appointment' then
    update public.agenda_entries set patient_id=patient,contact_birth_date=birthday,contact_country_code=country,contact_phone=v_phone,
      registration_status=case when duplicate then 'review' else 'created' end,registration_consented_at=now(),requires_confirmation=true
      where id=subject;
    -- The core just inserted this job; it is uncommitted and cannot have run.
    -- The invitation is only queued when the professional confirms the reserve.
    delete from private.agenda_outbox where subject_id=subject and professional_id=owner_id and kind='calendar_insert' and status='pending';
    answer:=answer||jsonb_build_object('status','pending_confirmation');
  else
    update public.agenda_requests set patient_id=patient,contact_birth_date=birthday,contact_country_code=country,contact_phone=v_phone,
      registration_status=case when duplicate then 'review' else 'created' end,registration_consented_at=now() where id=subject;
  end if;
  -- No patient ID or match result in the public response or its replay.
  update private.agenda_operations set result=answer where professional_id=owner_id and operation_key=p_operation_key;
  insert into public.agenda_audit(professional_id,actor,action,subject_id,details)
    values(owner_id,'verified_contact','registration',subject,jsonb_build_object('status',case when duplicate then 'review' else 'created' end,'patientId',patient));
  return answer;
end $$;
revoke all on function public.agenda_book_registered(text,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.agenda_book_registered(text,text,uuid,jsonb,uuid) to service_role;

create function public.agenda_confirm_reservation(p_actor uuid,p_operation_key uuid,p_payload jsonb,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.agenda_entries; g private.agenda_google_connections; previous private.agenda_operations; answer jsonb; begin
  if p_actor is null or p_operation_key is null or p_payload->>'action' is distinct from 'confirm_reservation' then raise exception 'unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,981));
  select * into previous from private.agenda_operations where professional_id=p_actor and operation_key=p_operation_key;
  if found then
    if previous.payload<>jsonb_build_object('kind','manage','data',p_payload) then raise exception 'idempotency_mismatch'; end if;
    return previous.result;
  end if;
  select * into e from public.agenda_entries where id=(p_payload->>'id')::uuid and professional_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if e.status<>'confirmed' or e.kind<>'appointment' or not e.requires_confirmation or e.starts_at<=now() then raise exception 'invalid_transition'; end if;
  select * into g from private.agenda_google_connections where professional_id=p_actor and active for share;
  if found and (g.needs_reauthorization or not exists(select 1 from private.agenda_busy_checks
    where id=p_busy_check and professional_id=p_actor and connection_revision=g.revision and starts_at<=e.starts_at
      and ends_at>=e.ends_at and expires_at>clock_timestamp() and checked_at>=clock_timestamp()-interval '30 seconds'))
    then raise exception 'google_unavailable'; end if;
  update public.agenda_entries set requires_confirmation=false,professional_confirmed_at=now(),notification_status='pending',
    calendar_status=case when g.professional_id is not null then 'pending' else 'not_connected' end where id=e.id;
  update private.agenda_outbox set status='failed',error_code='reservation_superseded' where subject_id=e.id and kind='confirmation' and revision=1 and status='pending';
  insert into private.agenda_outbox(professional_id,subject_id,kind,revision) values(p_actor,e.id,'confirmation',2);
  if g.professional_id is not null then
    insert into private.agenda_outbox(professional_id,subject_id,kind,payload)
      values(p_actor,e.id,'calendar_insert',jsonb_build_object('calendarId',g.write_calendar_id,'eventId','n'||replace(e.id::text,'-','')));
  end if;
  answer:=jsonb_build_object('id',e.id,'status','confirmed');
  insert into private.agenda_operations values(p_actor,p_operation_key,jsonb_build_object('kind','manage','data',p_payload),answer,now());
  insert into public.agenda_audit(professional_id,actor,action,subject_id) values(p_actor,'professional','confirm_reservation',e.id);
  return answer;
end $$;
revoke all on function public.agenda_confirm_reservation(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.agenda_confirm_reservation(uuid,uuid,jsonb,uuid) to service_role;

create function private.agenda_transfer_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$ begin
  if new.entry_id is not null and old.entry_id is distinct from new.entry_id and new.registration_consented_at is not null then
    update public.agenda_entries set patient_id=new.patient_id,contact_birth_date=new.contact_birth_date,
      contact_country_code=new.contact_country_code,contact_phone=new.contact_phone,registration_status=new.registration_status,
      registration_consented_at=new.registration_consented_at,professional_confirmed_at=now()
      where id=new.entry_id and professional_id=new.professional_id;
  end if;
  return new;
end $$;
revoke all on function private.agenda_transfer_registration() from public,anon,authenticated;
create trigger agenda_request_registration after update of entry_id on public.agenda_requests
  for each row execute function private.agenda_transfer_registration();

create or replace function public.agenda_server(p_action text,p_data jsonb default '{}')
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
        returning subject_id,kind,revision
    ) update public.agenda_entries set notification_status='unknown'
      where id in (select x.subject_id from expired x where x.kind='confirmation' and not exists(
        select 1 from private.agenda_outbox newer where newer.subject_id=x.subject_id and newer.kind='confirmation' and newer.revision>x.revision));
    select o.* into job from private.agenda_outbox o where o.status='pending' and o.available_at<=now()
      and (owner_id is null or o.professional_id=owner_id)
      and (nullif(p_data->>'subject','') is null or o.subject_id=(p_data->>'subject')::uuid)
      and (o.kind<>'confirmation' or not exists(
        select 1 from private.agenda_outbox sending where sending.subject_id=o.subject_id
          and sending.kind='confirmation' and sending.status='processing'))
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
      update public.agenda_entries set notification_status=case when p_data->>'status'='sent' then 'sent' when p_data->>'status'='unknown' then 'unknown' else 'failed' end where id=job.subject_id
        and not exists(select 1 from private.agenda_outbox newer where newer.subject_id=job.subject_id and newer.kind='confirmation' and newer.revision>job.revision);
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

create or replace function public.agenda_manage(p_actor uuid,p_operation_key uuid,p_payload jsonb,p_busy_check uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.agenda_requests; e public.agenda_entries; previous private.agenda_operations;
  v_entry_id uuid; answer jsonb; action text:=p_payload->>'action'; a public.availability_settings; begin
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
      v_entry_id:=private.agenda_insert_appointment(p_actor,r.contact_name,r.contact_email,r.email_verified_at,r.starts_at,r.ends_at,
        r.modality,r.location_id,'request',coalesce((p_payload->>'allowOutsideSchedule')::boolean,false),p_busy_check);
      update public.agenda_requests set status='confirmed',entry_id=v_entry_id,updated_at=now() where agenda_requests.id=r.id;
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
      values(p_actor,'block',(p_payload->>'start')::timestamptz,(p_payload->>'end')::timestamptz,a.timezone,'block','not_required') returning agenda_entries.id into v_entry_id;
    answer:=jsonb_build_object('id',v_entry_id,'status','confirmed');
  else raise exception 'invalid_action'; end if;
  insert into private.agenda_operations values(p_actor,p_operation_key,jsonb_build_object('kind','manage','data',p_payload-'tokenHash'-'encryptedToken'),answer,now());
  insert into public.agenda_audit(professional_id,actor,action,subject_id,details)
    values(p_actor,'professional',action,(answer->>'id')::uuid,case when action='link' then jsonb_build_object('previousPatientId',e.patient_id,'patientId',p_payload->>'patientId') else '{}' end);
  return answer;
end $$;

commit;
