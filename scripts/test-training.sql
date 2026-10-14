create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Assertion failed: %', p_message; end if; end $$;

select pg_temp.assert(not has_table_privilege('authenticated', 'private.training_videos', 'select'), 'private table has no direct client grants');
select pg_temp.assert(not has_function_privilege('anon', 'public.training_catalog()', 'execute'), 'anonymous catalog denied');
select pg_temp.assert(not has_function_privilege('anon', 'public.training_admin_api(text,jsonb)', 'execute'), 'anonymous admin denied');
select pg_temp.assert(not has_function_privilege('authenticated', 'private.training_catalog_document(boolean)', 'execute'), 'internal helper denied');
select pg_temp.assert(not (select prosecdef from pg_proc where oid = 'public.training_admin_api(text,jsonb)'::regprocedure), 'exposed wrapper is invoker');
select pg_temp.assert((select proconfig = array['search_path=""'] from pg_proc where oid = 'private.training_admin_api(text,jsonb)'::regprocedure), 'definer has fixed empty search path');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_temp.assert(jsonb_array_length(public.training_catalog()) = 5, 'professional without commercial plan can see seeded published lessons');
select pg_temp.assert(public.training_catalog()->0->>'youtube_video_id' = 'Nw6ZwFHWoqI', 'learning path starts at tutorial 01');
do $$ declare action text; begin
 foreach action in array array['list', 'save', 'reorder', 'delete'] loop
   begin perform public.training_admin_api(action, '{}'); raise exception 'non-admin mutation accepted';
   exception when insufficient_privilege then if sqlerrm <> 'admin_required' then raise; end if; end;
 end loop;
 perform set_config('request.jwt.claim.sub', '', true);
 begin perform public.training_catalog(); raise exception 'missing identity accepted';
 exception when insufficient_privilege then if sqlerrm <> 'professional_required' then raise; end if; end;
 perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000099', true);
 begin perform public.training_catalog(); raise exception 'non-professional identity accepted';
 exception when insufficient_privilege then if sqlerrm <> 'professional_required' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ declare result jsonb; begin
 result := public.training_admin_api('save', '{"expected_revision":1,"title":"Synthetic lesson","description":"Test only","youtube_video_id":"abcdefghijk","published":false}');
 perform pg_temp.assert((result->>'revision')::integer = 2 and jsonb_array_length(result->'videos') = 6, 'new lesson saved with incremented revision');
 perform set_config('test.training_id', result->'videos'->5->>'id', true);
 perform pg_temp.assert(jsonb_array_length(public.training_catalog()) = 5, 'hidden lesson excluded from professional catalog');
 result := public.training_admin_api('save', jsonb_build_object('id', current_setting('test.training_id'), 'expected_revision', 2, 'title', 'Synthetic lesson', 'description', 'Test only', 'youtube_video_id', 'abcdefghijk', 'published', true));
 perform pg_temp.assert(jsonb_array_length(public.training_catalog()) = 6, 'explicit publication exposes lesson');
end $$;

do $$ declare input jsonb; expected_error text; begin
 for input, expected_error in select * from (values
   ('{"expected_revision":1,"title":"Synthetic lesson","description":"","youtube_video_id":"abcdefghijk","published":true}'::jsonb, 'stale_revision'),
   ('{"expected_revision":3,"title":"Duplicate","description":"","youtube_video_id":"abcdefghijk","published":true}'::jsonb, 'video_already_exists'),
   ('{"expected_revision":3,"title":"Bad link","description":"","youtube_video_id":"https://evil.test","published":true}'::jsonb, 'invalid_input'),
   ('{"expected_revision":3,"title":" ","description":"","youtube_video_id":"aaaaaaaaaaa","published":true}'::jsonb, 'invalid_input'),
   ('{"expected_revision":3,"title":"Boolean","description":"","youtube_video_id":"aaaaaaaaaaa","published":"true"}'::jsonb, 'invalid_input'),
   ('{"title":"Missing revision","description":"","youtube_video_id":"aaaaaaaaaaa","published":true}'::jsonb, 'invalid_input')
 ) cases loop
   begin perform public.training_admin_api('save', input); raise exception 'invalid save accepted';
   exception when raise_exception then if sqlerrm <> expected_error then raise; end if; end;
 end loop;
 perform pg_temp.assert((public.training_admin_api('list')->>'revision')::integer = 3, 'failed operations do not change revision');
end $$;

do $$ declare ids jsonb; result jsonb; begin
 select jsonb_agg(v->>'id' order by (v->>'display_order')::integer desc) into ids from jsonb_array_elements(public.training_admin_api('list')->'videos') v;
 result := public.training_admin_api('reorder', jsonb_build_object('expected_revision', 3, 'ids', ids));
 perform pg_temp.assert(result->'videos'->0->>'id' = current_setting('test.training_id'), 'reordered catalog persists server-side');
 perform pg_temp.assert(public.training_catalog()->0->>'id' = current_setting('test.training_id'), 'professional sees same new order');
 begin perform public.training_admin_api('reorder', jsonb_build_object('expected_revision', 4, 'ids', jsonb_build_array(ids->0))); raise exception 'incomplete order accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_order' then raise; end if; end;
 begin perform public.training_admin_api('reorder', jsonb_build_object('expected_revision', 4, 'ids', jsonb_build_array(ids->0, ids->0, ids->0, ids->0, ids->0, ids->0))); raise exception 'duplicate IDs accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_order' then raise; end if; end;
 begin perform public.training_admin_api('reorder', jsonb_build_object('expected_revision', 4, 'ids', jsonb_set(ids, '{0}', '"10000000-0000-0000-0000-000000000099"'))); raise exception 'unknown ID accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_order' then raise; end if; end;
 result := public.training_admin_api('delete', jsonb_build_object('expected_revision', 4, 'id', current_setting('test.training_id')));
 perform pg_temp.assert(jsonb_array_length(result->'videos') = 5 and (result->>'revision')::integer = 5, 'delete updates catalog atomically');
 perform pg_temp.assert(not exists(select 1 from jsonb_array_elements(result->'videos') with ordinality v(value, pos) where (value->>'display_order')::integer <> pos), 'delete compacts positions');
end $$;

reset role;
select pg_temp.assert((select count(*) from private.admin_audit where action like 'training_%') = 4, 'all four successful writes audited once');
select pg_temp.assert(not exists(select 1 from private.admin_audit where actor_admin is distinct from '10000000-0000-0000-0000-000000000002'::uuid), 'audit records administrator derived from auth');
update private.platform_admins set enabled = false;
grant select on private.training_videos to authenticated;
set local role authenticated;
select pg_temp.assert((select count(*) from private.training_videos) = 0, 'RLS denies direct rows even if a table grant is accidentally added');
do $$ begin
 begin perform public.training_admin_api('list'); raise exception 'disabled administrator accepted';
 exception when insufficient_privilege then if sqlerrm <> 'admin_required' then raise; end if; end;
end $$;
reset role;
select 'Training catalog: permissions, publication, revision, ordering, validation and audit passed.' as result;
