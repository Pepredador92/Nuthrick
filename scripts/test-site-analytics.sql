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
