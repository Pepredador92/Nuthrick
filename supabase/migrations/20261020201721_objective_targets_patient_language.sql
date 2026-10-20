begin;
-- Keep the exact legacy composition for historical plans without a textStyle.
create or replace function private.compose_nutrition_objective(goal jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select case when goal->>'textStyle'='patient_v1' then
 concat_ws('. ', nullif(regexp_replace(btrim(goal->>'outcome'),'[.;[:space:]]+$','','g'),''),
   case when btrim(goal->>'target')<>'' then 'Lo que buscamos: ' || regexp_replace(btrim(goal->>'target'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'timeframe')<>'' then 'Cuándo lo revisaremos: ' || regexp_replace(btrim(goal->>'timeframe'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'monitoring')<>'' then 'Cómo lo haremos: ' || regexp_replace(btrim(goal->>'monitoring'),'[.;[:space:]]+$','','g') end
 ) || case when coalesce(regexp_replace(btrim(goal->>'outcome'),'[.;[:space:]]+$','','g'),'')<>''
   or coalesce(btrim(goal->>'target'),'')<>'' or coalesce(btrim(goal->>'timeframe'),'')<>'' or coalesce(btrim(goal->>'monitoring'),'')<>'' then '.' else '' end
 else concat_ws('. ', nullif(regexp_replace(btrim(goal->>'outcome'),'[.;[:space:]]+$','','g'),''),
   case when btrim(goal->>'indicator')<>'' then 'Indicador: ' || regexp_replace(btrim(goal->>'indicator'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'baseline')<>'' then 'Situación inicial: ' || regexp_replace(btrim(goal->>'baseline'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'target')<>'' then 'Meta: ' || regexp_replace(btrim(goal->>'target'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'timeframe')<>'' then 'Reevaluación: ' || regexp_replace(btrim(goal->>'timeframe'),'[.;[:space:]]+$','','g') end,
   case when btrim(goal->>'monitoring')<>'' then 'Seguimiento: ' || regexp_replace(btrim(goal->>'monitoring'),'[.;[:space:]]+$','','g') end
 ) || case when coalesce(goal->>'outcome','') || coalesce(goal->>'indicator','') || coalesce(goal->>'baseline','') || coalesce(goal->>'target','') || coalesce(goal->>'timeframe','') || coalesce(goal->>'monitoring','') ~ '[^[:space:].;]' then '.' else '' end end
$$;
revoke all on function private.compose_nutrition_objective(jsonb) from public,anon,authenticated,service_role;
-- Deploy Edge @5 and its request-capability support before activation.
do $$
begin
 if not exists(select 1 from private.ai_feature_config where feature='consultation_support'
   and prompt_version='consultation_support@4' and model='gpt-5.6-luna') then raise exception 'Unexpected objectives configuration'; end if;
 update private.ai_feature_config set prompt_version='consultation_support@5',updated_at=now()
   where feature='consultation_support' and prompt_version='consultation_support@4' and model='gpt-5.6-luna';
end $$;
commit;
