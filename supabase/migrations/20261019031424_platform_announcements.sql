begin;

create table private.platform_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 160),
 body text not null default '' check(length(body) <= 2000),
 media_path text not null default '',
 media_mime text not null default '' check(media_mime in ('', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
 media_alt text not null default '' check(length(media_alt) <= 500),
 cta_label text not null default '' check(length(cta_label) <= 60),
 cta_url text not null default '' check(length(cta_url) <= 2048),
 status text not null default 'draft' check(status in ('draft', 'published', 'paused')),
 frequency text not null default 'once' check(frequency in ('once', 'session', 'until_dismissed')),
 starts_at timestamptz,
 ends_at timestamptz,
 priority integer not null default 0 check(priority between 0 and 100),
 revision integer not null default 1 check(revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(starts_at is null or ends_at is null or ends_at > starts_at),
 check((media_path = '') = (media_mime = '')),
 check(status <> 'published' or media_path <> ''),
 check((cta_label = '') = (cta_url = '')),
 check(cta_url = '' or (
   cta_url !~ '[[:space:][:cntrl:]]' and position(chr(92) in cta_url) = 0
   and (cta_url ~ '^/app([/?#]|$)' or cta_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#]|$)')
 ))
);
create index platform_announcements_active on private.platform_announcements(priority desc, created_at desc, id)
 where status = 'published';
create unique index platform_announcements_media on private.platform_announcements(media_path) where media_path <> '';

create table private.announcement_receipts (
 professional_id uuid not null references public.professional_profiles(id) on delete cascade,
 announcement_id uuid not null references private.platform_announcements(id) on delete cascade,
 seen_at timestamptz not null default now(),
 dismissed_at timestamptz,
 primary key(professional_id, announcement_id)
);
create index announcement_receipts_announcement on private.announcement_receipts(announcement_id);
create table private.announcement_session_receipts (
 professional_id uuid not null,
 announcement_id uuid not null,
 session_id text not null,
 primary key(professional_id, announcement_id, session_id),
 foreign key(professional_id, announcement_id) references private.announcement_receipts(professional_id, announcement_id) on delete cascade
);
alter table private.platform_announcements enable row level security;
alter table private.announcement_receipts enable row level security;
alter table private.announcement_session_receipts enable row level security;
create policy announcements_rpc_only on private.platform_announcements to authenticated using(false);
create policy announcement_receipts_rpc_only on private.announcement_receipts to authenticated using(false);
create policy announcement_session_receipts_rpc_only on private.announcement_session_receipts to authenticated using(false);
revoke all on private.platform_announcements, private.announcement_receipts, private.announcement_session_receipts from public, anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
 values('platform-announcements', 'platform-announcements', false, 52428800,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);

-- The existing admin check uses a private, server-controlled admin membership.
-- Storage can read a draft only for admins; professionals can read active media.
create function private.announcement_asset_access(p_path text, p_operation text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then return false; end if;
 if private.is_platform_admin() then
   if p_operation = 'upload' then
     return p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$';
   elsif p_operation = 'remove' then
     return not exists(select 1 from private.platform_announcements where media_path = p_path);
   end if;
   return p_operation = 'read';
 end if;
 return p_operation = 'read'
   and exists(select 1 from public.professional_profiles where id = auth.uid())
   and exists(select 1 from private.platform_announcements a where a.media_path = p_path
     and a.status = 'published' and (a.starts_at is null or a.starts_at <= now()) and (a.ends_at is null or a.ends_at > now()));
end $$;
revoke all on function private.announcement_asset_access(text, text) from public, anon, service_role;
grant execute on function private.announcement_asset_access(text, text) to authenticated;
create policy announcement_asset_upload on storage.objects for insert to authenticated
 with check(bucket_id = 'platform-announcements' and private.announcement_asset_access(name, 'upload'));
create policy announcement_asset_read on storage.objects for select to authenticated
 using(bucket_id = 'platform-announcements' and private.announcement_asset_access(name, 'read'));
create policy announcement_asset_remove on storage.objects for delete to authenticated
 using(bucket_id = 'platform-announcements' and private.announcement_asset_access(name, 'remove'));

create function private.validate_announcement_media(p_id uuid, p_path text, p_mime text) returns boolean
language sql stable security invoker set search_path = '' as $$
 select p_path <> '' and split_part(p_path, '/', 1) = p_id::text and exists(
   select 1 from storage.objects o where o.bucket_id = 'platform-announcements' and o.name = p_path
   and o.metadata->>'mimetype' = p_mime
   and (o.metadata->>'size')::bigint between 1 and case when p_mime like 'image/%' then 5242880 else 52428800 end
 )
$$;
revoke all on function private.validate_announcement_media(uuid, text, text) from public, anon, authenticated, service_role;

create function private.announcements_admin_api(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := private.require_platform_admin();
 item private.platform_announcements;
 before_value jsonb;
 target_id uuid;
 expected integer;
begin
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input'; end if;
 if p_action = 'list' then
   return (select coalesce(jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc, a.id), '[]') from private.platform_announcements a);
 end if;
 if p_action is null or p_action not in ('save', 'status', 'delete') then raise exception 'invalid_action'; end if;
 target_id := (p_data->>'id')::uuid;
 expected := (p_data->>'expected_revision')::integer;
 if target_id is null or expected is null then raise exception 'invalid_input'; end if;
 -- Serialize both a new id and later edits, including simultaneous create requests.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_id::text, 0));
 select * into item from private.platform_announcements where id = target_id for update;
 if item.id is null then
   if p_action <> 'save' or expected <> 0 then raise exception 'announcement_not_found'; end if;
 elsif item.revision <> expected then raise exception 'stale_revision';
 end if;
 before_value := case when item.id is not null then to_jsonb(item) else null end;

 if p_action = 'save' then
   if exists(select 1 from unnest(array['title','body','media_path','media_mime','media_alt','cta_label','cta_url','status','frequency']) field
       where jsonb_typeof(p_data->field) is distinct from 'string')
     or jsonb_typeof(p_data->'priority') is distinct from 'number' then raise exception 'invalid_input'; end if;
   if p_data->>'media_path' <> '' and not private.validate_announcement_media(target_id, p_data->>'media_path', p_data->>'media_mime') then
     raise exception 'invalid_media';
   end if;
   insert into private.platform_announcements(id, title, body, media_path, media_mime, media_alt, cta_label, cta_url,
     status, frequency, starts_at, ends_at, priority)
   values(target_id, btrim(p_data->>'title'), btrim(p_data->>'body'), p_data->>'media_path', p_data->>'media_mime',
     btrim(p_data->>'media_alt'), btrim(p_data->>'cta_label'), btrim(p_data->>'cta_url'), p_data->>'status', p_data->>'frequency',
     (p_data->>'starts_at')::timestamptz, (p_data->>'ends_at')::timestamptz, (p_data->>'priority')::integer)
   on conflict(id) do update set title = excluded.title, body = excluded.body, media_path = excluded.media_path,
     media_mime = excluded.media_mime, media_alt = excluded.media_alt, cta_label = excluded.cta_label, cta_url = excluded.cta_url,
     status = excluded.status, frequency = excluded.frequency, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
     priority = excluded.priority, revision = private.platform_announcements.revision + 1, updated_at = now();
 elsif p_action = 'status' then
   if p_data->>'status' is null or p_data->>'status' not in ('draft', 'published', 'paused') then raise exception 'invalid_input'; end if;
   if p_data->>'status' = 'published' and not private.validate_announcement_media(item.id, item.media_path, item.media_mime) then
     raise exception 'invalid_media';
   end if;
   update private.platform_announcements set status = p_data->>'status', revision = revision + 1, updated_at = now() where id = target_id;
 else
   delete from private.platform_announcements where id = target_id;
 end if;
 insert into private.admin_audit(actor_admin, action, entity, entity_id, metadata)
   values(actor, 'announcement_' || p_action, 'platform_announcements', target_id::text,
     jsonb_build_object('before', before_value, 'after', (select to_jsonb(a) from private.platform_announcements a where id = target_id)));
 return (select coalesce(jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc, a.id), '[]') from private.platform_announcements a);
exception
 when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow then
   raise exception 'invalid_input' using errcode = '22023';
end $$;
create function public.announcements_admin_api(p_action text, p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$select private.announcements_admin_api(p_action, p_data)$$;
revoke all on function private.announcements_admin_api(text, jsonb), public.announcements_admin_api(text, jsonb) from public, anon, service_role;
grant execute on function private.announcements_admin_api(text, jsonb), public.announcements_admin_api(text, jsonb) to authenticated;

create function private.my_announcements(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid();
 login_session text := coalesce(auth.jwt()->>'session_id', 'legacy');
 item private.platform_announcements;
 first_seen boolean;
begin
 if actor is null or not exists(select 1 from public.professional_profiles where id = actor) then
   raise exception 'professional_required' using errcode = '42501';
 end if;
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input'; end if;
 if p_action = 'list' then
   return (select coalesce(jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc, a.id), '[]')
     from private.platform_announcements a left join private.announcement_receipts r on r.announcement_id = a.id and r.professional_id = actor
     where a.status = 'published' and (a.starts_at is null or a.starts_at <= now()) and (a.ends_at is null or a.ends_at > now())
       and ((a.frequency = 'once' and r.seen_at is null)
         or (a.frequency = 'session' and not exists(select 1 from private.announcement_session_receipts s
           where s.professional_id = actor and s.announcement_id = a.id and s.session_id = login_session))
         or (a.frequency = 'until_dismissed' and r.dismissed_at is null)));
 end if;
 if p_action is null or p_action not in ('seen', 'dismiss') then raise exception 'invalid_action'; end if;
 select * into item from private.platform_announcements where id = (p_data->>'id')::uuid for share;
 if item.id is null or item.revision <> (p_data->>'revision')::integer or p_data->>'revision' is null
   or item.status <> 'published' or (item.starts_at is not null and item.starts_at > now()) or (item.ends_at is not null and item.ends_at <= now()) then
   return 'false'::jsonb;
 end if;
 -- Once/session impressions are claimed atomically, so concurrent tabs do not
 -- show the same announcement twice. Dismissals are idempotent and user-scoped.
 if p_action = 'dismiss' then
   insert into private.announcement_receipts as r(professional_id, announcement_id, dismissed_at)
     values(actor, item.id, now()) on conflict(professional_id, announcement_id) do update set dismissed_at = coalesce(r.dismissed_at, excluded.dismissed_at);
   return 'true'::jsonb;
 end if;
 insert into private.announcement_receipts(professional_id, announcement_id) values(actor, item.id) on conflict do nothing;
 first_seen := found;
 if item.frequency = 'once' then return to_jsonb(first_seen); end if;
 if item.frequency = 'session' then
   insert into private.announcement_session_receipts(professional_id, announcement_id, session_id)
     values(actor, item.id, login_session) on conflict do nothing;
   return to_jsonb(found);
 end if;
 return (select to_jsonb(dismissed_at is null) from private.announcement_receipts where professional_id = actor and announcement_id = item.id);
end $$;
create function public.my_announcements(p_action text, p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$select private.my_announcements(p_action, p_data)$$;
revoke all on function private.my_announcements(text, jsonb), public.my_announcements(text, jsonb) from public, anon, service_role;
grant execute on function private.my_announcements(text, jsonb), public.my_announcements(text, jsonb) to authenticated;

commit;
