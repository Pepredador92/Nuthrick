-- Extend the existing allowlist/readiness only; preserve permissions, context
-- redaction, credit controls and explicit clinical approval without new AI work.
do $context$
declare definition text; amended text;
begin
  definition:=pg_get_functiondef('public.ai_clinical_source(uuid,uuid,uuid,integer)'::regprocedure);
  amended:=replace(definition,'''interview_priorities'',''objectives'',''next_objectives''',
    '''interview_priorities'',''objectives'',''treatment_objective'',''next_objectives''');
  if amended=definition then raise exception 'Unexpected clinical source definition'; end if;
  execute amended;
  definition:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
  amended:=replace(definition,'e->>''source'' like ''%objectives%''',
    '(e->>''source'' like ''%objectives%'' or e->>''source'' like ''%treatment_objective%'')');
  if amended=definition then raise exception 'Unexpected clinical readiness definition'; end if;
  execute amended;
end;
$context$;
