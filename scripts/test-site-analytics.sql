create function pg_temp.expect_error(q text,message text) returns void language plpgsql as $$ begin
 begin execute q; exception when others then if position(message in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'Expected error %',message;
end $$;
set local role service_role;
select public.site_analytics_record(repeat('a',64),'/','https://example.com');
select public.site_analytics_record(repeat('a',64),'/','https://example.com');
select public.site_analytics_record(repeat('a',64),'/planes','');
select public.site_analytics_record(repeat('b',64),'/','');
select pg_temp.expect_error(format('select public.site_analytics_record(%L,%L)',repeat('a',64),'/mi-espacio#secret'),'invalid_input');
select pg_temp.expect_error(format('select public.site_analytics_record(%L,%L,%L)',repeat('a',64),'/', 'https://example.com/patient?token=secret'),'invalid_input');
reset role;
do $$ begin
 if (select count(*) from private.site_visit_events)<>3 then raise exception 'Deduplication failed'; end if;
 if has_function_privilege('anon','public.site_analytics_record(text,text,text)','execute') or has_function_privilege('authenticated','public.site_analytics_record(text,text,text)','execute') then raise exception 'Public write grant'; end if;
 if has_table_privilege('authenticated','private.site_visit_events','select') then raise exception 'Raw visitor data grant'; end if;
end $$;
set local role authenticated;
select pg_temp.expect_error('select public.admin_site_analytics(30)','admin_required');
set local test.admin='yes';
do $$ declare result jsonb:=public.admin_site_analytics(30); begin
 if result->>'total'<>'3' or result->>'pageviews'<>'3' or result->>'visitors'<>'2' or jsonb_array_length(result->'daily')<>30 then raise exception 'Invalid aggregates'; end if;
 if result->'daily'->29->>'day'<>((now() at time zone 'America/Mexico_City')::date)::text then raise exception 'Timezone mismatch'; end if;
end $$;
reset role;
select 'PASS service-only inserts, admin-only aggregates, deduplication, private URLs excluded, local dates and zero-filled days';

insert into public.professional_profiles(id,storage_key) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022'),
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000033');
insert into public.public_professional_pages(slug,profile_key) values
  ('nutri-uno','00000000-0000-4000-8000-000000000011'),
  ('nutri-dos','00000000-0000-4000-8000-000000000022');

set local role service_role;
select public.site_analytics_record_profile(repeat('c',64),'nutri-uno','',null);
select public.site_analytics_record_profile(repeat('c',64),'nutri-uno','',null);
select public.site_analytics_record_profile(repeat('c',64),'nutri-dos','',null);
select public.site_analytics_record_profile(repeat('d',64),'nutri-uno','','00000000-0000-4000-8000-000000000001');
select public.site_analytics_record_profile(repeat('e',64),'nutri-uno','','00000000-0000-4000-8000-000000000002');
do $$ begin
  if (public.site_analytics_record_profile(repeat('f',64),'sin-publicar','',null)->>'recorded')::boolean then
    raise exception 'Unpublished/unknown profile recorded';
  end if;
end $$;
select pg_temp.expect_error(format('select public.site_analytics_record_profile(%L,%L,%L,null)',repeat('a',64),'nutri-uno?token=private',''),'invalid_input');
reset role;

update public.public_professional_pages set slug = 'nutri-actualizado' where slug::text = 'nutri-uno';
set local role service_role;
select public.site_analytics_record_profile(repeat('c',64),'nutri-actualizado','',null);
reset role;
update private.public_profile_visits set visited_day=visited_day-1 where session_hash=repeat('e',64);
set local role service_role;
select public.site_analytics_record_profile(repeat('e',64),'nutri-actualizado','','00000000-0000-4000-8000-000000000002');
reset role;

do $$ begin
  if (select count(*) from private.public_profile_visits) <> 4 then raise exception 'Wrong scoped visit total'; end if;
  if exists(select 1 from private.site_visit_events where path like '%nutri-%') then raise exception 'Slug saved in site-wide analytics'; end if;
  if has_table_privilege('authenticated','private.public_profile_visits','select') then raise exception 'Raw profile visits grant'; end if;
  if has_function_privilege('anon','public.my_public_profile_visits()','execute') then raise exception 'Anonymous statistics grant'; end if;
  if has_function_privilege('authenticated','public.site_analytics_record_profile(text,text,text,uuid)','execute') then raise exception 'Public writer grant'; end if;
end $$;
set local role authenticated;
set local test.uid='00000000-0000-4000-8000-000000000001';
do $$ begin
  if public.my_public_profile_visits() <> 3 then raise exception 'Wrong total for first owner'; end if;
end $$;
set local test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
  if public.my_public_profile_visits() <> 1 then raise exception 'Wrong total for second owner'; end if;
end $$;
set local test.uid='00000000-0000-4000-8000-000000000003';
do $$ begin
  if public.my_public_profile_visits() <> 0 then raise exception 'Unpublished owner can see visits'; end if;
end $$;
reset role;
select 'PASS scoped daily deduplication, own visits excluded, slug changes, unknown profiles, and private owner-only totals';
