-- Local only. Every mutation is rolled back; no model/provider calls.
begin;
do $$
declare owner_id uuid := '88888888-1111-4111-8111-111111111111';
 p public.nutrition_plans; before_source jsonb; after_source jsonb;
begin
 select * into p from public.nutrition_plans where professional_id=owner_id and status='draft' order by created_at desc limit 1;
 if p.id is null then raise exception 'Run local synthetic diet harness first'; end if;
 before_source := public.ai_diet_source(owner_id,p.id,p.draft_revision::integer);
 update public.consultation_snapshots set clinical_records=clinical_records || jsonb_build_object('recall',jsonb_build_object(
   'approved_at',now(),'narrative','PRIVATE NARRATIVE','items',jsonb_build_array(jsonb_build_object(
   'mealLabel','Desayuno','quantity',2,'unit','tortilla','rawText','PRIVATE RAW',
   'food',jsonb_build_object('id',gen_random_uuid(),'name','Tortilla','portion_amount',1,'portion_unit','tortilla','group_code','CEREALS_NO_FAT')))))
 where consultation_id=p.consultation_id and professional_id=owner_id;
 insert into public.consultation_measurements(professional_id,patient_id,consultation_id,measurement_type_id,value,unit,data_type)
 values(owner_id,p.patient_id,p.consultation_id,'weight','70','kg','number')
 on conflict(professional_id,consultation_id,measurement_type_id) where device_session_id is null do update set value='70';
 after_source := public.ai_diet_source(owner_id,p.id,p.draft_revision::integer);
 if after_source#>>'{source,anthropometry,weightKg}' <> '70' then raise exception 'weight missing'; end if;
 if after_source#>>'{source,confirmedRecall,items,0,food,name}' <> 'Tortilla' then raise exception 'confirmed recall missing'; end if;
 if (after_source#>'{source,confirmedRecall}')::text ~ 'PRIVATE|rawText|narrative|"id"' then raise exception 'recall leak'; end if;
 if after_source#>>'{source,stamp}' = before_source#>>'{source,stamp}' then raise exception 'stale fingerprint'; end if;
 update public.consultation_snapshots set clinical_records=jsonb_set(clinical_records,'{recall,approved_at}','null')
 where consultation_id=p.consultation_id and professional_id=owner_id;
 if (public.ai_diet_source(owner_id,p.id,p.draft_revision::integer)->'source') ? 'confirmedRecall' then raise exception 'draft recall leak'; end if;
 if has_function_privilege('authenticated','public.ai_diet_source(uuid,uuid,integer)','execute')
   or has_function_privilege('anon','public.ai_diet_source(uuid,uuid,integer)','execute') then raise exception 'privilege leak'; end if;
 begin
   perform public.ai_diet_source(gen_random_uuid(),p.id,p.draft_revision::integer);
   raise exception 'foreign owner accepted';
 exception when others then if sqlerrm <> 'context_unavailable' then raise; end if; end;
 raise notice '4E SQL: 7 assertions passed, transaction rolled back';
end $$;
rollback;
