begin;
alter table private.site_visit_events enable row level security;
-- Only the server records anonymous public categories; admin RPC exposes aggregates.
grant select, insert on private.site_visit_events to service_role;
grant usage on sequence private.site_visit_events_id_seq to service_role;
create or replace function public.site_analytics_record(p_session_hash text,p_path text,p_referrer text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
  or p_path is null or p_path not in ('/','/planes','/privacy','/terms','/refunds','/perfil-publico','/reservar-cita')
  or length(coalesce(p_referrer,''))>200
  or (coalesce(p_referrer,'')<>'' and p_referrer !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?$')
 then raise exception 'invalid_input'; end if;
 insert into private.site_visit_events(session_hash,path,referrer) values(p_session_hash,p_path,coalesce(p_referrer,''))
 on conflict(session_hash,visited_day,path) do nothing;
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function public.site_analytics_record(text,text,text) from public,anon,authenticated;
grant execute on function public.site_analytics_record(text,text,text) to service_role;

create or replace function public.admin_site_analytics(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare days integer:=least(greatest(coalesce(p_days,30),1),90);
 today date:=(now() at time zone 'America/Mexico_City')::date;
begin
 if not coalesce(private.is_platform_admin(),false) then raise exception 'admin_required'; end if;
 return jsonb_build_object('days',days,'timezone','America/Mexico_City',
  'total',(select count(*) from private.site_visit_events),
  'pageviews',(select count(*) from private.site_visit_events where visited_day between today-(days-1) and today),
  'visitors',(select count(distinct session_hash) from private.site_visit_events where visited_day between today-(days-1) and today),
  'daily',(select jsonb_agg(jsonb_build_object('day',day::date,'pageviews',coalesce(t.views,0),'visitors',coalesce(t.sessions,0)) order by day)
   from generate_series(today-(days-1),today,interval '1 day') day
   left join (select visited_day,count(*) views,count(distinct session_hash) sessions from private.site_visit_events
    where visited_day between today-(days-1) and today group by visited_day) t on t.visited_day=day::date));
end $$;
revoke all on function public.admin_site_analytics(integer) from public,anon,service_role;
grant execute on function public.admin_site_analytics(integer) to authenticated;
commit;
