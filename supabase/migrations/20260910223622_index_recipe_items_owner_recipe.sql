create index if not exists recipe_items_owner_recipe_idx
  on public.recipe_items (owner_id, recipe_id);
