begin;

grant select on public.availability_settings, public.availability_slots to service_role;
-- SELECT FOR SHARE requires UPDATE on at least one column of the locked table.
grant update (updated_at) on public.availability_settings, public.patients to service_role;
grant insert (professional_id,full_name,email,country_code,phone,timezone,weight_kg,height_cm,gender,equation_sex,birth_date,portal_access_enabled)
  on public.patients to service_role;
grant insert (professional_id,patient_id,weight_kg,height_cm) on public.patient_measurements to service_role;

-- Staff can plan up to a rolling year. The public page keeps the professional's
-- configured window for appointments and alternative requests.
create function private.agenda_professional_last_day(p_today date)
returns date language sql immutable strict security invoker set search_path='' as $$
  select p_today+365
$$;
revoke all on function private.agenda_professional_last_day(date) from public,anon,authenticated;
grant execute on function private.agenda_professional_last_day(date) to service_role;

create function private.agenda_assert_time(p_owner uuid,p_start timestamptz,p_end timestamptz,p_mode text,p_location uuid,p_exception boolean,p_busy_check uuid, p_professional_booking boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.availability_settings; g private.agenda_google_connections; begin
  select * into a from public.availability_settings where professional_id=p_owner for share;
  if not found or p_start is null or p_end is null or p_start < now()+make_interval(mins=>a.minimum_notice_minutes)
    or (p_start at time zone a.timezone)::date > (case when p_professional_booking then private.agenda_professional_last_day((now() at time zone a.timezone)::date)
      else (now() at time zone a.timezone)::date+a.booking_horizon_days end)
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
revoke all on function private.agenda_assert_time(uuid,timestamptz,timestamptz,text,uuid,boolean,uuid,boolean) from public,anon,authenticated;
grant execute on function private.agenda_assert_time(uuid,timestamptz,timestamptz,text,uuid,boolean,uuid,boolean) to service_role;

create or replace function private.agenda_assert_time(p_owner uuid,p_start timestamptz,p_end timestamptz,p_mode text,p_location uuid,p_exception boolean,p_busy_check uuid)
returns void language sql security invoker set search_path='' as $$
  select private.agenda_assert_time(p_owner,p_start,p_end,p_mode,p_location,p_exception,p_busy_check,false)
$$;

create or replace function public.agenda_appointment_availability(p_owner uuid, p_day date, p_mode text, p_location uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.availability_settings; first_day date; last_day date; chosen_day date; slots jsonb;
begin
  perform private.require_entitlement(p_owner,'agenda');
  select * into a from public.availability_settings where professional_id=p_owner;
  if not found then raise exception 'booking_unavailable'; end if;
  if not exists(select 1 from private.agenda_choices(p_owner) where modality=p_mode and location_id is not distinct from p_location)
    then raise exception 'invalid_option'; end if;
  first_day:=(now() at time zone a.timezone)::date;
  last_day:=private.agenda_professional_last_day(first_day);
  chosen_day:=coalesce(p_day,first_day);
  if chosen_day not between first_day and last_day then raise exception 'invalid_range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('start',t,'end',t+make_interval(mins=>a.default_duration_minutes)) order by t),'[]') into slots
  from generate_series(chosen_day::timestamp at time zone a.timezone,
    (chosen_day+1)::timestamp at time zone a.timezone-interval '1 minute',interval '1 minute') t
  where t>=now()+make_interval(mins=>a.minimum_notice_minutes)
    and private.agenda_fits(p_owner,t,t+make_interval(mins=>a.default_duration_minutes),p_mode,p_location)
    and not exists(select 1 from public.agenda_entries e where e.professional_id=p_owner and e.status='confirmed'
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(t,t+make_interval(mins=>a.default_duration_minutes),'[)'));
  return jsonb_build_object('day',chosen_day,'today',first_day,'lastDay',last_day,'timezone',a.timezone,'slots',slots,
    'weekdays',(select coalesce(jsonb_agg(distinct weekday),'[]') from private.agenda_options(p_owner)
      where modality=p_mode and location_id is not distinct from p_location));
end $$;

-- Change only the owner-authenticated creation path, including new patients.
do $$
declare
  definition text := pg_get_functiondef('public.agenda_appointment_action(text,jsonb)'::regprocedure);
  time_check text := 'perform private.agenda_assert_time(owner_id,stamp,finish,mode,place,coalesce((p_data->>''allowOutsideSchedule'')::boolean,false),(p_data->>''busyCheck'')::uuid);';
begin
  if strpos(definition,time_check)=0 then raise exception 'professional_agenda_time_check_missing'; end if;
  definition:=replace(definition,time_check,left(time_check,-2)||',true);');
  execute replace(definition,'''horizonDays'',a.booking_horizon_days',
    '''horizonDays'',private.agenda_professional_last_day(current_date)-current_date');
end $$;

commit;
