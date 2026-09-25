-- The public legal pages need only document metadata/content references. Keep
-- the projection public while retaining the source documents in private.
drop view if exists public.legal_documents_public;
create table if not exists public.legal_documents_public (
  key text primary key,
  title text not null,
  version integer not null,
  effective_at timestamptz,
  review_status text not null,
  content_ref text not null,
  updated_at timestamptz not null
);
alter table public.legal_documents_public enable row level security;
drop policy if exists legal_documents_public_read on public.legal_documents_public;
create policy legal_documents_public_read on public.legal_documents_public for select to anon,authenticated using (true);
revoke all on table public.legal_documents_public from public,anon,authenticated,service_role;
grant select on table public.legal_documents_public to anon,authenticated;

create or replace function private.sync_legal_documents_public() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then delete from public.legal_documents_public where key=old.key; return old; end if;
  insert into public.legal_documents_public(key,title,version,effective_at,review_status,content_ref,updated_at)
  values(new.key,new.title,new.version,new.effective_at,new.review_status,new.content_ref,new.updated_at)
  on conflict(key) do update set title=excluded.title,version=excluded.version,effective_at=excluded.effective_at,review_status=excluded.review_status,content_ref=excluded.content_ref,updated_at=excluded.updated_at;
  return new;
end $$;
drop trigger if exists legal_documents_public_sync on private.legal_documents;
create trigger legal_documents_public_sync after insert or update or delete on private.legal_documents for each row execute function private.sync_legal_documents_public();
revoke all on function private.sync_legal_documents_public() from public,anon,authenticated,service_role;
insert into public.legal_documents_public(key,title,version,effective_at,review_status,content_ref,updated_at)
select key,title,version,effective_at,review_status,content_ref,updated_at from private.legal_documents
on conflict(key) do update set title=excluded.title,version=excluded.version,effective_at=excluded.effective_at,review_status=excluded.review_status,content_ref=excluded.content_ref,updated_at=excluded.updated_at;

create or replace function public.legal_document(p_document_key text) returns jsonb
language sql security invoker set search_path='' as $$
  select to_jsonb(d)
  from public.legal_documents_public d
  where d.key=p_document_key
$$;
revoke all on function public.legal_document(text) from public,authenticated,service_role;
grant execute on function public.legal_document(text) to anon,authenticated;
