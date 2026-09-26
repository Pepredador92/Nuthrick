-- A Gmail proof must identify the configured sender, not merely any stored OAuth account.
do $migration$
declare definition text; original text;
begin
  definition := pg_get_functiondef('private.transactional_email_server(text,jsonb)'::regprocedure);
  original := definition;
  definition := replace(definition,
    $old$if s.provider<>'gmail' then raise exception 'email_configuration_required';end if;$old$,
    $new$if s.provider<>'gmail' then raise exception 'email_configuration_required';end if;
  if not exists(select 1 from private.agenda_mail_sender where singleton and lower(trim(email))=lower(trim(s.from_email))) then raise exception 'email_sender_mismatch';end if;$new$);
  if definition=original then raise exception 'gmail_credentials_guard_target_missing';end if;
  original := definition;
  definition := replace(definition,
    $old$if p_action='verified' then$old$,
    $new$if p_action='verified' then
  if s.provider='gmail' and (
    p_data->'evidence'->>'oauth' is distinct from 'true'
    or lower(trim(p_data->'evidence'->>'sender_email')) is distinct from lower(trim(s.from_email))
    or not exists(select 1 from private.agenda_mail_sender where singleton and lower(trim(email))=lower(trim(s.from_email)))
  ) then raise exception 'email_sender_mismatch';end if;$new$);
  if definition=original then raise exception 'gmail_verification_guard_target_missing';end if;
  execute definition;
end $migration$;

-- Invalidate any prior proof that was obtained with a different Gmail account.
update private.transactional_email_settings s
set verified_at=null, runtime_verified_at=null, domain_evidence='{}'::jsonb
where provider='gmail' and (
  lower(trim(domain_evidence->>'sender_email')) is distinct from lower(trim(from_email))
  or not exists(select 1 from private.agenda_mail_sender where singleton and lower(trim(email))=lower(trim(s.from_email)))
);
