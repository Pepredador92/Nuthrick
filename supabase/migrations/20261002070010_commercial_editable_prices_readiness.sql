begin;
-- A price authorized through Admin is valid independently of the pilot amount.
-- Provider identity, currency, current version and amount remain checked by Stripe.
do $$ declare d text; old text; replacement text; begin
 d:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
 old:='(select count(*) from private.plans where active and not internal_only)=2 and (select count(*) from private.plans where code=''esencial'' and monthly_price=349 and annual_price=3490 and currency=''MXN'')=1 and (select count(*) from private.plans where code=''profesional'' and monthly_price=499 and annual_price=4990 and currency=''MXN'')=1';
 replacement:='exists(select 1 from private.plans where active and not internal_only) and not exists(select 1 from private.plans where active and not internal_only and (monthly_price is null or monthly_price<=0 or annual_price is null or annual_price<=0 or currency<>''MXN''))';
 if position(old in d)=0 then raise exception 'commercial_plan_readiness_patch_missing'; end if;
 d:=replace(d,old,replacement);
 d:=replace(d,'Esencial $349/$3,490 MXN y Profesional $499/$4,990 MXN.','Se validan los precios vigentes del catálogo público en MXN; las compras existentes conservan su versión.');
 old:='(select count(*)=3 from private.ai_credit_packages where active and not internal_only and ((credits=100 and price_amount=99) or (credits=500 and price_amount=349) or (credits=1000 and price_amount=699)))';
 replacement:='exists(select 1 from private.ai_credit_packages where active and not internal_only) and not exists(select 1 from private.ai_credit_packages where active and not internal_only and (credits<=0 or price_amount<=0 or currency<>''MXN''))';
 if position(old in d)=0 then raise exception 'commercial_credit_readiness_patch_missing'; end if;
 d:=replace(d,old,replacement);
 d:=replace(d,'Precios comerciales registrados: 100/$99, 500/$349 y 1,000/$699 MXN. La compra Live requiere precios sincronizados y acceso elegible.','Se validan los paquetes vigentes en MXN. Cada compra Live verifica el precio y los créditos de su versión.');
 execute d;
 d:=pg_get_functiondef('private.billing_pilot_readiness()'::regprocedure);
 if position('(select count(*)=2 from private.plans where active and not internal_only)' in d)=0 then raise exception 'live_price_count_patch_missing'; end if;
 d:=replace(d,'(select count(*)=2 from private.plans where active and not internal_only)','exists(select 1 from private.plans where active and not internal_only)');
 d:=replace(d,'Los cuatro precios se verifican contra la configuración comercial vigente; no se copian IDs TEST.','Todos los precios se verifican contra el catálogo vigente; no se copian IDs TEST.');
 execute d;
end $$;
commit;
