\o /dev/null
create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Assertion failed: %', p_message; end if; end $$;
create function pg_temp.payload(n integer, status text default 'published', frequency text default 'once') returns jsonb language sql as $$
 select jsonb_build_object('id', '20000000-0000-0000-0000-' || lpad(n::text, 12, '0'), 'expected_revision', 0,
   'title', 'Anuncio ' || n, 'body', 'Información del anuncio',
   'media_path', '20000000-0000-0000-0000-' || lpad(n::text, 12, '0') || '/30000000-0000-0000-0000-000000000001.png',
   'media_mime', 'image/png', 'media_alt', 'Descripción visual', 'cta_label', 'Abrir capacitación', 'cta_url', '/app/academy',
   'status', status, 'frequency', frequency, 'starts_at', null, 'ends_at', null, 'priority', 0)
$$;

select pg_temp.assert(not has_table_privilege('authenticated', 'private.platform_announcements', 'select'), 'no direct announcement grants');
select pg_temp.assert(not has_table_privilege('authenticated', 'private.announcement_receipts', 'select'), 'receipts stay private');
select pg_temp.assert(not has_function_privilege('anon', 'public.my_announcements(text,jsonb)', 'execute'), 'anonymous announcement API denied');
select pg_temp.assert(not has_function_privilege('anon', 'public.announcements_admin_api(text,jsonb)', 'execute'), 'anonymous admin API denied');
select pg_temp.assert(not has_function_privilege('authenticated', 'private.validate_announcement_media(uuid,text,text)', 'execute'), 'media validator is internal');
select pg_temp.assert(not (select prosecdef from pg_proc where oid = 'public.my_announcements(text,jsonb)'::regprocedure), 'public API uses invoker permissions');
select pg_temp.assert((select not public and file_size_limit = 52428800 from storage.buckets where id = 'platform-announcements'), 'private bucket and 50 MB limit');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"session_id":"login-a","user_metadata":{"is_admin":true}}', true);
do $$ declare operation text; begin
 foreach operation in array array['list', 'save', 'status', 'delete'] loop
   begin perform public.announcements_admin_api(operation, pg_temp.payload(1)); raise exception 'non-admin accepted';
   exception when insufficient_privilege then if sqlerrm <> 'admin_required' then raise; end if; end;
 end loop;
 begin insert into storage.objects(bucket_id, name, metadata) values('platform-announcements', '20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001.png', '{}'); raise exception 'non-admin uploaded';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub', '', true);
 begin perform public.my_announcements('list'); raise exception 'missing identity accepted';
 exception when insufficient_privilege then if sqlerrm <> 'professional_required' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
insert into storage.objects(bucket_id, name, metadata)
 select 'platform-announcements', pg_temp.payload(n)->>'media_path', '{"mimetype":"image/png","size":1024}'::jsonb from generate_series(1,7) n;
select public.announcements_admin_api('save', pg_temp.payload(1));
select public.announcements_admin_api('save', pg_temp.payload(2, 'published', 'session'));
select public.announcements_admin_api('save', pg_temp.payload(3, 'published', 'until_dismissed'));
select public.announcements_admin_api('save', pg_temp.payload(4, 'draft'));
select public.announcements_admin_api('save', pg_temp.payload(5) || jsonb_build_object('starts_at', now() + interval '1 day'));
select public.announcements_admin_api('save', pg_temp.payload(6) || jsonb_build_object('ends_at', now() - interval '1 day'));
select public.announcements_admin_api('save', pg_temp.payload(7) || '{"priority":100}');
do $$ declare input jsonb; expected text; begin
 for input, expected in select * from (values
   (pg_temp.payload(1), 'stale_revision'),
   (pg_temp.payload(8), 'invalid_media'),
   (pg_temp.payload(4) || '{"expected_revision":1,"cta_url":"javascript:alert(1)"}', 'invalid_input'),
   (pg_temp.payload(4) || '{"expected_revision":1,"cta_url":"//evil.test"}', 'invalid_input'),
   (pg_temp.payload(4) || jsonb_build_object('expected_revision',1,'starts_at',now(),'ends_at',now()-interval '1 minute'), 'invalid_input'),
   (pg_temp.payload(4) || '{"expected_revision":1,"title":" "}', 'invalid_input')
 ) cases loop
   begin perform public.announcements_admin_api('save', input); raise exception 'invalid input accepted';
   exception when raise_exception or invalid_parameter_value then if sqlerrm <> expected then raise; end if; end;
 end loop;
end $$;
select pg_temp.assert(private.announcement_asset_access(pg_temp.payload(4)->>'media_path', 'read'), 'admin can preview draft media');
select pg_temp.assert(not private.announcement_asset_access(pg_temp.payload(1)->>'media_path', 'remove'), 'referenced media cannot be removed');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 4, 'only active publications appear');
select pg_temp.assert(public.my_announcements('list')->0->>'title' = 'Anuncio 7', 'priority determines presentation order');
select pg_temp.assert(not private.announcement_asset_access(pg_temp.payload(4)->>'media_path', 'read'), 'professional cannot read draft media');
select pg_temp.assert(not private.announcement_asset_access(pg_temp.payload(5)->>'media_path', 'read'), 'professional cannot read future media');
select pg_temp.assert(private.announcement_asset_access(pg_temp.payload(1)->>'media_path', 'read'), 'professional can read active media');
select pg_temp.assert((select count(*) from storage.objects) = 4, 'storage RLS enforces active publication visibility');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000001","revision":1}') = 'true', 'first impression accepted');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000001","revision":1}') = 'false', 'duplicate once claim rejected');
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 3, 'once receipt excludes future displays');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000002","revision":1}') = 'true', 'session A accepted');
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 2, 'session A not repeated');
select set_config('request.jwt.claims', '{"session_id":"login-b"}', true);
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 3, 'new session can see session announcement');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000002","revision":1}') = 'true', 'session B accepted');
select set_config('request.jwt.claims', '{"session_id":"login-a"}', true);
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 2, 'return to concurrent session A does not repeat');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000003","revision":1}') = 'true', 'until-dismissed seen');
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 2, 'until-dismissed remains after impression');
select pg_temp.assert(public.my_announcements('dismiss', '{"id":"20000000-0000-0000-0000-000000000003","revision":1}') = 'true', 'explicit dismissal saved');
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 1, 'dismissal excludes future displays');
select pg_temp.assert(public.my_announcements('seen', '{"id":"20000000-0000-0000-0000-000000000007","revision":99}') = 'false', 'stale content claim rejected');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select pg_temp.assert(jsonb_array_length(public.my_announcements('list')) = 4, 'receipts isolated by account');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select public.announcements_admin_api('status', '{"id":"20000000-0000-0000-0000-000000000007","expected_revision":1,"status":"paused"}');
select public.announcements_admin_api('delete', '{"id":"20000000-0000-0000-0000-000000000007","expected_revision":2}');
select pg_temp.assert(private.announcement_asset_access(pg_temp.payload(7)->>'media_path', 'remove'), 'unreferenced deleted media can be cleaned up');
reset role;
select pg_temp.assert((select count(*) from private.admin_audit where action like 'announcement_%') = 9, 'successful mutations audited; failed writes not audited');
select pg_temp.assert((select count(*) from private.announcement_receipts where announcement_id = '20000000-0000-0000-0000-000000000007') = 0, 'deletion cascades receipt cleanup');
update private.platform_admins set enabled = false;
set local role authenticated;
do $$ begin
 begin perform public.announcements_admin_api('list'); raise exception 'disabled admin accepted';
 exception when insufficient_privilege then if sqlerrm <> 'admin_required' then raise; end if; end;
end $$;
reset role;
\o
select 'Announcements: publication, storage RLS, frequency, sessions, validation, revisions and audit passed.' as result;
