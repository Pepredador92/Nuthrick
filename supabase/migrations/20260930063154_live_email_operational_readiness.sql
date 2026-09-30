-- Live and PRE-LIVE must use the same current delivery evidence. The old
-- email_verified_at placeholder had no writer and could remain pending forever.
do $patch$
declare definition text; original text;
begin
  original := pg_get_functiondef('private.billing_live_readiness()'::regprocedure);
  definition := replace(original,
    $old$case when c.email_verified_at is not null and exists(select 1 from private.transactional_email_settings where enabled and mode='live' and provider<>'test') then 'ready' else 'pending' end$old$,
    $new$case when private.transactional_email_ready() then 'ready' else 'pending' end$new$);
  if definition = original then raise exception 'live_email_readiness_patch_missing'; end if;
  definition := replace(definition,
    'El proveedor actual es TEST. Requiere proveedor y remitente operativos; no se cuentan entregas simuladas como reales.',
    'Exige transporte real, recepción comprobada, continuidad del remitente y envío operativo activo.');
  execute definition;
end $patch$;
