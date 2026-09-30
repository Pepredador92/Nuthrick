-- The existing function declares a composite variable named s. Evidence joins
-- must use a different alias so PL/pgSQL can resolve them after readiness passes.
do $patch$
declare definition text; original text;
begin
  original := pg_get_functiondef('private.email_admin_api(text,jsonb)'::regprocedure);
  definition := replace(original,
    $old$join private.transactional_email_settings s on s.id where e.key='commercial_email_end_to_end' and e.evidence->>'passed'='true' and e.evidence->>'configuration_revision'=s.configuration_revision::text$old$,
    $new$join private.transactional_email_settings cfg on cfg.id where e.key='commercial_email_end_to_end' and e.evidence->>'passed'='true' and e.evidence->>'configuration_revision'=cfg.configuration_revision::text$new$);
  if definition = original then raise exception 'commercial_evidence_alias_patch_missing'; end if;
  original := definition;
  definition := replace(original,
    $old$join private.transactional_email_settings s on s.id where e.key='mail_oauth_continuity' and e.evidence->>'production_verified'='true' and e.evidence->>'sender_email'=s.from_email$old$,
    $new$join private.transactional_email_settings cfg on cfg.id where e.key='mail_oauth_continuity' and e.evidence->>'production_verified'='true' and e.evidence->>'sender_email'=cfg.from_email$new$);
  if definition = original then raise exception 'oauth_evidence_alias_patch_missing'; end if;
  execute definition;
end $patch$;
