create or replace function public.save_measurement_workspace(p_measurement_type_ids text[])
returns setof public.professional_measurement_workspace_items
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  requested_type_id text;
  item_count integer;
  distinct_item_count integer;
begin
  if owner_id is null or p_measurement_type_ids is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  item_count := coalesce(array_length(p_measurement_type_ids, 1), 0);
  select count(*) into distinct_item_count
  from (select distinct unnest(p_measurement_type_ids)) as unique_items;
  if item_count > 100 or distinct_item_count <> item_count then
    raise exception 'Invalid measurement workspace' using errcode = '23514';
  end if;

  foreach requested_type_id in array p_measurement_type_ids loop
    if not exists (
      select 1 from public.measurement_types
      where id = requested_type_id and is_active and category <> 'laboratory'
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
  select owner_id, workspace_item.measurement_type_id, workspace_item.ordinal - 1
  from unnest(p_measurement_type_ids) with ordinality as workspace_item(measurement_type_id, ordinal);

  return query
  select * from public.professional_measurement_workspace_items
  where professional_id = owner_id
  order by display_order;
end;
$$;

revoke all on function public.save_measurement_workspace(text[]) from public, anon;
grant execute on function public.save_measurement_workspace(text[]) to authenticated;
