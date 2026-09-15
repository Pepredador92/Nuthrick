-- Keeps searchable commercial phrasing as an alias while preserving the
-- neutral global catalog name and the declared SMAE portion.
with aliases_to_add(stable_code, aliases) as (
  values (
    'MX_SMAE_CEREAL_NO_FAT_GALLETAS_DE_MAIZ_HORNEADAS_SIN_GRASA_SALMAS',
    array['salmas', 'galletas salmas']::text[]
  )
), updated as (
  update public.food_items as food
  set aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(food.aliases, '{}'::text[]) || source.aliases) as alias
  ),
  updated_at = timezone('utc', now())
  from aliases_to_add as source
  where food.stable_code = source.stable_code
    and food.owner_id is null
    and food.is_custom = false
    and food.active = true
  returning food.id
)
select count(*) from updated;

do $$
begin
  if not exists (
    select 1
    from public.food_items
    where stable_code = 'MX_SMAE_CEREAL_NO_FAT_GALLETAS_DE_MAIZ_HORNEADAS_SIN_GRASA_SALMAS'
      and owner_id is null
      and 'salmas' = any(aliases)
  ) then
    raise exception 'Expected curated SMAE search alias was not registered';
  end if;
end $$;
