-- The AI Edge Function writes drafts as service_role. PostgreSQL evaluates this
-- CHECK validator on every plan update, including plans without supplements.
-- Keep validation and ownership rules intact; grant only the missing EXECUTE.
grant execute on function private.valid_diet_supplements(jsonb) to service_role;
