begin;
create role authenticated;
create role anon;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create function private.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create table professional_profiles(id uuid primary key);
insert into professional_profiles values('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002');
-- MIGRATION --
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into supplement_products(owner_id,name,serving_label,energy_kcal,protein_g,carbohydrate_g,fat_g) values(auth.uid(),'Privado','1 cápsula',0,0,0,0);
do $$begin
 if (select count(*) from supplement_products)<>6 then raise exception 'Catalog + own library unavailable';end if;
 update supplement_products set name='Wrong' where owner_id is null;
 if found then raise exception 'Reference label writable';end if;
 begin
  insert into supplement_products(owner_id,name,serving_label,energy_kcal,protein_g,carbohydrate_g,fat_g) values('a1000000-0000-4000-8000-000000000002','Wrong','1',0,0,0,0);
  raise exception 'Cross-owner insert allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into supplement_products(owner_id,name,serving_label,energy_kcal,protein_g,carbohydrate_g,fat_g) values(auth.uid(),'Wrong','1',0,-1,0,0);
  raise exception 'Negative nutrient allowed';
 exception when check_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
do $$begin
 if (select count(*) from supplement_products)<>5 then raise exception 'Private library exposed';end if;
 update supplement_products set name='Wrong' where name='Privado';
 if found then raise exception 'Cross-owner update allowed';end if;
end$$;
reset role;
set local role anon;
do $$begin
 perform count(*) from supplement_products;
 raise exception 'Anonymous access allowed';
exception when insufficient_privilege then null;end$$;
reset role;
rollback;
