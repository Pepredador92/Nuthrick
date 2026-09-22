-- Canonical feature: keep historical references, retire the old operation.
update private.ai_feature_config set enabled=false where feature in ('diet_workshop','diet_draft');
update private.ai_feature_access set enabled=false where feature='diet_workshop';
alter table private.ai_feature_config add column execution_mode text not null default 'real'
 check(execution_mode in ('real','simulated'));
alter table private.ai_feature_config add constraint ai_simulated_zero_pricing check(
 execution_mode<>'simulated' or (feature='diet_draft' and input_usd_per_million=0 and cached_usd_per_million=0 and output_usd_per_million=0 and model like 'simulated-%'));

-- Simulated admission uses the SAME account lock, access, pilot limits,
-- generation/reservation, claim and settlement, with zero reserved money.
do $$
declare original text; amended text;
begin
 original:=pg_get_functiondef('public.ai_server(text,uuid,jsonb)'::regprocedure);
 amended:=replace(original,
  'needed := greatest(0.001,ceil(cost*c.credits_per_usd*c.credit_multiplier*1000)/1000);',
  'needed := case when c.execution_mode=''simulated'' then 0 else greatest(0.001,ceil(cost*c.credits_per_usd*c.credit_multiplier*1000)/1000) end;');
 if original=amended then raise exception 'unexpected_ai_server_definition'; end if;
 execute amended;
end $$;

-- Explicit service-only catalog and draft access (auto-exposure disabled).
grant select on public.nutrition_plans, public.food_items, public.recipes, public.recipe_items to service_role;
grant update on public.nutrition_plans to service_role;

-- A retired SQL entry point must not remain callable via service integrations.
revoke execute on function public.ai_workshop_source(uuid,uuid,integer), public.ai_workshop_bind(uuid,uuid,uuid,integer),
 public.ai_workshop_decision(uuid,uuid,integer,uuid,text,text,jsonb) from service_role;
