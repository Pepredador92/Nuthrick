-- Runs only after the original fixture, in its rollback-only local database.
insert into private.diet_library_reviewers(user_id) values('00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$
declare item uuid; submitted uuid; p jsonb; before_plan jsonb; token uuid:=gen_random_uuid(); rev bigint;
begin
 insert into public.diet_library_items(name,content) values('Shared fixture','{"schema_version":1,"reference_targets":{"energy_kcal":2000,"protein_g":100,"carbohydrate_g":250,"fat_g":66.66666666666667},"exchange_groups":[],"distribution":{},"menu":{}}') returning id into item;
 begin
  perform public.submit_diet_library(item,1,false); raise exception 'consent bypass';
 exception when insufficient_privilege then null; end;
 submitted:=public.submit_diet_library(item,1,true);
 if submitted<>public.submit_diet_library(item,1,true) then raise exception 'submission retry duplicate'; end if;
 begin
  perform public.review_diet_library_contribution(submitted,true,'',true); raise exception 'self-assigned reviewer';
 exception when insufficient_privilege then null; end;
 begin
  update public.diet_library_contributions set status='approved' where id=submitted; raise exception 'direct status write';
 exception when insufficient_privilege then null; end;
 update public.diet_library_items set name='Changed after submission' where id=item;
 if (select name from public.diet_library_contributions where id=submitted)<>'Shared fixture' then raise exception 'snapshot mutated'; end if;
 select to_jsonb(n),draft_revision into before_plan,rev from public.nutrition_plans n where id='10000000-0000-0000-0000-000000000001';
 p:=public.apply_diet_library_with_targets('10000000-0000-0000-0000-000000000001',rev,item,2,token,'{"exchange_prescription":{},"meal_distribution":{},"diet_menu":{}}','reference');
 if p->>'target_calories'<>'2000' or (p#>>'{macro_distribution,macros,PROTEIN,grams}')::numeric<>100 or p->'patient_id' is distinct from before_plan->'patient_id' then raise exception 'reference targets/identity'; end if;
 if p<>public.apply_diet_library_with_targets('10000000-0000-0000-0000-000000000001',rev,item,2,token,'{}','reference') then raise exception 'reference retry changed plan'; end if;
 begin
  perform public.apply_diet_library_with_targets('10000000-0000-0000-0000-000000000001',rev,item,2,token,'{}','preserve'); raise exception 'retry target mode mismatch';
 exception when unique_violation then null; end;
 p:=public.restore_diet_library_backup('10000000-0000-0000-0000-000000000001',token,(p->>'draft_revision')::bigint);
 if p->'target_calories' is distinct from before_plan->'target_calories' or p->'macro_distribution' is distinct from before_plan->'macro_distribution' or p->'energy_calculation' is distinct from before_plan->'energy_calculation' then raise exception 'restore targets failed'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
 if exists(select 1 from public.diet_library_contributions where id=submitted) then raise exception 'pending public leak'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 if not public.can_review_diet_library() then raise exception 'reviewer denied'; end if;
 item:=public.review_diet_library_contribution(submitted,true,'Checked fixture',true);
 if not exists(select 1 from public.diet_library_items where id=item and owner_id is null and name='Shared fixture') then raise exception 'publication snapshot lost'; end if;
 begin
  perform public.review_diet_library_contribution(submitted,true,'',true); raise exception 'double decision';
 exception when serialization_failure then null; end;
end $$;
reset role;
select 'Contribution consent, frozen snapshots, private queue, reviewer access, publication, reference targets and restore: PASS' as result;
