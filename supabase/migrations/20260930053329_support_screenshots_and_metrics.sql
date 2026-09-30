begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('support-screenshots','support-screenshots',false,5242880,array['image/png','image/jpeg','image/webp']);
create table private.support_assets (
 id uuid primary key default gen_random_uuid(),uploader_id uuid not null references auth.users(id) on delete cascade,
 path text not null unique,file_name text not null,mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 bytes integer not null check(bytes between 1 and 5242880),
 message_seq bigint unique references private.support_messages(seq) on delete cascade,
 created_at timestamptz not null default now()
);
create index support_assets_uploader on private.support_assets(uploader_id,created_at);
alter table private.support_assets enable row level security;
create policy support_rpc_only on private.support_assets to authenticated using(false);
revoke all on private.support_assets from public,anon,authenticated;
create function private.support_asset_access(p_path text,p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 if p_operation='remove' then
  perform 1 from private.support_assets where path=p_path and uploader_id=auth.uid() and message_seq is null for update;
 end if;
 return exists(
  select 1 from private.support_assets a left join private.support_messages m on m.seq=a.message_seq left join public.support_threads t on t.id=m.thread_id
  where a.path=p_path and (
   (a.message_seq is null and a.uploader_id=auth.uid() and (p_operation in ('read','remove') or (p_operation='upload' and a.created_at>now()-interval '1 hour')))
   or (p_operation='read' and a.message_seq is not null and (private.is_platform_admin() or (t.professional_id=auth.uid() and t.status<>'resolved')))
  )
 );
end $$;
revoke all on function private.support_asset_access(text,text) from public,anon;
grant execute on function private.support_asset_access(text,text) to authenticated;
create policy support_screenshot_insert on storage.objects for insert to authenticated
 with check(bucket_id='support-screenshots' and private.support_asset_access(name,'upload'));
create policy support_screenshot_read on storage.objects for select to authenticated
 using(bucket_id='support-screenshots' and private.support_asset_access(name,'read'));
create policy support_screenshot_remove on storage.objects for delete to authenticated
 using(bucket_id='support-screenshots' and private.support_asset_access(name,'remove'));

-- Keep the existing message/permission/state implementation as the single source
-- of truth. This wrapper binds a verified private upload in the same transaction.
create function private.support_delivery(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); admin_mode boolean:=coalesce((p_data->>'admin')::boolean,false);
 asset private.support_assets; result jsonb; asset_id uuid:=(p_data->>'assetId')::uuid;
begin
 if actor is null then raise exception 'unauthorized'; end if;
 if admin_mode then
  if not private.is_platform_admin() then raise exception 'admin_required'; end if;
 elsif not exists(select 1 from public.professional_profiles where id=actor) then raise exception 'professional_required'; end if;
 if octet_length(p_data::text)>40000 then raise exception 'invalid_input'; end if;
 if p_action='prepare_asset' then
  if coalesce(p_data->>'mime','') not in ('image/png','image/jpeg','image/webp') or coalesce((p_data->>'bytes')::bigint,0) not between 1 and 5242880
   or length(btrim(coalesce(p_data->>'fileName',''))) not between 1 and 160 then raise exception 'invalid_attachment'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,454));
  if (select count(*) from private.support_assets where uploader_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'attachment_rate_limited'; end if;
  asset_id:=gen_random_uuid();
  insert into private.support_assets(id,uploader_id,path,file_name,mime,bytes)
   values(asset_id,actor,actor::text||'/'||asset_id::text||case p_data->>'mime' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end,btrim(p_data->>'fileName'),p_data->>'mime',(p_data->>'bytes')::integer) returning * into asset;
  return jsonb_build_object('id',asset.id,'path',asset.path,'file_name',asset.file_name);
 elsif p_action='pending_assets' then
  -- The client may remove abandoned uploads through Storage's authenticated API.
  -- Never delete Storage metadata directly: the underlying object must be removed too.
  return (select coalesce(jsonb_agg(jsonb_build_object('path',path)),'[]') from private.support_assets where uploader_id=actor and message_seq is null and created_at<now()-interval '1 hour');
 elsif p_action='stats' then
  if not admin_mode then raise exception 'admin_required'; end if;
  return (select jsonb_build_object(
   'new',count(*) filter(where status='new'),'in_progress',count(*) filter(where status='in_progress'),'waiting',count(*) filter(where status='waiting'),
   'without_reply',count(*) filter(where status<>'resolved' and first_response_at is null),
   'opened_30d',count(*) filter(where created_at>=now()-interval '30 days'),
   'resolved_30d',count(*) filter(where resolved_at>=now()-interval '30 days'),
   'response_minutes',round(avg(extract(epoch from first_response_at-created_at)/60) filter(where created_at>=now()-interval '30 days' and first_response_at is not null)::numeric,1),
   'response_sample',count(*) filter(where created_at>=now()-interval '30 days' and first_response_at is not null),
   'resolution_minutes',round(avg(extract(epoch from resolved_at-created_at)/60) filter(where resolved_at>=now()-interval '30 days')::numeric,1),
   'as_of',now()) from public.support_threads);
 elsif p_action='send' and asset_id is not null then
  select * into asset from private.support_assets where id=asset_id and uploader_id=actor for update;
  if not found then raise exception 'invalid_attachment'; end if;
  if asset.message_seq is not null then
   if not exists(select 1 from private.support_messages where seq=asset.message_seq and author_id=actor and client_key=(p_data->>'clientKey')::uuid) then raise exception 'attachment_already_sent'; end if;
  elsif asset.created_at<now()-interval '1 hour' then raise exception 'attachment_expired'; end if;
  if not exists(select 1 from storage.objects where bucket_id='support-screenshots' and name=asset.path and metadata->>'mimetype'=asset.mime and (metadata->>'size')::bigint=asset.bytes) then raise exception 'attachment_not_uploaded'; end if;
  result:=private.support_api(p_action,p_data);
  update private.support_assets set message_seq=(result->>'seq')::bigint where id=asset.id;
  return result;
 end if;
 result:=private.support_api(p_action,p_data);
 if p_action='thread' then
  result:=jsonb_set(result,'{messages}',(select coalesce(jsonb_agg(message||jsonb_build_object('attachment',case when a.id is null then null else jsonb_build_object('id',a.id,'path',a.path,'file_name',a.file_name) end) order by (message->>'seq')::bigint),'[]')
   from jsonb_array_elements(result->'messages') message left join private.support_assets a on a.message_seq=(message->>'seq')::bigint));
 end if;
 return result;
end $$;
revoke all on function private.support_delivery(text,jsonb) from public,anon;
grant execute on function private.support_delivery(text,jsonb) to authenticated;
create or replace function public.support_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.support_delivery(p_action,p_data)$$;
commit;
