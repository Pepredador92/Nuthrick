-- Keep the applied migration history immutable; align the redaction allowlist
-- with the existing patient schema (full_name, not a parallel name field).
do $$
declare definition text;
begin
  select pg_get_functiondef('public.ai_clinical_source(uuid,uuid,uuid,integer)'::regprocedure) into definition;
  execute replace(definition,'jsonb_build_array(p.name,p.email,p.phone)','jsonb_build_array(p.full_name,p.email,p.phone)');
end; $$;
