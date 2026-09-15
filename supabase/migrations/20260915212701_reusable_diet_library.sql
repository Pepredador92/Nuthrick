begin;
create table public.diet_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references public.professional_profiles(id),
  name text not null check (length(trim(name)) between 1 and 120),
  content jsonb not null check (jsonb_typeof(content) = 'object' and content->>'schema_version' = '1'),
  revision bigint not null default 1,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diet_library_owner_updated on public.diet_library_items(owner_id, archived, updated_at desc);
alter table public.diet_library_items enable row level security;
revoke all on public.diet_library_items from anon, authenticated;
grant select on public.diet_library_items to authenticated;
grant insert(id, name, content) on public.diet_library_items to authenticated;
grant update(name, content, archived) on public.diet_library_items to authenticated;
create policy library_read on public.diet_library_items for select to authenticated
  using (owner_id = (select auth.uid()) or owner_id is null);
create policy library_create on public.diet_library_items for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy library_update on public.diet_library_items for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Defense in depth: snapshots have a narrow root and may never contain clinical fields.
create function private.library_has_clinical_fields(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(value) = 'object' then
    for k,v in select * from jsonb_each(value) loop
      if (k <> 'patient_substitutions' and k ~ '(^|_)(patient|consultation|birth|weight|height|sex|age|clinical|history|professional|owner)(_|$)')
        or k = any(array['energy_calculation','macro_distribution','food_preferences','private_notes','antecedents']) then return true; end if;
      if private.library_has_clinical_fields(v) then return true; end if;
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for v in select * from jsonb_array_elements(value) loop
      if private.library_has_clinical_fields(v) then return true; end if;
    end loop;
  end if;
  return false;
end $$;
create function private.guard_diet_library() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.content->>'schema_version' is distinct from '1'
    or new.content - array['schema_version','reference_targets','exchange_groups','distribution','menu'] <> '{}'::jsonb
    or not (new.content ?& array['schema_version','reference_targets','exchange_groups','distribution','menu'])
    or jsonb_typeof(new.content->'distribution') <> 'object' or jsonb_typeof(new.content->'menu') <> 'object'
    or jsonb_typeof(new.content->'exchange_groups') <> 'array'
    or private.library_has_clinical_fields(new.content) then
    raise exception 'La biblioteca solo admite contenido reutilizable sin campos clínicos' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then new.revision := old.revision + 1; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger diet_library_guard before insert or update on public.diet_library_items
for each row execute function private.guard_diet_library();

alter table public.nutrition_plans add column library_origin jsonb;
create table private.diet_library_backups (
  token uuid primary key,
  plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  owner_id uuid not null references public.professional_profiles(id),
  source_id uuid not null references public.diet_library_items(id),
  source_revision bigint not null,
  prior_content jsonb not null,
  applied_revision bigint not null,
  restored boolean not null default false,
  created_at timestamptz not null default now()
);
create index diet_library_backups_plan on private.diet_library_backups(plan_id, created_at desc);
create index diet_library_backups_owner on private.diet_library_backups(owner_id);
create index diet_library_backups_source on private.diet_library_backups(source_id);
revoke all on private.diet_library_backups from public, anon, authenticated;

-- Atomic replacement. Caller cannot update identity, goals, formula inputs or publication.
create function public.apply_diet_library(p_plan_id uuid, p_expected_revision bigint, p_source_id uuid, p_source_revision bigint, p_token uuid, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_plans; s public.diet_library_items; b private.diet_library_backups; previous jsonb;
begin
  select * into p from public.nutrition_plans where id=p_plan_id and professional_id=(select auth.uid()) for update;
  if not found then raise exception 'Plan no disponible' using errcode='42501'; end if;
  select * into b from private.diet_library_backups where token=p_token;
  if found then
    if b.plan_id<>p_plan_id or b.owner_id<>auth.uid() or b.source_id<>p_source_id or b.source_revision<>p_source_revision then raise exception 'Clave de operación no válida' using errcode='23505'; end if;
    return to_jsonb(p);
  end if;
  if p.draft_revision is distinct from p_expected_revision then raise exception 'El borrador cambió. Vuelve a abrir la biblioteca.' using errcode='40001'; end if;
  select * into s from public.diet_library_items where id=p_source_id and not archived and (owner_id=auth.uid() or owner_id is null) for share;
  if not found or s.revision is distinct from p_source_revision then raise exception 'La base cambió o ya no está disponible' using errcode='40001'; end if;
  if jsonb_typeof(p_content) is distinct from 'object'
    or p_content - array['exchange_prescription','meal_distribution','diet_menu'] <> '{}'::jsonb
    or not(p_content ?& array['exchange_prescription','meal_distribution','diet_menu'])
    or jsonb_typeof(p_content->'diet_menu')<>'object' or jsonb_typeof(p_content->'meal_distribution')<>'object'
    or jsonb_typeof(p_content->'exchange_prescription')<>'object' then raise exception 'Contenido no válido' using errcode='23514'; end if;
  previous := jsonb_build_object('exchange_prescription',p.exchange_prescription,'meal_distribution',p.meal_distribution,'diet_menu',p.diet_menu,'library_origin',p.library_origin);
  update public.nutrition_plans set exchange_prescription=p_content->'exchange_prescription', meal_distribution=p_content->'meal_distribution', diet_menu=p_content->'diet_menu',
    library_origin=jsonb_build_object('id',s.id,'revision',s.revision,'name',s.name,'applied_at',now()) where id=p.id returning * into p;
  insert into private.diet_library_backups(token,plan_id,owner_id,source_id,source_revision,prior_content,applied_revision)
    values(p_token,p.id,auth.uid(),s.id,s.revision,previous,p.draft_revision);
  return to_jsonb(p);
end $$;
create function public.diet_library_recovery(p_plan_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.token from private.diet_library_backups b join public.nutrition_plans p on p.id=b.plan_id
  where p.id=p_plan_id and p.professional_id=(select auth.uid()) and b.owner_id=(select auth.uid())
    and not b.restored and p.draft_revision=b.applied_revision order by b.created_at desc limit 1;
$$;
create function public.restore_diet_library_backup(p_plan_id uuid, p_token uuid, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_plans; b private.diet_library_backups;
begin
  select * into p from public.nutrition_plans where id=p_plan_id and professional_id=(select auth.uid()) for update;
  if not found then raise exception 'Plan no disponible' using errcode='42501'; end if;
  select * into b from private.diet_library_backups where token=p_token and plan_id=p.id and owner_id=auth.uid() and not restored for update;
  if not found or p.draft_revision is distinct from p_expected_revision or p.draft_revision is distinct from b.applied_revision then raise exception 'Hay cambios posteriores. No se sobrescribirá tu trabajo.' using errcode='40001'; end if;
  update public.nutrition_plans set exchange_prescription=nullif(b.prior_content->'exchange_prescription','null'::jsonb), meal_distribution=nullif(b.prior_content->'meal_distribution','null'::jsonb),
    diet_menu=nullif(b.prior_content->'diet_menu','null'::jsonb),library_origin=nullif(b.prior_content->'library_origin','null'::jsonb) where id=p.id returning * into p;
  update private.diet_library_backups set restored=true where token=b.token;
  return to_jsonb(p);
end $$;
revoke all on function public.apply_diet_library(uuid,bigint,uuid,bigint,uuid,jsonb),public.diet_library_recovery(uuid),public.restore_diet_library_backup(uuid,uuid,bigint) from public,anon;
grant execute on function public.apply_diet_library(uuid,bigint,uuid,bigint,uuid,jsonb),public.diet_library_recovery(uuid),public.restore_diet_library_backup(uuid,uuid,bigint) to authenticated;
commit;
