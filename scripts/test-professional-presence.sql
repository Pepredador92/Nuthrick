do $$ declare actor uuid:='00000000-0000-0000-0000-000000000001';
 sid uuid:='90000000-0000-0000-0000-000000000001'; first_tab uuid:=gen_random_uuid(); second_tab uuid:=gen_random_uuid(); begin
 insert into auth.sessions values(sid,actor);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.session_id',sid::text,true);
 if has_function_privilege('anon','public.professional_presence_ping(uuid,boolean)','execute')
 or has_function_privilege('authenticated','public.portal_professional_presence(text)','execute') then raise exception 'Presence grants'; end if;
 perform public.professional_presence_ping(first_tab,true);
 perform public.professional_presence_ping(second_tab,true);
 if not (public.portal_professional_presence('session-fixture')->>'online')::boolean then raise exception 'Missing online'; end if;
 perform public.professional_presence_ping(first_tab,false);
 if not (public.portal_professional_presence('session-fixture')->>'online')::boolean then raise exception 'Other tab lost'; end if;
 update private.professional_presence_sessions set expires_at=now()-interval '1 second';
 if (public.portal_professional_presence('session-fixture')->>'online')::boolean then raise exception 'Expired heartbeat'; end if;
 perform public.professional_presence_ping(first_tab,true);
 delete from auth.sessions where id=sid;
 if (public.portal_professional_presence('session-fixture')->>'online')::boolean then raise exception 'Revoked session still online'; end if;
 perform pg_temp.expect_error(format('select public.professional_presence_ping(%L,true)',first_tab),'unauthorized');
 insert into auth.sessions values(sid,'00000000-0000-0000-0000-000000000002');
 perform pg_temp.expect_error(format('select public.professional_presence_ping(%L,true)',first_tab),'unauthorized');
 update private.patient_portals set link_hash='revoked';
 perform pg_temp.expect_error('select public.portal_professional_presence(''session-fixture'')','portal_unavailable');
end $$;
select 'PASS session ownership, logout, idle lease expiry, multiple tabs and portal revocation';
