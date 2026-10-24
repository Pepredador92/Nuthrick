begin;

-- Preserve the current clinical loader, including its history and strategy
-- checks. Only a genuinely unassigned plan takes the new template branch.
do $preserve$
declare original text; copied text;
begin
 original:=pg_get_functiondef('public.ai_text_diet_source(uuid,uuid,integer)'::regprocedure);
 copied:=replace(original,'public.ai_text_diet_source(', 'private.ai_linked_text_diet_source(');
 if copied=original then raise exception 'unexpected_text_diet_source_definition'; end if;
 execute copied;
end $preserve$;
revoke all on function private.ai_linked_text_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.ai_linked_text_diet_source(uuid,uuid,integer) to service_role;

create or replace function public.ai_text_diet_source(p_owner uuid,p_plan uuid,p_revision integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p public.nutrition_plans; source jsonb;
begin
 select * into p from public.nutrition_plans
 where id=p_plan and professional_id=p_owner and status='draft' and deleted_at is null;
 if p.id is null or p.draft_revision is distinct from p_revision then raise exception 'context_unavailable'; end if;
 if p.patient_id is null and p.consultation_id is null then
  source:=jsonb_build_object('plan',to_jsonb(p),'consultation',null,'answers','{}'::jsonb);
  return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),'identifiers','[]'::jsonb);
 end if;
 return private.ai_linked_text_diet_source(p_owner,p_plan,p_revision);
end $$;
revoke all on function public.ai_text_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_text_diet_source(uuid,uuid,integer) to service_role;

-- Library templates carry only the reusable text and schedule. Formula inputs,
-- patient identity, prescription snapshots and approval timestamps stay out.
do $upgrade$
declare original text; amended text;
begin
 original:=pg_get_functiondef('private.guard_diet_library()'::regprocedure);
 amended:=replace(original,
  $$array['schema_version','reference_targets','exchange_groups','distribution','menu','estimation']$$,
  $$array['schema_version','reference_targets','exchange_groups','distribution','menu','estimation','text_diet']$$);
 if amended=original then raise exception 'unexpected_library_guard_definition'; end if;
 original:=amended;
 amended:=replace(amended,$$if tg_op = 'UPDATE' then$$,$guard$
 if new.content ? 'text_diet' then
  if jsonb_typeof(new.content->'text_diet') is distinct from 'object'
   or (new.content->'text_diet') - array['schema_version','requested_count','diets','meals'] <> '{}'::jsonb
   or not private.valid_text_diet((new.content->'text_diet')||jsonb_build_object('reviewed_at',null,'prescription','{}'::jsonb)) then
   raise exception 'Dietas reutilizables no válidas' using errcode='23514';
  end if;
  if exists(select 1 from jsonb_array_elements(new.content#>'{text_diet,diets}') d
    where d - array['id','title','text'] <> '{}'::jsonb)
   or exists(select 1 from jsonb_array_elements(new.content#>'{text_diet,meals}') m
    where m - array['name','time'] <> '{}'::jsonb) then
   raise exception 'La plantilla contiene campos no permitidos' using errcode='23514';
  end if;
 end if;
 if tg_op = 'UPDATE' then$guard$);
 if amended=original then raise exception 'unexpected_library_guard_revision'; end if;
 execute amended;
end $upgrade$;

-- Retain the existing owner, capability, revision, backup and idempotency
-- checks while allowing a draft text copy alongside structured menu copies.
do $upgrade$
declare original text; amended text;
begin
 original:=pg_get_functiondef('public.apply_diet_library(uuid,bigint,uuid,bigint,uuid,jsonb)'::regprocedure);
 amended:=replace(original,
  $$p_content - array['exchange_prescription','meal_distribution','diet_menu']$$,
  $$p_content - array['exchange_prescription','meal_distribution','diet_menu','text_diet']$$);
 if amended=original then raise exception 'unexpected_library_apply_content'; end if;
 original:=amended;
 amended:=replace(amended,$$previous := jsonb_build_object($$,$validation$
 if p_content ? 'text_diet' and p_content->'text_diet'<>'null'::jsonb then
  if not private.valid_text_diet(p_content->'text_diet') or p_content->'text_diet'->>'reviewed_at' is not null then
   raise exception 'La copia de las dietas debe quedar pendiente de revisión' using errcode='23514';
  end if;
 end if;
 previous := jsonb_build_object($validation$);
 if amended=original then raise exception 'unexpected_library_apply_backup'; end if;
 original:=amended;
 amended:=replace(amended,$$'diet_menu',p.diet_menu,'library_origin'$$,$$'diet_menu',p.diet_menu,'text_diet',p.text_diet,'library_origin'$$);
 if amended=original then raise exception 'unexpected_library_apply_snapshot'; end if;
 original:=amended;
 amended:=replace(amended,$$diet_menu=p_content->'diet_menu',$$,$$diet_menu=p_content->'diet_menu',text_diet=nullif(p_content->'text_diet','null'::jsonb),$$);
 if amended=original then raise exception 'unexpected_library_apply_update'; end if;
 execute amended;

 original:=pg_get_functiondef('public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text)'::regprocedure);
 amended:=replace(original,$$update private.diet_library_backups set prior_content=$$,$prescription$
 if p.text_diet is not null then
  update public.nutrition_plans set text_diet=jsonb_set(text_diet,'{prescription}',
   jsonb_build_object('target_calories',target_calories,'macro_distribution',macro_distribution))
  where id=p.id returning * into p;
 end if;
 update private.diet_library_backups set prior_content=$prescription$);
 if amended=original then raise exception 'unexpected_library_target_definition'; end if;
 execute amended;

 original:=pg_get_functiondef('public.restore_diet_library_backup(uuid,uuid,bigint)'::regprocedure);
 amended:=replace(original,$$library_origin=nullif(b.prior_content->'library_origin','null'::jsonb)$$,
  $$text_diet=case when b.prior_content ? 'text_diet' then nullif(b.prior_content->'text_diet','null'::jsonb) else text_diet end,library_origin=nullif(b.prior_content->'library_origin','null'::jsonb)$$);
 if amended=original then raise exception 'unexpected_library_restore_definition'; end if;
 execute amended;
end $upgrade$;

commit;
