begin;
-- Owner identity comes exclusively from the Edge Function's verified JWT.
-- Private scheduling also works when the professional disables public booking.
create function public.agenda_appointment_availability(p_owner uuid, p_day date, p_mode text, p_location uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.availability_settings; first_day date; last_day date; chosen_day date; slots jsonb;
begin
  perform private.require_entitlement(p_owner,'agenda');
  select * into a from public.availability_settings where professional_id=p_owner;
  if not found then raise exception 'booking_unavailable'; end if;
  if not exists(select 1 from private.agenda_choices(p_owner) where modality=p_mode and location_id is not distinct from p_location)
    then raise exception 'invalid_option'; end if;
  first_day:=(now() at time zone a.timezone)::date;
  last_day:=first_day+a.booking_horizon_days;
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
revoke all on function public.agenda_appointment_availability(uuid,date,text,uuid) from public,anon,authenticated;
grant execute on function public.agenda_appointment_availability(uuid,date,text,uuid) to service_role;
commit;
