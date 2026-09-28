-- A typed PL/pgSQL row with no match serializes as an object of null fields.
-- The handler must receive JSON null to keep subscription events on their route.
do $$
declare definition text; needle text := $needle$jsonb_build_object('credit_purchase',to_jsonb(purchase))$needle$;
begin
 definition := pg_get_functiondef('private.billing_server(text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'optional_credit_purchase_patch_missing'; end if;
 definition := replace(definition,needle,$replacement$jsonb_build_object('credit_purchase',case when purchase.id is null then null else to_jsonb(purchase) end)$replacement$);
 execute definition;
end $$;
