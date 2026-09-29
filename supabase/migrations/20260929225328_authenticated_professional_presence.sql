begin;

-- Short leases are authoritative; a patient cannot claim to be a professional
-- by joining or tracking a public Realtime channel.
create table private.professional_presence_sessions (
  session_id uuid not null references auth.sessions(id) on delete cascade,
  client_id uuid not null,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (session_id, client_id)
);
create index professional_presence_owner_idx on private.professional_presence_sessions(professional_id, expires_at);
alter table private.professional_presence_sessions enable row level security;
revoke all on private.professional_presence_sessions from public, anon, authenticated;
grant select on private.professional_presence_sessions to service_role;

create function private.set_professional_presence(p_client uuid, p_online boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if actor is null or sid is null or p_client is null or p_online is null
    or not exists(select 1 from auth.sessions where id=sid and user_id=actor)
    or not exists(select 1 from public.professional_profiles where id=actor)
  then raise exception 'unauthorized'; end if;
  -- Clean stale tabs from this professional without touching other accounts.
  delete from private.professional_presence_sessions where professional_id=actor and expires_at<=now();
  if p_online then
    insert into private.professional_presence_sessions values(sid,p_client,actor,now()+interval '90 seconds')
    on conflict(session_id,client_id) do update set expires_at=excluded.expires_at;
  else
    delete from private.professional_presence_sessions where session_id=sid and client_id=p_client and professional_id=actor;
  end if;
end $$;
revoke all on function private.set_professional_presence(uuid,boolean) from public,anon,service_role;
grant execute on function private.set_professional_presence(uuid,boolean) to authenticated;
create function public.professional_presence_ping(p_client uuid, p_online boolean) returns void
language sql security invoker set search_path='' as $$ select private.set_professional_presence(p_client,p_online) $$;
revoke all on function public.professional_presence_ping(uuid,boolean) from public,anon,service_role;
grant execute on function public.professional_presence_ping(uuid,boolean) to authenticated;

create function public.portal_professional_presence(p_session_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare pid uuid:=private.active_portal_patient(p_session_hash); owner_id uuid;
begin
  if pid is null then raise exception 'portal_unavailable'; end if;
  select professional_id into owner_id from public.patients where id=pid;
  perform private.require_portal_capability(owner_id,'view',null);
  return jsonb_build_object('online',exists(select 1 from private.professional_presence_sessions
    where professional_id=owner_id and expires_at>now()));
end $$;
revoke all on function public.portal_professional_presence(text) from public,anon,authenticated;
grant execute on function public.portal_professional_presence(text) to service_role;
-- Retire the old unauthenticated channel discovery endpoint if installed.
drop function if exists public.portal_presence_topic(uuid,uuid,text);
commit;
