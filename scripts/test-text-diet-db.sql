do $$
declare owner uuid:='00000000-0000-0000-0000-000000000001'; pid uuid:='30000000-0000-0000-0000-000000000001'; gid uuid; n int; src jsonb; draft jsonb; rev int; applied jsonb; before_plan jsonb; edited text; publication jsonb; key uuid; old_review text;
begin
 perform pg_temp.assert(not has_function_privilege('authenticated','public.ai_text_diet_source(uuid,uuid,integer)','execute'),'text source exposed');
 perform pg_temp.assert(not has_function_privilege('anon','public.ai_text_diet_draft(uuid,text,jsonb)','execute'),'text apply exposed');
 insert into private.ai_accounts(professional_id) values(owner);
 -- Prove the new flow cannot read the catalog, even through inherited service access.
 revoke select on food_items,recipes,recipe_items from service_role;
 foreach n in array array[1,3,7] loop
  select draft_revision::integer,to_jsonb(p) into rev,before_plan from nutrition_plans p where id=pid;
  gid:=gen_random_uuid();key:=gen_random_uuid();
  insert into private.ai_generations(id,professional_id,patient_id,consultation_id,idempotency_key,request_hash,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost)
  values(gid,owner,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005',gen_random_uuid(),repeat('a',64),'diet_draft','openai','mock','diet_draft@4','{}','reserved',0,0,0);
  set local role service_role;
  src:=public.ai_text_diet_source(owner,pid,rev)->'source';
  perform pg_temp.assert(not(src ? 'catalog'),'text generation depends on catalog');
  perform pg_temp.reject(format('select ai_text_diet_source(%L,%L,%s)','00000000-0000-0000-0000-000000000002',pid,rev),'context_unavailable');
  draft:=jsonb_build_object('schema_version',1,'requested_count',n,'diets',(select jsonb_agg(jsonb_build_object('id','diet-'||i,'title','Dieta '||i,'text','Desayuno: texto sintético '||i)) from generate_series(1,n)i),
   'meals','[{"name":"Desayuno","time":"08:00"}]'::jsonb,'reviewed_at',null,
   'prescription',jsonb_build_object('target_calories',before_plan->'target_calories','macro_distribution',before_plan->'macro_distribution'));
  perform public.ai_text_diet_draft(owner,'bind',jsonb_build_object('generationId',gid,'planId',pid,'revision',rev,'stamp',src->>'stamp','snapshot',jsonb_build_object('format','text_diet','payload',jsonb_build_object('diet_count',n),'prescription',draft->'prescription')));
  update private.ai_generations set status='running' where id=gid;
  perform public.ai_text_diet_draft(owner,'result',jsonb_build_object('generationId',gid,'result',jsonb_build_object('textDraft',draft)));
  update private.ai_generations set status='succeeded' where id=gid;
  begin
   update nutrition_plans set target_calories=target_calories+1 where id=pid;
   perform public.ai_text_diet_draft(owner,'apply',jsonb_build_object('generationId',gid,'replaceExisting',true));
   raise exception 'stale context accepted';
  exception when others then if sqlerrm<>'context_changed' then raise;end if;end;
  applied:=public.ai_text_diet_draft(owner,'apply',jsonb_build_object('generationId',gid,'replaceExisting',true));
  perform pg_temp.assert(applied->'plan'->'text_diet'=draft,'generated diet count or content lost');
  perform pg_temp.assert(applied->'plan'->'macro_distribution'=before_plan->'macro_distribution','prescription overwritten');
  perform pg_temp.assert((public.ai_text_diet_draft(owner,'apply',jsonb_build_object('generationId',gid))->>'replay')::boolean,'apply retry not idempotent');
  reset role;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  select draft_revision into rev from nutrition_plans where id=pid;
  set local role authenticated;
  perform pg_temp.reject(format('select publish_nutrition_plan_version(%L,%s,%L)',pid,rev,key),'The plan has unresolved publication errors');
  edited:='Desayuno: texto editado por el profesional, sin el ingrediente original.';
  draft:=jsonb_set(jsonb_set(draft,'{diets,0,text}',to_jsonb(edited)),'{reviewed_at}',to_jsonb(clock_timestamp()::text));
  update nutrition_plans set text_diet=draft where id=pid;
  select draft_revision into rev from nutrition_plans where id=pid;
  publication:=publish_nutrition_plan_version(pid,rev,key);
  perform pg_temp.assert((select snapshot->'text_diet'=draft and snapshot->'calendar'='[]' from nutrition_plan_versions where id=(publication->>'version_id')::uuid),'publication did not preserve exact reviewed text');
  perform pg_temp.assert((publish_nutrition_plan_version(pid,rev,key)->>'reused')::boolean,'publication retry duplicated');
  begin
   update nutrition_plans set target_calories=target_calories+1 where id=pid;
   perform pg_temp.assert((select text_diet->>'reviewed_at' is null from nutrition_plans where id=pid),'new prescription retained approval');
   raise exception 'rollback_verified_change';
  exception when others then if sqlerrm<>'rollback_verified_change' then raise;end if;end;
  update nutrition_plans set text_diet=jsonb_set(text_diet,'{diets,0,text}','"New unreviewed edit"') where id=pid;
  perform pg_temp.assert((select text_diet->>'reviewed_at' is null from nutrition_plans where id=pid),'edit retained approval');
  perform pg_temp.assert((select snapshot->'text_diet'->'diets'->0->>'text'=edited from nutrition_plan_versions where id=(publication->>'version_id')::uuid),'draft edit changed historical publication');
  reset role;
 end loop;
 perform pg_temp.assert((select count(*)=0 from private.ai_credit_ledger),'save or publish charged AI credits');
 perform pg_temp.assert(not private.valid_text_diet(jsonb_set(draft,'{requested_count}','3')),'wrong requested count accepted');
 perform pg_temp.assert(not private.valid_text_diet(jsonb_set(draft,'{diets,0,text}','""')),'blank diet accepted');
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 set local role authenticated;
 perform pg_temp.assert(not exists(select 1 from nutrition_plans where id=pid),'other owner can read draft');
 perform pg_temp.reject(format('select publish_nutrition_plan_version(%L,1,%L)',pid,gen_random_uuid()),'Plan not found or not authorized');
 reset role;
 raise notice 'PASS: 1/3/7 complete diets, no catalog, ownership, reviewed publication, immutable history, supplements, retry and zero extra credits';
end $$;
rollback;
