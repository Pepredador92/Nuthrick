begin;
grant usage on schema private to service_role;

-- No clinical table is made public. Patient access goes through the authenticated
-- Edge boundary and a short-lived session, never through a patient id alone.
create table private.patient_portals (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  link_hash text unique,
  encrypted_link text,
  link_expires_at timestamptz,
  recipient_email text,
  shared jsonb not null default '{"goal":"","instructions":"","results":[],"consultations":[]}',
  revision integer not null default 0,
  published_at timestamptz,
  patient_read_at timestamptz,
  professional_read_at timestamptz
);
create table private.portal_challenges (
  id uuid primary key,
  patient_id uuid not null references private.patient_portals(patient_id) on delete cascade,
  link_hash text not null,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  used boolean not null default false,
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create index portal_challenges_patient on private.portal_challenges(patient_id);
create table private.portal_sessions (
  token_hash text primary key,
  patient_id uuid not null references private.patient_portals(patient_id) on delete cascade,
  link_hash text not null,
  email text not null,
  expires_at timestamptz not null default now()+interval '2 hours'
);
create index portal_sessions_patient on private.portal_sessions(patient_id);
create table private.portal_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references private.patient_portals(patient_id) on delete cascade,
  sender text not null check(sender in ('patient','professional')),
  client_id uuid not null,
  body text not null check(length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique(patient_id,sender,client_id)
);
create index portal_messages_timeline on private.portal_messages(patient_id,created_at desc,id desc);
create table private.portal_notes (
  id uuid primary key,
  patient_id uuid not null references private.patient_portals(patient_id) on delete cascade,
  body text not null check(length(btrim(body)) between 1 and 2000),
  done boolean not null default false,
  updated_at timestamptz not null default now()
);
create index portal_notes_patient on private.portal_notes(patient_id,updated_at desc);
alter table private.patient_portals enable row level security;
alter table private.portal_challenges enable row level security;
alter table private.portal_sessions enable row level security;
alter table private.portal_messages enable row level security;
alter table private.portal_notes enable row level security;
revoke all on private.patient_portals,private.portal_challenges,private.portal_sessions,private.portal_messages,private.portal_notes from public,anon,authenticated;
grant all on private.patient_portals,private.portal_challenges,private.portal_sessions,private.portal_messages,private.portal_notes to service_role;

-- Caller is service_role only; owner is obtained by Auth.getUser, session hash
-- from a cryptographic bearer. Neither is accepted from untrusted JSON by Edge.
create function public.patient_portal(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  pid uuid; p public.patients; space private.patient_portals;
  challenge private.portal_challenges; sess private.portal_sessions;
  actor text; item jsonb; point jsonb; stamp timestamptz;
  rows jsonb; next_cursor jsonb; mid uuid; old_body text; count_notes integer;
begin
  if octet_length(p_data::text)>120000 then raise exception 'invalid_input'; end if;
  if p_action='inbox' and p_data->>'owner' is not null then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (
      select client.id,client.full_name,
        (select count(*) from private.portal_messages m where m.patient_id=client.id and m.sender='patient' and m.created_at>coalesce(s.professional_read_at,'-infinity'::timestamptz)) unread,
        (select max(created_at) from private.portal_messages m where m.patient_id=client.id) last_message_at
      from private.patient_portals s join public.patients client on client.id=s.patient_id
      where client.professional_id=(p_data->>'owner')::uuid and client.deleted_at is null and client.status<>'archived'
        and (p_data->>'search' is null or position(lower(p_data->>'search') in lower(client.full_name))>0)
      order by unread desc,last_message_at desc nulls last,client.id
      limit 50 offset least(greatest(coalesce((p_data->>'offset')::integer,0),0),10000)
    ) t;
    return jsonb_build_object('patients',rows);
  end if;
  if p_data->>'owner' is not null then
    pid:=(p_data->>'patientId')::uuid;
    actor:='professional';
  elsif p_action='challenge' then
    select patient_id into pid from private.patient_portals where link_hash=p_data->>'linkHash';
    actor:='challenge';
  elsif p_action='verify' then
    select * into challenge from private.portal_challenges where id=(p_data->>'id')::uuid;
    pid:=challenge.patient_id; actor:='verify';
  else
    select * into sess from private.portal_sessions where token_hash=p_data->>'sessionHash' and expires_at>now();
    pid:=sess.patient_id; actor:='patient';
  end if;
  -- Consistent patient -> space locking serializes publication, revocation and
  -- use of codes, including simultaneous correct-code requests.
  select * into p from public.patients where id=pid for update;
  if not found or p.deleted_at is not null or p.status='archived' then return '{"error":"portal_unavailable"}'; end if;
  if actor='professional' and p.professional_id<>(p_data->>'owner')::uuid then return '{"error":"portal_unavailable"}'; end if;
  if actor='professional' then
    insert into private.patient_portals(patient_id) values(pid) on conflict do nothing;
  end if;
  select * into space from private.patient_portals where patient_id=pid for update;
  if actor<>'professional' then
    if not p.portal_access_enabled or space.link_hash is null or space.link_expires_at<=now()
      or lower(btrim(p.email)) is distinct from space.recipient_email then return '{"error":"portal_unavailable"}'; end if;
    if actor='patient' and (sess.link_hash is distinct from space.link_hash or sess.email is distinct from space.recipient_email) then return '{"error":"portal_unavailable"}'; end if;
  end if;

  if p_action='challenge' and actor='challenge' then
    if space.link_hash is distinct from p_data->>'linkHash' or space.recipient_email is distinct from p_data->>'email' then return '{"error":"portal_unavailable"}'; end if;
    delete from private.portal_challenges where patient_id=pid and (expires_at<now() or used);
    -- Sending a new code invalidates previous codes for this patient.
    update private.portal_challenges set used=true where patient_id=pid;
    insert into private.portal_challenges(id,patient_id,link_hash,email,code_hash)
    values((p_data->>'id')::uuid,pid,space.link_hash,space.recipient_email,p_data->>'codeHash');
    return jsonb_build_object('email',space.recipient_email);
  elsif p_action='verify' and actor='verify' then
    select * into challenge from private.portal_challenges where id=(p_data->>'id')::uuid for update;
    if challenge.used or challenge.expires_at<=now() or challenge.attempts>=5 or challenge.link_hash is distinct from space.link_hash
      or challenge.link_hash is distinct from p_data->>'linkHash' or challenge.email is distinct from space.recipient_email then return '{"error":"invalid_code"}'; end if;
    update private.portal_challenges set attempts=attempts+1 where id=challenge.id;
    if challenge.code_hash is distinct from p_data->>'codeHash' then return '{"error":"invalid_code"}'; end if;
    update private.portal_challenges set used=true where id=challenge.id;
    delete from private.portal_sessions where patient_id=pid and expires_at<now();
    insert into private.portal_sessions(token_hash,patient_id,link_hash,email)
    values(p_data->>'newSessionHash',pid,space.link_hash,space.recipient_email);
    return '{"verified":true}';
  elsif p_action='link' and actor='professional' then
    if nullif(btrim(p.email),'') is null then return '{"error":"email_required"}'; end if;
    update public.patients set portal_access_enabled=true where id=pid;
    update private.patient_portals set link_hash=p_data->>'linkHash',encrypted_link=p_data->>'encryptedLink',
      recipient_email=lower(btrim(p.email)),link_expires_at=now()+interval '90 days' where patient_id=pid;
    delete from private.portal_sessions where patient_id=pid;
    update private.portal_challenges set used=true where patient_id=pid;
    return '{"ok":true}';
  elsif p_action='revoke' and actor='professional' then
    update public.patients set portal_access_enabled=false where id=pid;
    update private.patient_portals set link_hash=null,encrypted_link=null,link_expires_at=null where patient_id=pid;
    delete from private.portal_sessions where patient_id=pid;
    update private.portal_challenges set used=true where patient_id=pid;
    return '{"ok":true}';
  elsif p_action='publish' and actor='professional' then
    if (p_data->>'revision')::integer is distinct from space.revision then return '{"error":"stale_revision"}'; end if;
    if jsonb_typeof(p_data->'shared')<>'object' or jsonb_typeof(p_data->'shared'->'results')<>'array'
      or jsonb_typeof(p_data->'shared'->'consultations')<>'array' then raise exception 'invalid_input'; end if;
    -- Only completed, non-deleted consultations of this patient can be shared.
    for item in select value from jsonb_array_elements(p_data->'shared'->'consultations') loop
      if not exists(select 1 from public.consultations c where c.id=(item->>'id')::uuid and c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null) then raise exception 'invalid_consultation'; end if;
    end loop;
    for item in select value from jsonb_array_elements(p_data->'shared'->'results') loop
      for point in select value from jsonb_array_elements(item->'points') loop
        if not exists(select 1 from public.consultations c where c.id=(point->>'consultationId')::uuid and c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null) then raise exception 'invalid_consultation'; end if;
      end loop;
    end loop;
    update private.patient_portals set shared=p_data->'shared',revision=revision+1,published_at=now() where patient_id=pid;
    return jsonb_build_object('revision',space.revision+1);
  elsif p_action='logout' and actor='patient' then
    delete from private.portal_sessions where token_hash=p_data->>'sessionHash'; return '{"ok":true}';
  elsif p_action='message' and actor in ('patient','professional') then
    if not p.portal_access_enabled or space.link_hash is null or space.link_expires_at<=now() or lower(btrim(p.email)) is distinct from space.recipient_email then return '{"error":"portal_unavailable"}'; end if;
    if length(btrim(p_data->>'body')) not between 1 and 4000 then raise exception 'invalid_input'; end if;
    select id,body into mid,old_body from private.portal_messages where patient_id=pid and sender=actor and client_id=(p_data->>'clientId')::uuid;
    if mid is not null then
      if old_body is distinct from btrim(p_data->>'body') then return '{"error":"idempotency_mismatch"}'; end if;
      return jsonb_build_object('id',mid);
    end if;
    insert into private.portal_messages(patient_id,sender,client_id,body) values(pid,actor,(p_data->>'clientId')::uuid,btrim(p_data->>'body')) returning id into mid;
    return jsonb_build_object('id',mid);
  elsif p_action='messages' and actor in ('patient','professional') then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into rows from (
      select id,sender,body,created_at from private.portal_messages m where patient_id=pid
      and (p_data->>'before' is null or (m.created_at,m.id)<((p_data->'before'->>'at')::timestamptz,(p_data->'before'->>'id')::uuid))
      and (p_data->>'after' is null or (m.created_at,m.id)>((p_data->'after'->>'at')::timestamptz,(p_data->'after'->>'id')::uuid))
      order by case when p_data->>'after' is not null then m.created_at end asc,
        case when p_data->>'after' is not null then m.id end asc,
        m.created_at desc,m.id desc limit 50
    ) m;
    if jsonb_array_length(rows)=50 then next_cursor:=jsonb_build_object('at',rows->0->>'created_at','id',rows->0->>'id'); end if;
    return jsonb_build_object('messages',rows,'before',next_cursor);
  elsif p_action='read' and actor in ('patient','professional') then
    select created_at into stamp from private.portal_messages where patient_id=pid and id=(p_data->>'id')::uuid;
    if stamp is not null then
      if actor='patient' then update private.patient_portals set patient_read_at=greatest(patient_read_at,stamp) where patient_id=pid;
      else update private.patient_portals set professional_read_at=greatest(professional_read_at,stamp) where patient_id=pid; end if;
    end if;
    return '{"ok":true}';
  elsif p_action='note' and actor='patient' then
    select count(*) into count_notes from private.portal_notes where patient_id=pid;
    if count_notes>=100 and not exists(select 1 from private.portal_notes where patient_id=pid and id=(p_data->>'id')::uuid) then return '{"error":"note_limit"}'; end if;
    if exists(select 1 from private.portal_notes where id=(p_data->>'id')::uuid and patient_id<>pid) then return '{"error":"portal_unavailable"}'; end if;
    insert into private.portal_notes(id,patient_id,body,done) values((p_data->>'id')::uuid,pid,btrim(p_data->>'body'),coalesce((p_data->>'done')::boolean,false))
    on conflict(id) do update set body=excluded.body,done=excluded.done,updated_at=now() where private.portal_notes.patient_id=pid;
    return '{"ok":true}';
  elsif p_action='delete_note' and actor='patient' then
    delete from private.portal_notes where id=(p_data->>'id')::uuid and patient_id=pid; return '{"ok":true}';
  elsif p_action='notes' and actor='patient' then
    select coalesce(jsonb_agg(to_jsonb(n) order by n.done,n.updated_at desc),'[]') into rows from
      (select id,body,done,updated_at from private.portal_notes where patient_id=pid) n;
    return jsonb_build_object('notes',rows);
  elsif p_action='view' and actor in ('patient','professional') then
    if actor='patient' then
      -- Retraction follows deletion/cancellation immediately, even if a
      -- previously published snapshot remains available to its owner.
      select coalesce(jsonb_agg(value),'[]') into rows from jsonb_array_elements(space.shared->'consultations')
      where exists(select 1 from public.consultations c where c.id=(value->>'id')::uuid and c.patient_id=pid and c.status='completed' and c.deleted_at is null);
      space.shared:=jsonb_set(space.shared,'{consultations}',rows);
      rows:='[]';
      for item in select value from jsonb_array_elements(space.shared->'results') loop
        select coalesce(jsonb_agg(value),'[]') into point from jsonb_array_elements(item->'points')
        where exists(select 1 from public.consultations c where c.id=(value->>'consultationId')::uuid and c.patient_id=pid and c.status='completed' and c.deleted_at is null);
        if jsonb_array_length(point)>0 then rows:=rows||jsonb_build_array(jsonb_set(item,'{points}',point)); end if;
      end loop;
      space.shared:=jsonb_set(space.shared,'{results}',rows);
    end if;
    -- Whitelisted profile fields only; no birth date, identifiers or contacts.
    select jsonb_build_object('name',full_name,'title',professional_title) into item from public.professional_profiles where id=p.professional_id;
    rows:=jsonb_build_object('patientName',p.full_name,'professional',item,'shared',space.shared,'revision',space.revision,'publishedAt',space.published_at,
      'unread',(select count(*) from private.portal_messages where patient_id=pid and sender<>actor and created_at>coalesce(case when actor='patient' then space.patient_read_at else space.professional_read_at end,'-infinity'::timestamptz)));
    if actor='professional' then rows:=rows||jsonb_build_object('encryptedLink',space.encrypted_link,'expiresAt',space.link_expires_at,
      'enabled',p.portal_access_enabled and space.link_hash is not null and space.link_expires_at>now() and lower(btrim(p.email)) is not distinct from space.recipient_email); end if;
    return rows;
  end if;
  return '{"error":"invalid_action"}';
end $$;
revoke all on function public.patient_portal(text,jsonb) from public,anon,authenticated;
grant execute on function public.patient_portal(text,jsonb) to service_role;
commit;
