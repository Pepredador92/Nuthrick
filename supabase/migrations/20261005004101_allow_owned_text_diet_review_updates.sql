-- Text diet review is saved directly by the authenticated owner, like diet_menu.
-- The table has column-scoped UPDATE grants; adding a column does not extend them.
-- Existing ownership RLS, entitlement checks, validation and revision triggers apply.
grant update (text_diet) on table public.nutrition_plans to authenticated;
