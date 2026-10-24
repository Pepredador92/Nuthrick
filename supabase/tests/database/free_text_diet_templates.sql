-- Run against an isolated database with the application schema. No AI requests.
begin;
insert into auth.users(id,email) values
 ('f1000000-0000-4000-8000-000000000001','free-plan-owner@nuthrick.test'),
 ('f2000000-0000-4000-8000-000000000002','free-plan-other@nuthrick.test');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
insert into public.nutrition_plans(id,professional_id,title,target_calories,macro_distribution)
values ('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','Plan libre',1800,
 private.library_reference_macro('{"energy_kcal":1800,"protein_g":90,"carbohydrate_g":225,"fat_g":60}'));

do $checks$
declare loaded jsonb; stamp text;
begin
 loaded:=public.ai_text_diet_source('f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003',1);
 assert loaded#>'{source,consultation}'='null'::jsonb,'free plans have no fabricated consultation';
 assert loaded#>'{source,answers}'='{}'::jsonb and loaded->'identifiers'='[]'::jsonb,'no patient context is loaded';
 assert loaded#>>'{source,plan,target_calories}'='1800','the stored prescription is retained';
 stamp:=loaded#>>'{source,stamp}';assert length(stamp)>0,'a free plan still has a snapshot fingerprint';
 begin
  perform public.ai_text_diet_source('f2000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000003',1);
  raise exception 'foreign plan was accepted';
 exception when raise_exception then assert sqlerrm='context_unavailable'; end;
 begin
  perform public.ai_text_diet_source('f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000003',2);
  raise exception 'stale revision was accepted';
 exception when raise_exception then assert sqlerrm='context_unavailable'; end;
 assert not has_function_privilege('authenticated','public.ai_text_diet_source(uuid,uuid,integer)','execute'),'the trusted source is not callable by clients';
 assert has_function_privilege('service_role','public.ai_text_diet_source(uuid,uuid,integer)','execute');
end $checks$;

insert into public.diet_library_items(id,name,content) values
 ('f4000000-0000-4000-8000-000000000004','Dietas reutilizables',
 '{"schema_version":1,"reference_targets":{"energy_kcal":1800,"protein_g":90,"carbohydrate_g":225,"fat_g":60},"exchange_groups":[],"distribution":{},"menu":{},"text_diet":{"schema_version":1,"requested_count":1,"diets":[{"id":"diet-1","title":"Dieta 1","text":"Texto completo reutilizable"}],"meals":[{"name":"Comida","time":"14:00"}]}}');

do $checks$
declare content jsonb; p public.nutrition_plans; result jsonb; template jsonb; token uuid:='f5000000-0000-4000-8000-000000000005'; rev bigint;
begin
 select l.content into content from public.diet_library_items l where id='f4000000-0000-4000-8000-000000000004';
 begin
  insert into public.diet_library_items(name,content) values('Datos no reutilizables',jsonb_set(content,'{text_diet,patient_id}','"sensitive"'));
  raise exception 'clinical metadata was accepted';
 exception when check_violation then null; end;
 select * into p from public.nutrition_plans where id='f3000000-0000-4000-8000-000000000003';
 template:=content->'text_diet'||jsonb_build_object('reviewed_at',null,'prescription',jsonb_build_object('target_calories',p.target_calories,'macro_distribution',p.macro_distribution));
 update public.nutrition_plans set text_diet=jsonb_set(template,'{diets,0,text}','"Texto anterior"') where id=p.id returning * into p;
 result:=public.apply_diet_library_with_targets(p.id,p.draft_revision,'f4000000-0000-4000-8000-000000000004',1,token,
  jsonb_build_object('exchange_prescription','{}'::jsonb,'meal_distribution','{}'::jsonb,'diet_menu','{}'::jsonb,'text_diet',template),'preserve');
 assert result#>>'{text_diet,diets,0,text}'='Texto completo reutilizable','copy preserves complete text';
 assert result#>'{text_diet,reviewed_at}'='null'::jsonb,'a copied plan needs its own review';
 assert result->'patient_id'='null'::jsonb and result->'consultation_id'='null'::jsonb,'library does not assign patient context';
 assert result#>'{text_diet,prescription,macro_distribution}'=result->'macro_distribution','copy uses the actual stored prescription';
 rev:=(result->>'draft_revision')::bigint;
 result:=public.apply_diet_library_with_targets(p.id,p.draft_revision,'f4000000-0000-4000-8000-000000000004',1,token,
  jsonb_build_object('exchange_prescription','{}'::jsonb,'meal_distribution','{}'::jsonb,'diet_menu','{}'::jsonb,'text_diet',template),'preserve');
 assert (result->>'draft_revision')::bigint=rev,'retry does not apply or revise twice';
 result:=public.restore_diet_library_backup(p.id,token,rev);
 assert result#>>'{text_diet,diets,0,text}'='Texto anterior','restore includes the previous narrative diet';
 update public.nutrition_plans set target_calories=2000,
  macro_distribution=private.library_reference_macro('{"energy_kcal":2000,"protein_g":100,"carbohydrate_g":250,"fat_g":66.6666666667}')
  where id=p.id returning * into p;
 token:=gen_random_uuid();
 result:=public.apply_diet_library_with_targets(p.id,p.draft_revision,'f4000000-0000-4000-8000-000000000004',1,token,
  jsonb_build_object('exchange_prescription','{}'::jsonb,'meal_distribution','{}'::jsonb,'diet_menu','{}'::jsonb,'text_diet',template),'reference');
 assert result->>'target_calories'='1800','the template can load its own reference targets';
 assert result#>'{text_diet,prescription,macro_distribution}'=result->'macro_distribution','reference mode binds to the canonical stored macros';
 result:=public.restore_diet_library_backup(p.id,token,(result->>'draft_revision')::bigint);
 assert result->>'target_calories'='2000','recovery also restores the former targets';
 perform set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
 begin
  perform public.apply_diet_library_with_targets(p.id,(result->>'draft_revision')::bigint,'f4000000-0000-4000-8000-000000000004',1,gen_random_uuid(),
   jsonb_build_object('exchange_prescription','{}'::jsonb,'meal_distribution','{}'::jsonb,'diet_menu','{}'::jsonb,'text_diet',template),'preserve');
  raise exception 'foreign owner was accepted';
 exception when insufficient_privilege then null; end;
end $checks$;
rollback;
