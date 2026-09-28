-- Additional observed commercial templates must not invalidate the five required
-- transport proofs; those five exact categories still have to be present.
do $$
declare definition text; needle text := $needle$and delivery_status in ('accepted','delivered'))$needle$;
begin
 definition := pg_get_functiondef('private.transactional_email_transport_ready()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'transport_proofs_patch_missing'; end if;
 definition := replace(definition,needle,$replacement$and delivery_status in ('accepted','delivered') and template_key in ('welcome','payment_confirmed','payment_failed','credits_purchased','credits_refunded'))$replacement$);
 execute definition;
end $$;
