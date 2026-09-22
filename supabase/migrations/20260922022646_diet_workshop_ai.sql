-- Disabled until an operator configures provider, rates and credits. No new
-- proposal table: signed, expiring previews live only in the professional UI.
update private.ai_feature_config set prompt_version='diet_workshop@1',enabled=false,
 max_input_tokens=24000,max_output_tokens=1024 where feature='diet_workshop';
alter table private.ai_generations add column workshop_plan_id uuid,
 add column workshop_revision integer, add column workshop_decision text
 check(workshop_decision in ('accepted','discarded')),add column workshop_decided_at timestamptz;
grant select on public.nutrition_plans,public.food_items,public.recipes,public.recipe_items to service_role;

create function public.ai_workshop_source(p_owner uuid,p_plan uuid,p_revision integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare plan public.nutrition_plans; patient public.patients; snap public.consultation_snapshots;
 goal jsonb; facts jsonb; foods jsonb; recipes jsonb; pes text; stamp text;
begin
 select * into plan from public.nutrition_plans where id=p_plan and professional_id=p_owner and status='draft';
 if plan.id is null or plan.draft_revision<>p_revision then raise exception 'context_unavailable'; end if;
 if plan.patient_id is not null then
   select * into patient from public.patients where id=plan.patient_id and professional_id=p_owner and deleted_at is null and status<>'archived';
   if patient.id is null or plan.consultation_id is null or not exists(select 1 from public.consultations where id=plan.consultation_id and patient_id=patient.id and professional_id=p_owner and deleted_at is null and status in ('draft','completed')) then raise exception 'context_unavailable'; end if;
   select * into snap from public.consultation_snapshots where consultation_id=plan.consultation_id and patient_id=patient.id and professional_id=p_owner order by revision desc limit 1;
   select to_jsonb(g) into goal from private.portal_goals(patient.id,p_owner) g order by date desc,"consultationId" desc limit 1;
   -- Only approved persisted PES, never an unfinished generation or unsaved text.
   if snap.clinical_records->'pes'->>'approved_at' is not null then
     select value#>>'{}' into pes from public.consultation_answers where consultation_id=plan.consultation_id and professional_id=p_owner and revision=snap.revision and question_key='pes_statement';
   end if;
 end if;
 select coalesce(jsonb_object_agg(question_key,value),'{}') into facts from (
   select question_key,value from public.consultation_answers where consultation_id=plan.consultation_id and professional_id=p_owner and revision=snap.revision
   and question_key in ('main_reason','usual_pattern','daily_schedule','food_reactions_status','food_reactions_v2','access_barriers','food_preferences','medical_diagnoses_v2','barriers','adjustments','eating_preferences','cooking_time','food_equipment')
   and value not in ('null','""','[]','{}') order by question_key limit 16
 ) a;
 -- Bounded retrieval per actual exchange group; preferences win before common
 -- Mexican starter foods. No user SQL, provider IDs or unbounded catalog export.
 select coalesce(jsonb_agg(to_jsonb(f)-'rn'),'[]') into foods from (
   select f.*,row_number() over(partition by group_code order by
    case plan.diet_menu->'food_preferences'->>f.id::text when 'like' then 0 when 'avoid' then 3 else 1 end,
    case when catalog_code='NUTHRICK_MX_STARTER' then 0 when source like '%NUTHRICK%' then 1 else 2 end,normalized_name,id) rn
   from public.food_items f where active and (owner_id is null or owner_id=p_owner) and portion_amount>0
   and coalesce(plan.diet_menu->'food_preferences'->>f.id::text,'')<>'exclude'
 ) f where rn<=6;
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by display_order,id) from public.recipe_items i where i.recipe_id=r.id))),'[]') into recipes from (
  select r.* from public.recipes r where active and (owner_id is null or owner_id=p_owner)
   and exists(select 1 from public.recipe_items i where i.recipe_id=r.id)
   and not exists(select 1 from public.recipe_items i left join public.food_items f on f.id=i.food_item_id
    where i.recipe_id=r.id and (f.id is null or not f.active or (f.owner_id is not null and f.owner_id<>p_owner)
      or coalesce(plan.diet_menu->'food_preferences'->>f.id::text,'')='exclude'))
  order by (owner_id=p_owner) desc nulls last, (source like 'NUTHRICK%') desc,name,id limit 24
 ) r;
 -- Internal fingerprint includes current sources and candidates, never logged or
 -- sent to the provider. Applying re-reads it to reject stale clinical context.
 stamp:=md5(concat_ws('|',plan.updated_at,plan.draft_revision,snap.id,snap.revision,snap.clinical_records::text,goal::text,facts::text,foods::text,recipes::text,
  (select string_agg(updated_at::text,',' order by id) from public.consultation_measurements where consultation_id=plan.consultation_id),
  (select string_agg(updated_at::text,',' order by id) from public.laboratory_results where consultation_id=plan.consultation_id),
  (select string_agg(updated_at::text,',' order by id) from public.consultation_calculation_results where consultation_id=plan.consultation_id)));
 return jsonb_build_object('plan',to_jsonb(plan),'stamp',stamp,'goal',goal->>'content','approvedPes',pes,
  'identifiers',jsonb_build_array(patient.full_name,patient.email,patient.phone),
  'facts',facts,'recall',case when snap.clinical_records->'recall'->>'approved_at' is not null then
   (select jsonb_agg(jsonb_build_object('meal',i->>'mealLabel','food',i->'food'->>'name','quantity',i->'quantity','unit',i->>'unit')) from jsonb_array_elements(snap.clinical_records->'recall'->'items') i) else null end,
  'anthropometry',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select measurement_type_id,value,unit from public.consultation_measurements where consultation_id=plan.consultation_id and professional_id=p_owner order by measurement_type_id limit 12) m),
  'composition',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select result_key,method_name,method_version,displayed_result,unit from public.consultation_calculation_results r where consultation_id=plan.consultation_id and professional_id=p_owner
    and not exists(select 1 from public.consultation_measurements newer where newer.consultation_id=plan.consultation_id and newer.updated_at>r.calculated_at) order by result_key limit 8) m),
  'labs',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from (select analyte_name_snapshot,numeric_value,text_value,unit from public.laboratory_results where consultation_id=plan.consultation_id and professional_id=p_owner order by analyte_name_snapshot limit 10) l),
  'foods',foods,'recipes',recipes);
end $$;
revoke all on function public.ai_workshop_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_workshop_source(uuid,uuid,integer) to service_role;

create function private.ai_workshop_status(p_plan uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.nutrition_plans;
begin
 select * into p from public.nutrition_plans where id=p_plan and professional_id=(select auth.uid()) and status<>'archived';
 if p.id is null then raise exception 'context_unavailable'; end if;
 return jsonb_build_object('enabled',p.status='draft' and (select enabled from private.ai_feature_config where feature='diet_workshop'));
end $$;
revoke all on function private.ai_workshop_status(uuid) from public,anon;
grant execute on function private.ai_workshop_status(uuid) to authenticated;
create function public.ai_workshop_status(p_plan uuid) returns jsonb language sql security invoker set search_path='' as $$select private.ai_workshop_status(p_plan)$$;
revoke all on function public.ai_workshop_status(uuid) from public,anon;
grant execute on function public.ai_workshop_status(uuid) to authenticated;

-- Trusted server passes only a verified signed preview. Locks and a single
 -- UPDATE prevent half-applied plans; no publication or portal write occurs.
create function public.ai_workshop_decision(p_owner uuid,p_plan uuid,p_revision integer,p_generation uuid,p_stamp text,p_decision text,p_patch jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.nutrition_plans; g private.ai_generations; source jsonb;
begin
 select * into p from public.nutrition_plans where id=p_plan and professional_id=p_owner for update;
 select * into g from private.ai_generations where id=p_generation and professional_id=p_owner and feature='diet_workshop' for update;
 if p.id is null or g.id is null or g.status<>'succeeded' or g.workshop_plan_id is distinct from p_plan then raise exception 'context_unavailable'; end if;
 if g.workshop_decision=p_decision then return jsonb_build_object('ok',true,'plan',to_jsonb(p)); end if;
 if g.workshop_decision is not null or p_decision not in ('accepted','discarded') then raise exception 'invalid_request'; end if;
 if p_decision='accepted' then
   source:=public.ai_workshop_source(p_owner,p_plan,p_revision);
   if source->>'stamp' is distinct from p_stamp or g.workshop_revision<>p_revision then raise exception 'context_changed'; end if;
   if jsonb_typeof(p_patch->'exchange_prescription')<>'object' or jsonb_typeof(p_patch->'meal_distribution')<>'object' or jsonb_typeof(p_patch->'diet_menu')<>'object' then raise exception 'invalid_request'; end if;
   update public.nutrition_plans set exchange_prescription=p_patch->'exchange_prescription',meal_distribution=p_patch->'meal_distribution',diet_menu=p_patch->'diet_menu',status='draft'
     where id=p.id returning * into p;
 end if;
 update private.ai_generations set workshop_decision=p_decision,workshop_decided_at=now() where id=g.id;
 return jsonb_build_object('ok',true,'plan',to_jsonb(p));
end $$;
revoke all on function public.ai_workshop_decision(uuid,uuid,integer,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_workshop_decision(uuid,uuid,integer,uuid,text,text,jsonb) to service_role;
grant update on public.nutrition_plans to service_role;
create function public.ai_workshop_bind(p_owner uuid,p_generation uuid,p_plan uuid,p_revision integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update private.ai_generations g set workshop_plan_id=p_plan,workshop_revision=p_revision
 from public.nutrition_plans p where g.id=p_generation and g.professional_id=p_owner and g.feature='diet_workshop'
 and g.status='reserved' and p.id=p_plan and p.professional_id=p_owner and p.draft_revision=p_revision
 and g.patient_id is not distinct from p.patient_id and g.consultation_id is not distinct from p.consultation_id;
 if not found then raise exception 'context_unavailable'; end if;
end $$;
revoke all on function public.ai_workshop_bind(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_workshop_bind(uuid,uuid,uuid,integer) to service_role;
