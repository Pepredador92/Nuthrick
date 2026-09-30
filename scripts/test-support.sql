create function pg_temp.expect_error(q text,message text) returns void language plpgsql as $$ begin
 begin execute q; exception when others then if position(message in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'Expected error %',message;
end $$;
set local role authenticated;
select pg_temp.expect_error('select public.support_api(''summary'')','unauthorized');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error('select public.support_api(''inbox'',''{"admin":true}'')','admin_required');
do $$ declare result jsonb; data jsonb:='{"body":"Necesito ayuda con mi agenda","topic":"agenda","source":"Agenda","clientKey":"20000000-0000-0000-0000-000000000001"}'; begin
 result:=public.support_api('send',data);
 perform set_config('test.support.thread',result->>'threadId',true);
 if public.support_api('send',data)<>result then raise exception 'Retry not idempotent'; end if;
 if (public.support_api('summary')->'thread'->>'last_seq')::bigint<>(result->>'seq')::bigint then raise exception 'Duplicate message'; end if;
 perform pg_temp.expect_error(format('select public.support_api(''status'',%L)',jsonb_build_object('threadId',result->>'threadId','status','resolved')),'admin_required');
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',data||'{"body":"changed"}'),'idempotency_conflict');
end $$;
select pg_temp.expect_error('select * from private.support_messages','permission denied');
select pg_temp.expect_error('update public.support_threads set status=''resolved''','permission denied');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ begin
 if exists(select 1 from public.support_threads) then raise exception 'Cross-professional metadata leakage'; end if;
 perform pg_temp.expect_error(format('select public.support_api(''thread'',%L)',jsonb_build_object('threadId',current_setting('test.support.thread'))),'not_found');
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',jsonb_build_object('threadId',current_setting('test.support.thread'),'clientKey',gen_random_uuid(),'body','intrusion')),'not_found');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare tid text:=current_setting('test.support.thread'); data jsonb; version integer; seq bigint; begin
 if public.support_api('summary','{"admin":true}')->>'unread'<>'1' then raise exception 'Admin unread missing'; end if;
 data:=public.support_api('thread',jsonb_build_object('admin',true,'threadId',tid));
 version:=(data->'thread'->>'revision')::integer;seq:=(data->'thread'->>'last_seq')::bigint;
 perform public.support_api('read',jsonb_build_object('admin',true,'threadId',tid,'through',seq));
 if public.support_api('summary','{"admin":true}')->>'unread'<>'0' then raise exception 'Admin read failed'; end if;
 perform public.support_api('send',jsonb_build_object('admin',true,'threadId',tid,'clientKey',gen_random_uuid(),'body','Revisemos los horarios configurados.'));
 perform pg_temp.expect_error(format('select public.support_api(''status'',%L)',jsonb_build_object('admin',true,'threadId',tid,'status','resolved','revision',version)),'stale_revision');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$ declare tid text:=current_setting('test.support.thread'); begin
 if public.support_api('summary')->>'unread'<>'1' then raise exception 'Professional unread missing'; end if;
 perform public.support_api('read',jsonb_build_object('threadId',tid,'through',0));
 if public.support_api('summary')->>'unread'<>'1' then raise exception 'Unread newer message lost'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare tid text:=current_setting('test.support.thread'); data jsonb; begin
 data:=public.support_api('thread',jsonb_build_object('admin',true,'threadId',tid));
 perform public.support_api('status',jsonb_build_object('admin',true,'threadId',tid,'status','resolved','revision',data->'thread'->'revision'));
 data:=public.support_api('thread',jsonb_build_object('admin',true,'threadId',tid));
 if jsonb_array_length(data->'messages')<>2 then raise exception 'Archived history lost'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$ declare old_id text:=current_setting('test.support.thread'); result jsonb; begin
 if public.support_api('summary')->'thread'<>'null'::jsonb or public.support_api('summary')->>'unread'<>'0' then raise exception 'Resolved conversation did not reset'; end if;
 perform pg_temp.expect_error(format('select public.support_api(''send'',%L)',jsonb_build_object('threadId',old_id,'body','late reply','clientKey',gen_random_uuid())),'conversation_resolved');
 perform pg_temp.expect_error(format('select public.support_api(''thread'',%L)',jsonb_build_object('threadId',old_id)),'not_found');
 result:=public.support_api('send',jsonb_build_object('body','Nueva duda independiente','topic','other','clientKey',gen_random_uuid()));
 if result->>'threadId'=old_id then raise exception 'New case reused old history'; end if;
 if jsonb_array_length(public.support_api('thread',jsonb_build_object('threadId',result->>'threadId'))->'messages')<>1 then raise exception 'New case not clean'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare tid text:=current_setting('test.support.thread'); version integer; begin
 version:=(public.support_api('thread',jsonb_build_object('admin',true,'threadId',tid))->'thread'->>'revision')::integer;
 perform pg_temp.expect_error(format('select public.support_api(''status'',%L)',jsonb_build_object('admin',true,'threadId',tid,'status','in_progress','revision',version)),'active_conversation_exists');
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.support_api(text,jsonb)','execute') then raise exception 'Anonymous RPC access'; end if;
 if (select count(*) from private.support_messages)<>3 then raise exception 'Unexpected message count'; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='support_threads') then raise exception 'Realtime publication missing'; end if;
end $$;
select 'PASS support ownership/RLS, admin authorization, retries, unread cursors, stale resolution, reset, retained history and new case isolation';
