begin;
create table public.support_threads (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.professional_profiles(id) on delete cascade,
 topic text not null check(topic in ('agenda','patients','diet','billing','account','technical','other')),
 source text not null default '' check(length(source)<=60),
 status text not null default 'new' check(status in ('new','in_progress','waiting','resolved')),
 revision integer not null default 1,
 last_seq bigint not null default 0,
 professional_read_seq bigint not null default 0,
 admin_read_seq bigint not null default 0,
 professional_unread integer not null default 0,
 admin_unread integer not null default 0,
 preview text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 first_response_at timestamptz, resolved_at timestamptz
);
create unique index support_one_active on public.support_threads(professional_id) where status<>'resolved';
create index support_inbox on public.support_threads(status,updated_at desc,id);
create index support_owner_history on public.support_threads(professional_id,created_at desc);
create table private.support_messages (
 seq bigint generated always as identity primary key,
 thread_id uuid not null references public.support_threads(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 sender text not null check(sender in ('professional','admin')),
 body text not null check(length(btrim(body)) between 1 and 8000),
 client_key uuid not null,
 request_data jsonb not null,
 created_at timestamptz not null default now(),
 unique(author_id,client_key)
);
create index support_messages_thread on private.support_messages(thread_id,seq);
create index support_messages_rate on private.support_messages(author_id,created_at desc);
create table private.support_events (
 id bigint generated always as identity primary key,
 thread_id uuid not null references public.support_threads(id) on delete cascade,
 actor uuid references auth.users(id) on delete set null,
 previous_status text not null, next_status text not null, created_at timestamptz not null default now()
);
create index support_events_thread on private.support_events(thread_id,created_at);
create index support_events_actor on private.support_events(actor);
alter table public.support_threads enable row level security;
alter table private.support_messages enable row level security;
alter table private.support_events enable row level security;
revoke all on public.support_threads,private.support_messages,private.support_events from public,anon,authenticated;
revoke all on sequence private.support_messages_seq_seq,private.support_events_id_seq from public,anon,authenticated;
grant select on public.support_threads to authenticated;
create policy support_rpc_only on private.support_messages to authenticated using(false);
create policy support_rpc_only on private.support_events to authenticated using(false);
create function private.support_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_platform_admin()
$$;
revoke all on function private.support_is_admin() from public,anon;
grant execute on function private.support_is_admin() to authenticated;
create policy support_inbox_read on public.support_threads for select to authenticated
 using(professional_id=(select auth.uid()) or (select private.support_is_admin()));
alter publication supabase_realtime add table public.support_threads;

-- Only metadata is exposed for RLS-protected realtime. Message bodies and all
-- mutations pass this private authenticated implementation. No paid entitlement
-- is needed: account/billing support remains available when access expires.
create function private.support_api(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); admin_mode boolean:=coalesce((p_data->>'admin')::boolean,false);
 t public.support_threads; m private.support_messages; tid uuid:=(p_data->>'threadId')::uuid;
 key uuid; content text; next_status text; through_seq bigint; result jsonb;
begin
 if actor is null then raise exception 'unauthorized'; end if;
 if octet_length(p_data::text)>40000 then raise exception 'invalid_input'; end if;
 if admin_mode then
  if not private.is_platform_admin() then raise exception 'admin_required'; end if;
 elsif not exists(select 1 from public.professional_profiles where id=actor) then raise exception 'professional_required'; end if;
 if p_action='summary' then
  if admin_mode then return jsonb_build_object('unread',(select coalesce(sum(admin_unread),0) from public.support_threads where status<>'resolved'));
  else
   select * into t from public.support_threads where professional_id=actor and status<>'resolved';
   return jsonb_build_object('unread',coalesce(t.professional_unread,0),'thread',case when t.id is null then null else to_jsonb(t) end);
  end if;
 elsif p_action='inbox' then
  if not admin_mode then raise exception 'admin_required'; end if;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(v order by updated_at desc,id),'[]') from (
    select to_jsonb(st)||jsonb_build_object('professional_name',pr.full_name,'email',u.email) v,st.updated_at,st.id
    from public.support_threads st join public.professional_profiles pr on pr.id=st.professional_id join auth.users u on u.id=st.professional_id
    where (nullif(p_data->>'status','') is null or st.status=p_data->>'status')
      and (coalesce(p_data->>'search','')='' or position(lower(left(p_data->>'search',100)) in lower(coalesce(pr.full_name,'')||' '||coalesce(u.email,'')))>0)
    order by st.updated_at desc,st.id limit 50 offset greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000))
  ) q));
 elsif p_action='send' then
  content:=btrim(p_data->>'body'); key:=(p_data->>'clientKey')::uuid;
  if key is null or content is null or length(content) not between 1 and 8000 then raise exception 'invalid_message'; end if;
  -- Serialize retries and simultaneous tabs without creating duplicate tickets.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,452));
  select * into m from private.support_messages where author_id=actor and client_key=key;
  if found then
   if m.request_data<>p_data then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('threadId',m.thread_id,'seq',m.seq);
  end if;
  if (select count(*) from private.support_messages where author_id=actor and created_at>now()-interval '1 minute')>=20 then raise exception 'rate_limited'; end if;
  if tid is null then
   if admin_mode then raise exception 'thread_required'; end if;
   select * into t from public.support_threads where professional_id=actor and status<>'resolved' for update;
   if not found then
    if coalesce(p_data->>'topic','') not in ('agenda','patients','diet','billing','account','technical','other') then raise exception 'invalid_topic'; end if;
    insert into public.support_threads(professional_id,topic,source) values(actor,p_data->>'topic',left(coalesce(p_data->>'source',''),60)) returning * into t;
   end if;
  else
   select * into t from public.support_threads where id=tid and (admin_mode or professional_id=actor) for update;
   if not found then raise exception 'not_found'; end if;
  end if;
  if t.status='resolved' then raise exception 'conversation_resolved'; end if;
  insert into private.support_messages(thread_id,author_id,sender,body,client_key,request_data)
   values(t.id,actor,case when admin_mode then 'admin' else 'professional' end,content,key,p_data) returning * into m;
  update public.support_threads set last_seq=m.seq,preview=left(content,160),updated_at=now(),revision=revision+1,
   professional_unread=professional_unread+case when admin_mode then 1 else 0 end,
   admin_unread=admin_unread+case when admin_mode then 0 else 1 end,
   first_response_at=case when admin_mode then coalesce(first_response_at,now()) else first_response_at end,
   status=case when admin_mode then 'waiting' when status='waiting' then 'in_progress' else status end where id=t.id;
  return jsonb_build_object('threadId',t.id,'seq',m.seq);
 end if;
 select * into t from public.support_threads where id=tid and (admin_mode or (professional_id=actor and status<>'resolved'));
 if not found then raise exception 'not_found'; end if;
 if p_action='thread' then
  return jsonb_build_object('thread',to_jsonb(t),'messages',(select coalesce(jsonb_agg(to_jsonb(v) order by seq),'[]') from (
   select seq,body,sender,created_at from private.support_messages where thread_id=t.id and (p_data->>'before' is null or seq<(p_data->>'before')::bigint) order by seq desc limit 50) v));
 elsif p_action='read' then
  select * into t from public.support_threads where id=tid for update;
  through_seq:=least(t.last_seq,greatest(0,coalesce((p_data->>'through')::bigint,0)));
  if admin_mode and through_seq>t.admin_read_seq then
   update public.support_threads set admin_read_seq=through_seq,admin_unread=(select count(*) from private.support_messages where thread_id=t.id and sender='professional' and seq>through_seq) where id=t.id;
  elsif not admin_mode and through_seq>t.professional_read_seq then
   update public.support_threads set professional_read_seq=through_seq,professional_unread=(select count(*) from private.support_messages where thread_id=t.id and sender='admin' and seq>through_seq) where id=t.id;
  end if;
  return '{}';
 elsif p_action='status' then
  if not admin_mode then raise exception 'admin_required'; end if;
  -- Same owner lock used when a new professional conversation starts.
  perform pg_advisory_xact_lock(hashtextextended(t.professional_id::text,452));
  select * into t from public.support_threads where id=tid for update;
  if t.revision is distinct from (p_data->>'revision')::integer then raise exception 'stale_revision'; end if;
  next_status:=p_data->>'status';
  if next_status not in ('new','in_progress','waiting','resolved') or next_status is null then raise exception 'invalid_status'; end if;
  if t.status='resolved' and next_status<>'resolved' and exists(select 1 from public.support_threads where professional_id=t.professional_id and id<>t.id and status<>'resolved') then raise exception 'active_conversation_exists'; end if;
  if next_status<>t.status then
   insert into private.support_events(thread_id,actor,previous_status,next_status) values(t.id,actor,t.status,next_status);
   update public.support_threads set status=next_status,revision=revision+1,updated_at=now(),resolved_at=case when next_status='resolved' then now() else null end,
    professional_unread=case when next_status='resolved' then 0 else professional_unread end,
    admin_unread=case when next_status='resolved' then 0 else admin_unread end where id=t.id returning * into t;
  end if;
  return to_jsonb(t);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function private.support_api(text,jsonb) from public,anon;
grant execute on function private.support_api(text,jsonb) to authenticated;
create function public.support_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.support_api(p_action,p_data)$$;
revoke all on function public.support_api(text,jsonb) from public,anon;
grant execute on function public.support_api(text,jsonb) to authenticated;
commit;
