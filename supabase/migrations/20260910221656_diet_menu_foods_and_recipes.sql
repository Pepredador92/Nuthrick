-- Objective 7: food and recipe catalog plus versioned menu snapshots.
-- No official food rows are seeded here: a documented, licensed source must be
-- reviewed before any equivalence portion is labelled as catalog data.

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.professional_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 180),
  brand text,
  category text,
  exchange_system_code text not null,
  exchange_catalog_version text not null,
  group_code text not null check (group_code in (
    'VEGETABLES','FRUITS','CEREALS_NO_FAT','CEREALS_WITH_FAT','LEGUMES',
    'AOA_VERY_LOW_FAT','AOA_LOW_FAT','AOA_MODERATE_FAT','AOA_HIGH_FAT',
    'MILK_SKIM','MILK_SEMI_SKIM','MILK_WHOLE','MILK_WITH_SUGAR',
    'FATS_NO_PROTEIN','FATS_WITH_PROTEIN','SUGARS_NO_FAT','SUGARS_WITH_FAT'
  )),
  portion_amount numeric(10,3) not null check (portion_amount > 0),
  portion_unit text not null check (portion_unit in (
    'g','ml','piece','cup','tablespoon','teaspoon','slice','tortilla','glass','serving','unit'
  )),
  portion_description text not null check (char_length(btrim(portion_description)) between 1 and 120),
  edible_grams numeric(10,3) check (edible_grams is null or edible_grams > 0),
  energy_kcal numeric(10,3) check (energy_kcal is null or energy_kcal >= 0),
  carbohydrate_g numeric(10,3) check (carbohydrate_g is null or carbohydrate_g >= 0),
  protein_g numeric(10,3) check (protein_g is null or protein_g >= 0),
  fat_g numeric(10,3) check (fat_g is null or fat_g >= 0),
  fiber_g numeric(10,3) check (fiber_g is null or fiber_g >= 0),
  sodium_mg numeric(10,3) check (sodium_mg is null or sodium_mg >= 0),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  source text not null,
  source_version text not null,
  is_custom boolean not null default true,
  use_count integer not null default 0 check (use_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_custom and owner_id is not null) or not is_custom)
);

create unique index food_items_owner_name_group_idx
  on public.food_items (owner_id, normalized_name, group_code, portion_unit)
  where owner_id is not null and active;
create index food_items_search_idx on public.food_items (normalized_name, group_code) where active;
create index food_items_owner_recent_idx on public.food_items (owner_id, updated_at desc) where active;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.professional_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 180),
  description text,
  meal_types text[] not null default '{}'::text[],
  servings numeric(10,3) not null default 1 check (servings > 0),
  instructions text,
  image_path text,
  source text not null,
  source_version text not null,
  is_custom boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  check ((is_custom and owner_id is not null) or not is_custom)
);

create unique index recipes_owner_name_idx
  on public.recipes (owner_id, normalized_name)
  where owner_id is not null and active;
create index recipes_owner_recent_idx on public.recipes (owner_id, updated_at desc) where active;

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete restrict,
  amount numeric(10,3) not null check (amount > 0),
  unit text not null,
  display_order integer not null default 0 check (display_order >= 0),
  food_snapshot jsonb not null check (jsonb_typeof(food_snapshot) = 'object'),
  exchange_contribution jsonb not null check (jsonb_typeof(exchange_contribution) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (owner_id, recipe_id) references public.recipes(owner_id, id) on delete cascade
);

create index recipe_items_recipe_order_idx on public.recipe_items (recipe_id, display_order);
create index recipe_items_owner_recipe_idx on public.recipe_items (owner_id, recipe_id);
create index recipe_items_food_idx on public.recipe_items (food_item_id) where food_item_id is not null;

create trigger food_items_updated_at before update on public.food_items
for each row execute function private.set_updated_at();
create trigger recipes_updated_at before update on public.recipes
for each row execute function private.set_updated_at();

alter table public.food_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;

create policy food_items_read_available on public.food_items for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy food_items_insert_own on public.food_items for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_custom);
create policy food_items_update_own on public.food_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and is_custom);
create policy food_items_delete_own on public.food_items for delete to authenticated
  using (owner_id = (select auth.uid()) and is_custom);

create policy recipes_read_available on public.recipes for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy recipes_insert_own on public.recipes for insert to authenticated
  with check (owner_id = (select auth.uid()) and is_custom);
create policy recipes_update_own on public.recipes for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and is_custom);
create policy recipes_delete_own on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid()) and is_custom);

create policy recipe_items_read_available on public.recipe_items for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy recipe_items_insert_own on public.recipe_items for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
    and (
      food_item_id is null or exists (
        select 1 from public.food_items f
        where f.id = food_item_id and (f.owner_id is null or f.owner_id = (select auth.uid()))
      )
    )
  );
create policy recipe_items_update_own on public.recipe_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.owner_id = (select auth.uid())
    )
    and (
      food_item_id is null or exists (
        select 1 from public.food_items f
        where f.id = food_item_id and (f.owner_id is null or f.owner_id = (select auth.uid()))
      )
    )
  );
create policy recipe_items_delete_own on public.recipe_items for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.food_items to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_items to authenticated;

alter table public.nutrition_plans add column if not exists diet_menu jsonb;
alter table public.nutrition_plans add constraint nutrition_plans_diet_menu_object_check
  check (
    diet_menu is null or (
      jsonb_typeof(diet_menu) = 'object'
      and diet_menu ? 'schema_version'
      and diet_menu ? 'source_meal_distribution_snapshot'
      and diet_menu ? 'menus'
      and diet_menu ? 'derived_exchange_usage'
      and diet_menu ? 'status'
    )
  );

comment on table public.food_items is
  'Versioned food catalog. System rows require a documented source; professional rows are explicitly custom.';
comment on table public.recipes is
  'Reusable recipe definitions. Plans store snapshots so historical menus do not change when recipes are edited.';
comment on column public.nutrition_plans.diet_menu is
  'Versioned food/recipe materialization of meal_distribution, with historical snapshots and support for menu variants.';
