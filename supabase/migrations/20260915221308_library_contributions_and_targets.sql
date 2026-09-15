begin;
alter table public.diet_library_items add column provenance jsonb;
create table private.diet_library_reviewers (
  user_id uuid primary key references public.professional_profiles(id),
  created_at timestamptz not null default now()
);
alter table private.diet_library_reviewers enable row level security;
revoke all on private.diet_library_reviewers from public,anon,authenticated;
create function public.can_review_diet_library() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from private.diet_library_reviewers where user_id=(select auth.uid()));
$$;
revoke all on function public.can_review_diet_library() from public,anon;
grant execute on function public.can_review_diet_library() to authenticated;

create table public.diet_library_contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.professional_profiles(id),
  source_id uuid not null references public.diet_library_items(id),
  source_revision bigint not null,
  name text not null check(length(trim(name)) between 1 and 120),
  content jsonb not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.professional_profiles(id),
  review_note text,
  published_item_id uuid references public.diet_library_items(id),
  unique(source_id,source_revision)
);
create index library_contributor_status on public.diet_library_contributions(contributor_id,status,created_at desc);
create index library_review_queue on public.diet_library_contributions(status,created_at);
create index library_reviewed_by on public.diet_library_contributions(reviewed_by);
create index library_published_item on public.diet_library_contributions(published_item_id);
alter table public.diet_library_contributions enable row level security;
revoke all on public.diet_library_contributions from public,anon,authenticated;
grant select on public.diet_library_contributions to authenticated;
create policy library_contribution_read on public.diet_library_contributions for select to authenticated
using (contributor_id=(select auth.uid()) or (select public.can_review_diet_library()));

create function public.submit_diet_library(p_source_id uuid,p_revision bigint,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.diet_library_items; result uuid;
begin
 if auth.uid() is null or p_consent is distinct from true then raise exception 'Confirma que puedes compartir este contenido y que no contiene datos personales' using errcode='42501'; end if;
 select * into s from public.diet_library_items where id=p_source_id and owner_id=auth.uid() and not archived for share;
 if not found or s.revision is distinct from p_revision then raise exception 'La base cambió o no está disponible' using errcode='40001'; end if;
 if private.library_has_clinical_fields(s.content) then raise exception 'Revisa los datos personales' using errcode='23514'; end if;
 insert into public.diet_library_contributions(contributor_id,source_id,source_revision,name,content)
 values(auth.uid(),s.id,s.revision,s.name,s.content) on conflict(source_id,source_revision) do nothing returning id into result;
 if result is null then
  select id into result from public.diet_library_contributions where source_id=s.id and source_revision=s.revision and status='pending';
  if result is null then raise exception 'Esta revisión ya fue resuelta. Guarda una nueva revisión antes de volver a enviarla.' using errcode='40001'; end if;
 end if;
 return result;
end $$;
create function public.withdraw_diet_library_contribution(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
 update public.diet_library_contributions set status='withdrawn' where id=p_id and contributor_id=auth.uid() and status='pending';
 if not found then raise exception 'La aportación ya cambió' using errcode='40001'; end if;
end $$;
create function public.review_diet_library_contribution(p_id uuid,p_approve boolean,p_note text,p_reviewed boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.diet_library_contributions; result uuid;
begin
 if not public.can_review_diet_library() or p_reviewed is distinct from true or p_approve is null then raise exception 'Revisión no autorizada o sin confirmar' using errcode='42501'; end if;
 if length(coalesce(p_note,''))>2000 or (not p_approve and length(trim(coalesce(p_note,'')))=0) then raise exception 'Indica el motivo de la devolución' using errcode='23514'; end if;
 select * into c from public.diet_library_contributions where id=p_id for update;
 if not found or c.status<>'pending' then raise exception 'La aportación ya fue revisada' using errcode='40001'; end if;
 if p_approve then
   -- Serialize identical snapshots, including concurrent approvals by different reviewers.
   perform pg_advisory_xact_lock(hashtextextended(c.content::text,0));
   select id into result from public.diet_library_items where owner_id is null and content=c.content and not archived order by created_at limit 1;
   if result is null then
    insert into public.diet_library_items(owner_id,name,content,provenance)
    values(null,c.name,c.content,'{"kind":"community","label":"Aportación de la comunidad revisada"}') returning id into result;
   end if;
 end if;
 update public.diet_library_contributions set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_at=now(),reviewed_by=auth.uid(),review_note=nullif(trim(p_note),''),published_item_id=result where id=c.id;
 return result;
end $$;
revoke all on function public.submit_diet_library(uuid,bigint,boolean),public.withdraw_diet_library_contribution(uuid),public.review_diet_library_contribution(uuid,boolean,text,boolean) from public,anon;
grant execute on function public.submit_diet_library(uuid,bigint,boolean),public.withdraw_diet_library_contribution(uuid),public.review_diet_library_contribution(uuid,boolean,text,boolean) to authenticated;

alter table private.diet_library_backups add column target_mode text not null default 'preserve' check(target_mode in ('preserve','reference'));
create function private.library_reference_macro(t jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare energy numeric; grams numeric; factor numeric; code text; key text; macros jsonb:='{}'; total numeric:=0;
begin
 if jsonb_typeof(t) is distinct from 'object' then raise exception 'La base no tiene objetivos completos' using errcode='23514'; end if;
 foreach key in array array['energy_kcal','protein_g','carbohydrate_g','fat_g'] loop
  if jsonb_typeof(t->key) is distinct from 'number' or (t->>key)::numeric<0 then raise exception 'Objetivos no válidos' using errcode='23514'; end if;
 end loop;
 energy:=(t->>'energy_kcal')::numeric;
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
create function public.apply_diet_library_with_targets(p_plan_id uuid,p_expected_revision bigint,p_source_id uuid,p_source_revision bigint,p_token uuid,p_content jsonb,p_target_mode text) returns jsonb
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
  update public.nutrition_plans set target_calories=(target->>'energy_kcal')::numeric,macro_distribution=macro,
   energy_calculation=case when energy_calculation is null then null else jsonb_set(energy_calculation,'{prescribed_target_kcal}',target->'energy_kcal') end,
   library_origin=library_origin||jsonb_build_object('target_mode',p_target_mode)
   where id=p_plan_id returning * into p;
 else select * into p from public.nutrition_plans where id=p_plan_id;
 end if;
 update private.diet_library_backups set prior_content=prior_content||previous,applied_revision=p.draft_revision,target_mode=p_target_mode where token=p_token;
 return to_jsonb(p);
end $$;
revoke all on function public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text) from public,anon;
grant execute on function public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text) to authenticated;

create or replace function public.restore_diet_library_backup(p_plan_id uuid,p_token uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.nutrition_plans; b private.diet_library_backups;
begin
 select * into p from public.nutrition_plans where id=p_plan_id and professional_id=(select auth.uid()) for update;
 if not found then raise exception 'Plan no disponible' using errcode='42501'; end if;
 select * into b from private.diet_library_backups where token=p_token and plan_id=p.id and owner_id=auth.uid() and not restored for update;
 if not found or p.draft_revision is distinct from p_expected_revision or p.draft_revision is distinct from b.applied_revision then raise exception 'Hay cambios posteriores. No se sobrescribirá tu trabajo.' using errcode='40001'; end if;
 update public.nutrition_plans set exchange_prescription=nullif(b.prior_content->'exchange_prescription','null'::jsonb),meal_distribution=nullif(b.prior_content->'meal_distribution','null'::jsonb),diet_menu=nullif(b.prior_content->'diet_menu','null'::jsonb),library_origin=nullif(b.prior_content->'library_origin','null'::jsonb),
 target_calories=case when b.prior_content ? 'target_calories' then (b.prior_content->>'target_calories')::numeric else target_calories end,
 macro_distribution=case when b.prior_content ? 'macro_distribution' then nullif(b.prior_content->'macro_distribution','null'::jsonb) else macro_distribution end,
 energy_calculation=case when b.prior_content ? 'energy_calculation' then nullif(b.prior_content->'energy_calculation','null'::jsonb) else energy_calculation end
 where id=p.id returning * into p;
 update private.diet_library_backups set restored=true where token=b.token;
 return to_jsonb(p);
end $$;
-- Imported unresolved foods must fail server-side publication as well as frontend review.
-- SQL NULL is not the same as a non-object: use a null-safe snapshot check.
do $upgrade$
declare definition text;
begin
 if to_regprocedure('private.nutrition_plan_publication_errors(public.nutrition_plans)') is not null then
  select pg_get_functiondef('private.nutrition_plan_publication_errors(public.nutrition_plans)'::regprocedure) into definition;
  definition:=replace(definition, $$jsonb_typeof(entry->'food_snapshot') <> 'object'$$, $$jsonb_typeof(entry->'food_snapshot') is distinct from 'object'$$);
  definition:=replace(definition, $$jsonb_typeof(entry->'recipe_snapshot') <> 'object'$$, $$jsonb_typeof(entry->'recipe_snapshot') is distinct from 'object'$$);
  execute definition;
 end if;
end $upgrade$;
commit;
