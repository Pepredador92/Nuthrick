create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon;
create table public.professional_profiles(id uuid primary key);
insert into public.professional_profiles values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
create table public.nutrition_plans(id uuid primary key, professional_id uuid, patient_id uuid, consultation_id uuid, target_calories numeric, macro_distribution jsonb, energy_calculation jsonb, exchange_prescription jsonb, meal_distribution jsonb,diet_menu jsonb,draft_revision bigint default 1,current_version_id uuid);
create function private.test_bump() returns trigger language plpgsql as $$ begin new.draft_revision=old.draft_revision+1; return new; end $$;
create trigger bump before update on public.nutrition_plans for each row execute function private.test_bump();
alter table public.nutrition_plans enable row level security;
create policy own on public.nutrition_plans to authenticated using(professional_id=auth.uid()) with check(professional_id=auth.uid());
grant select on public.nutrition_plans to authenticated;
grant update(target_calories) on public.nutrition_plans to authenticated;
insert into public.nutrition_plans(id,professional_id,target_calories,macro_distribution,energy_calculation,diet_menu) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',2100,'{"new_patient":true}','{"weight":78}','{"old":true}');
-- MIGRATION INSERTION POINT --
insert into public.diet_library_items(id,owner_id,name,content) values
('20000000-0000-0000-0000-000000000000',null,'System','{"schema_version":1,"reference_targets":null,"exchange_groups":[],"distribution":{},"menu":{}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
insert into public.diet_library_items(id,name,content) values('20000000-0000-0000-0000-000000000001','Private','{"schema_version":1,"reference_targets":null,"exchange_groups":[],"distribution":{},"menu":{}}');
do $$ begin
  if (select count(*) from public.diet_library_items)<>2 then raise exception 'own/system visibility'; end if;
  insert into public.diet_library_items(name,content) values('Reviewed substitutes','{"schema_version":1,"reference_targets":null,"exchange_groups":[],"distribution":{},"menu":{"patient_substitutions":{"schema_version":1,"ingredients":{}}}}');
  begin
    insert into public.diet_library_items(name,owner_id,content) values('Forbidden',null,'{}');
    raise exception 'system creation allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.diet_library_items(name,content) values('Forbidden','{"schema_version":1,"reference_targets":null,"exchange_groups":[],"distribution":{},"menu":{"nested":{"patient_id":"private"}}}');
    raise exception 'clinical content accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.diet_library_items)<>1 then raise exception 'cross-owner disclosure'; end if;
  update public.diet_library_items set name='Hacked' where id='20000000-0000-0000-0000-000000000001';
  if found then raise exception 'cross-owner update'; end if;
  begin
    perform public.apply_diet_library('10000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000000',1,'30000000-0000-0000-0000-000000000001','{}');
    raise exception 'cross-owner apply';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare p jsonb; begin
  begin
    perform public.apply_diet_library('10000000-0000-0000-0000-000000000001',null,'20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','{}');
    raise exception 'null revision bypass';
  exception when serialization_failure then null; end;
  p=public.apply_diet_library('10000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','{"exchange_prescription":{},"meal_distribution":{},"diet_menu":{"new":true}}');
  if p->>'target_calories'<>'2100' or p->'macro_distribution'<>'{"new_patient":true}'::jsonb or p->'energy_calculation'<>'{"weight":78}'::jsonb then raise exception 'objectives changed'; end if;
  if p->>'draft_revision'<>'2' then raise exception 'revision not bumped'; end if;
  p=public.apply_diet_library('10000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','{"exchange_prescription":{},"meal_distribution":{},"diet_menu":{}}');
  if p->>'draft_revision'<>'2' then raise exception 'retry changed plan'; end if;
  if public.diet_library_recovery('10000000-0000-0000-0000-000000000001') is null then raise exception 'missing recovery'; end if;
  p=public.restore_diet_library_backup('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',2);
  if p->'diet_menu'<>'{"old":true}'::jsonb or p->'library_origin'<>'null'::jsonb then raise exception 'restore lost prior data'; end if;
  perform public.apply_diet_library('10000000-0000-0000-0000-000000000001',3,'20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000002','{"exchange_prescription":{},"meal_distribution":{},"diet_menu":{}}');
  update public.nutrition_plans set target_calories=2200 where id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.restore_diet_library_backup('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',5);
    raise exception 'restore overwrote later edit';
  exception when serialization_failure then null; end;
end $$;
reset role;
select 'Library RLS, privacy, goals, atomic backup, retry and restore: PASS' as result;
