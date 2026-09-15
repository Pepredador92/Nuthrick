begin;
-- Align reference objectives with the existing whole-kcal storage column.
create or replace function private.library_reference_macro(t jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare energy numeric; grams numeric; factor numeric; code text; key text; macros jsonb:='{}'; total numeric:=0;
begin
 if jsonb_typeof(t) is distinct from 'object' then raise exception 'La base no tiene objetivos completos' using errcode='23514'; end if;
 foreach key in array array['energy_kcal','protein_g','carbohydrate_g','fat_g'] loop
  if jsonb_typeof(t->key) is distinct from 'number' or (t->>key)::numeric<0 then raise exception 'Objetivos no válidos' using errcode='23514'; end if;
 end loop;
 energy:=round((t->>'energy_kcal')::numeric);
 if energy<=0 or energy>10000 then raise exception 'Objetivo energético no válido' using errcode='23514'; end if;
 foreach code in array array['PROTEIN','CARBOHYDRATE','FAT'] loop
  key:=case code when 'PROTEIN' then 'protein_g' when 'CARBOHYDRATE' then 'carbohydrate_g' else 'fat_g' end;
  factor:=case code when 'FAT' then 9 else 4 end; grams:=(t->>key)::numeric; total:=total+grams*factor;
  macros:=macros||jsonb_build_object(code,jsonb_build_object('code',code,'input_mode','grams','input_value',grams,'grams',grams,'kcal',grams*factor,'percentage',grams*factor/energy*100,'grams_per_kg',null));
 end loop;
 if abs(total-energy)>1 then raise exception 'La energía y los macros de referencia no son coherentes' using errcode='23514'; end if;
 return jsonb_build_object('version',1,'target_energy_kcal',energy,'reference_weight_kg',null,'reference_weight_source','unavailable','reference_weight_override_kg',null,'macros',macros,'totals',jsonb_build_object('percentage',total/energy*100,'kcal',total,'difference_kcal',energy-total),'complete',true,'updated_at',now());
end $$;
revoke all on function private.library_reference_macro(jsonb) from public,anon,authenticated;
create or replace function public.apply_diet_library_with_targets(p_plan_id uuid,p_expected_revision bigint,p_source_id uuid,p_source_revision bigint,p_token uuid,p_content jsonb,p_target_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.nutrition_plans; s public.diet_library_items; b private.diet_library_backups; previous jsonb; target jsonb; macro jsonb;
begin
 if auth.uid() is null or p_target_mode is null or p_target_mode not in ('preserve','reference') then raise exception 'Operación no autorizada' using errcode='42501'; end if;
 select * into p from public.nutrition_plans where id=p_plan_id and professional_id=auth.uid() for update;
 if not found then raise exception 'Plan no disponible' using errcode='42501'; end if;
 select * into b from private.diet_library_backups where token=p_token;
 if found then
  if b.plan_id<>p_plan_id or b.owner_id<>auth.uid() or b.source_id<>p_source_id or b.source_revision is distinct from p_source_revision or b.target_mode<>p_target_mode then raise exception 'Clave de operación no válida' using errcode='23505'; end if;
  return to_jsonb(p);
 end if;
 select * into s from public.diet_library_items where id=p_source_id and (owner_id=auth.uid() or owner_id is null) and not archived for share;
 if not found or s.revision is distinct from p_source_revision then raise exception 'La base cambió' using errcode='40001'; end if;
 previous:=jsonb_build_object('target_calories',p.target_calories,'macro_distribution',p.macro_distribution,'energy_calculation',p.energy_calculation);
 if p_target_mode='reference' then
  target:=s.content->'reference_targets'; macro:=private.library_reference_macro(target);
 end if;
 perform public.apply_diet_library(p_plan_id,p_expected_revision,p_source_id,p_source_revision,p_token,p_content);
 if p_target_mode='reference' then
  update public.nutrition_plans set target_calories=(macro->>'target_energy_kcal')::numeric,macro_distribution=macro,
   energy_calculation=case when energy_calculation is null then null else jsonb_set(energy_calculation,'{prescribed_target_kcal}',macro->'target_energy_kcal') end,
   library_origin=library_origin||jsonb_build_object('target_mode',p_target_mode)
   where id=p_plan_id returning * into p;
 else select * into p from public.nutrition_plans where id=p_plan_id;
 end if;
 update private.diet_library_backups set prior_content=prior_content||previous,applied_revision=p.draft_revision,target_mode=p_target_mode where token=p_token;
 return to_jsonb(p);
end $$;
revoke all on function public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text) from public,anon;
grant execute on function public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text) to authenticated;

commit;
