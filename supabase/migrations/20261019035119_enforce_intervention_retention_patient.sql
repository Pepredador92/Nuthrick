begin;

-- All strategy writes go through this owner-scoped RPC. Check the patient
-- after ownership is established and before any draft or execution mutation.
-- Read access remains available for the professional's complete history.
do $$
declare
 definition text := pg_get_functiondef('private.clinical_interventions(uuid,integer,text,jsonb)'::regprocedure);
 anchor text := $anchor$ if not found or c.status not in ('draft','completed') then raise exception 'context_unavailable'; end if;$anchor$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1
   or position('perform private.require_retention_patient(owner,c.patient_id)' in definition)>0 then
  raise exception 'unexpected_intervention_retention_definition';
 end if;
 execute replace(definition,anchor,anchor || E'\n if p_action is distinct from ''read'' then\n  perform private.require_retention_patient(owner,c.patient_id);\n end if;');
end $$;

commit;
