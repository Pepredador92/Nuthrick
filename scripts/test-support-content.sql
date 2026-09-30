set local role authenticated;
set local request.jwt.claim.sub='';
select pg_temp.expect_error('select public.support_content(''get'')','unauthorized');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error('select public.support_content(''get'',''{"admin":true}'')','admin_required');
select pg_temp.expect_error('select public.support_content(''save_settings'',''{}'')','admin_required');
select pg_temp.expect_error('select * from private.support_answers','permission denied');
do $$ declare result jsonb:=public.support_content('get'); begin
 if result->'settings'->>'starts_at'<>'09:00' or result->'settings'->>'ends_at'<>'17:00' then raise exception 'Wrong support hours'; end if;
 if exists(select 1 from jsonb_array_elements(result->'answers') a where a->>'kind'<>'faq' or a->>'active'<>'true') then raise exception 'Private answer exposed'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare data jsonb:='{"admin":true,"revision":1,"starts_at":"09:00","ends_at":"17:00","timezone":"America/Mexico_City"}'; result jsonb; begin
 perform public.support_content('save_settings',data);
 perform pg_temp.expect_error(format('select public.support_content(''save_settings'',%L)',data),'stale_content');
 perform pg_temp.expect_error(format('select public.support_content(''save_settings'',%L)',data||'{"timezone":"Not/AZone"}'),'invalid_schedule');
 data:='{"admin":true,"kind":"faq","topic":"other","title":"Pregunta inactiva","body":"Oculta","active":false,"position":1}';
 result:=public.support_content('save_answer',data);
 perform set_config('test.support.answer',result->>'id',true);
 perform public.support_content('save_answer',data||jsonb_build_object('id',result->>'id','revision',1));
 perform pg_temp.expect_error(format('select public.support_content(''save_answer'',%L)',data||jsonb_build_object('id',result->>'id','revision',1)),'stale_content');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.support_content('get')->'answers') a where a->>'id'=current_setting('test.support.answer')) then raise exception 'Inactive answer exposed'; end if;
end $$;
reset role;
select 'PASS editable hours and answers, admin-only writes, stale edits, private macros and inactive answers';
