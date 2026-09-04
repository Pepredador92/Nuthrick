-- The workspace is a professional preference, never a patient template.
create table public.professional_measurement_workspaces (
  professional_id uuid primary key references public.professional_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.professional_measurement_workspace_items (
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  measurement_type_id text not null references public.measurement_types(id),
  display_order integer not null check(display_order >= 0 and display_order < 200),
  created_at timestamptz not null default now(),
  primary key (professional_id, measurement_type_id),
  unique (professional_id, display_order)
);
create index professional_measurement_workspace_items_order_idx
  on public.professional_measurement_workspace_items(professional_id, display_order);

alter table public.professional_measurement_workspaces enable row level security;
alter table public.professional_measurement_workspace_items enable row level security;
revoke all on public.professional_measurement_workspaces, public.professional_measurement_workspace_items from public, anon, authenticated;
grant select, insert, update, delete on public.professional_measurement_workspaces, public.professional_measurement_workspace_items to authenticated;
create policy professional_measurement_workspaces_owner_all on public.professional_measurement_workspaces
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy professional_measurement_workspace_items_owner_all on public.professional_measurement_workspace_items
  for all to authenticated
  using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

create function private.validate_measurement_workspace_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare catalog public.measurement_types;
begin
  select * into catalog from public.measurement_types where id = new.measurement_type_id;
  if not found or not catalog.is_active or catalog.category = 'laboratory' then
    raise exception 'Measurement type is unavailable in this workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_measurement_workspace_item() from public, anon;
grant execute on function private.validate_measurement_workspace_item() to authenticated;
create trigger professional_measurement_workspace_items_validate
  before insert or update on public.professional_measurement_workspace_items
  for each row execute function private.validate_measurement_workspace_item();

create function public.save_measurement_workspace(p_measurement_type_ids text[])
returns setof public.professional_measurement_workspace_items
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); item_id text; item_count integer; distinct_item_count integer;
begin
  if owner_id is null or p_measurement_type_ids is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  item_count := coalesce(array_length(p_measurement_type_ids, 1), 0);
  select count(*) into distinct_item_count from (select distinct unnest(p_measurement_type_ids)) as unique_items;
  if item_count > 100 or distinct_item_count <> item_count then
    raise exception 'Invalid measurement workspace' using errcode = '23514';
  end if;
  foreach item_id in array p_measurement_type_ids loop
    if not exists (
      select 1 from public.measurement_types
      where id = item_id and is_active and category <> 'laboratory'
    ) then
      raise exception 'Measurement type is unavailable in this workspace' using errcode = '23514';
    end if;
  end loop;
  insert into public.professional_measurement_workspaces(professional_id)
  values (owner_id)
  on conflict (professional_id) do update set updated_at = now();
  delete from public.professional_measurement_workspace_items
  where professional_id = owner_id;
  insert into public.professional_measurement_workspace_items(professional_id, measurement_type_id, display_order)
  select owner_id, item_id, ordinal - 1
  from unnest(p_measurement_type_ids) with ordinality as item_id(item_id, ordinal);
  return query select * from public.professional_measurement_workspace_items
    where professional_id = owner_id order by display_order;
end;
$$;
revoke all on function public.save_measurement_workspace(text[]) from public, anon;
grant execute on function public.save_measurement_workspace(text[]) to authenticated;
