begin;

create table private.site_visit_events (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null default now(),
  visited_day date not null default ((now() at time zone 'America/Mexico_City')::date),
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  path text not null check (char_length(path) between 1 and 240),
  referrer text not null default '' check (char_length(referrer) <= 500),
  unique (session_hash, visited_day, path)
);
create index site_visit_events_day_idx on private.site_visit_events(visited_day desc);
create index site_visit_events_session_idx on private.site_visit_events(session_hash, visited_day desc);
revoke all on private.site_visit_events from public, anon, authenticated, service_role;

create function public.site_analytics_record(
  p_session_hash text,
  p_path text,
  p_referrer text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'unauthorized'; end if;
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
    or p_path is null or char_length(p_path) not between 1 and 240
    or char_length(coalesce(p_referrer, '')) > 500 then raise exception 'invalid_input'; end if;
  insert into private.site_visit_events(session_hash, path, referrer)
    values(p_session_hash, btrim(p_path), left(coalesce(p_referrer, ''), 500))
    on conflict (session_hash, visited_day, path) do nothing;
  return jsonb_build_object('recorded', true);
end;
$$;
revoke all on function public.site_analytics_record(text,text,text) from public, anon, authenticated;
grant execute on function public.site_analytics_record(text,text,text) to service_role;

create function public.admin_site_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not private.is_platform_admin() then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'days', days,
    'pageviews', (select count(*) from private.site_visit_events where visited_day >= current_date - (days - 1)),
    'visitors', (select count(distinct session_hash) from private.site_visit_events where visited_day >= current_date - (days - 1)),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from (
      select day,
        (select count(*) from private.site_visit_events e where e.visited_day = day) pageviews,
        (select count(distinct e.session_hash) from private.site_visit_events e where e.visited_day = day) visitors
      from generate_series(current_date - (days - 1), current_date, interval '1 day') day
    ) d), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_site_analytics(integer) from public, anon, service_role;
grant execute on function public.admin_site_analytics(integer) to authenticated;

commit;
