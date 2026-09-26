-- The controlled test queue supports both the future domain provider and Gmail OAuth.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.email_admin_api(text,jsonb)'::regprocedure);
  if position('s.provider<>''resend''' in definition) = 0 then
    raise exception 'email_admin_queue_patch_missing';
  end if;
  definition := replace(definition, 's.provider<>''resend''', 's.provider not in (''resend'',''gmail'')');
  execute definition;
end $$;
