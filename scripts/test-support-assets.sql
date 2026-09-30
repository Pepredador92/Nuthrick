set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error('select public.support_api(''stats'')','admin_required');
select pg_temp.expect_error('select public.support_api(''prepare_asset'',''{"fileName":"file.svg","mime":"image/svg+xml","bytes":50}'')','invalid_attachment');
select pg_temp.expect_error('select public.support_api(''prepare_asset'',''{"fileName":"file.png","mime":"image/png","bytes":5242881}'')','invalid_attachment');
do $$ declare asset jsonb;begin
 asset:=public.support_api('prepare_asset','{"fileName":"captura.png","mime":"image/png","bytes":512}');
 perform set_config('test.support.asset',asset->>'id',true);perform set_config('test.support.path',asset->>'path',true);
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',jsonb_build_object('assetId',asset->>'id','body','Mira la captura','topic','other','clientKey',gen_random_uuid())),'attachment_not_uploaded');
 insert into storage.objects(bucket_id,name,metadata) values('support-screenshots',asset->>'path','{"size":512,"mimetype":"image/png"}');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$begin
 if exists(select 1 from storage.objects where bucket_id='support-screenshots') then raise exception 'Foreign private screenshot exposed'; end if;
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',jsonb_build_object('assetId',current_setting('test.support.asset'),'body','Stolen attachment','topic','other','clientKey',gen_random_uuid())),'invalid_attachment');
 perform pg_temp.expect_error('insert into storage.objects(bucket_id,name) values(''support-screenshots'',''forged.png'')','row-level security');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$declare result jsonb;data jsonb;begin
 data:=jsonb_build_object('assetId',current_setting('test.support.asset'),'body','Mira la captura','topic','other','clientKey',gen_random_uuid());
 result:=public.support_api('send',data);perform set_config('test.support.asset_thread',result->>'threadId',true);
 if public.support_api('send',data)<>result then raise exception 'Attachment retry duplicated message'; end if;
 if public.support_api('thread',jsonb_build_object('threadId',result->>'threadId'))->'messages'->-1->'attachment'->>'id'<>current_setting('test.support.asset') then raise exception 'Attachment not returned'; end if;
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',data||jsonb_build_object('clientKey',gen_random_uuid())),'attachment_already_sent');
 delete from storage.objects where bucket_id='support-screenshots';
 if not exists(select 1 from storage.objects where bucket_id='support-screenshots') then raise exception 'Sent attachment deleted'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$declare tid text:=current_setting('test.support.asset_thread');revision integer;stats jsonb;begin
 if not exists(select 1 from storage.objects where bucket_id='support-screenshots') then raise exception 'Admin cannot read attachment'; end if;
 revision:=(public.support_api('thread',jsonb_build_object('threadId',tid,'admin',true))->'thread'->>'revision')::integer;
 perform public.support_api('status',jsonb_build_object('threadId',tid,'revision',revision,'status','resolved','admin',true));
 stats:=public.support_api('stats','{"admin":true}');
 if (stats->>'resolved_30d')::integer<>2 or (stats->>'response_sample')::integer<>1 then raise exception 'Unexpected metrics %',stats; end if;
 if not exists(select 1 from storage.objects where bucket_id='support-screenshots') then raise exception 'Admin lost archived screenshot'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$begin
 if exists(select 1 from storage.objects where bucket_id='support-screenshots') then raise exception 'Closed screenshot not archived'; end if;
end $$;
reset role;
select 'PASS screenshot ownership and RLS, validation, atomic send/retry, immutable sent files, archive and real metrics';
