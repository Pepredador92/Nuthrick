-- Existing Vault JSON predates PRE-LIVE and intentionally has no provider key.
-- Keep the readiness check aligned with the server-only credential contract.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('private.pre_live_readiness()'::regprocedure) into definition;
  definition:=replace(definition, E'and credentials->>''provider'' = ''stripe''\n      ', '');
  execute definition;
end $$;
