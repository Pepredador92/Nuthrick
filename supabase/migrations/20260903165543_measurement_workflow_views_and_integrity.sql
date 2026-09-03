-- Tighten calculation snapshots and expose the latest revision of each consultation as typed read models.
create function private.validate_calculation_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare w jsonb; r jsonb; d public.calculation_definitions; dep text; i jsonb; ids text[]; p public.patients; c public.consultations; expected_age integer;
begin
 w:=new.payload->'workflow';
 if w is null then return new; end if;
 select * into p from public.patients where id=new.patient_id;
 select * into c from public.consultations where id=new.consultation_id;
 expected_age:=extract(year from age((c.consultation_date at time zone p.timezone)::date,p.birth_date));
 if w->'context'->>'birthDate' is distinct from p.birth_date::text or w->'context'->>'sex' is distinct from coalesce(p.equation_sex,'')
    or (w->'context'->>'age')::integer is distinct from expected_age then raise exception 'Patient calculation context changed. Reload before saving.'; end if;
 select coalesce(array_agg(value->>'id'),array[]::text[]) into ids from jsonb_each(w->'entries');
 ids:=ids || (select coalesce(array_agg(value->>'calculation_id'),array[]::text[]) from jsonb_array_elements(w->'calculations'));
 for r in select value from jsonb_array_elements(w->'calculations') loop
  if jsonb_typeof(r->'dependency_ids') is distinct from 'array' or jsonb_typeof(r->'inputs_json') is distinct from 'object'
    or jsonb_typeof(r->'formula_metadata') is distinct from 'object' then raise exception 'Invalid calculation metadata'; end if;
  select * into d from public.calculation_definitions where code=r->'formula_metadata'->'definition'->>'code'
   and method_version=r->>'methodVersion';
  if not found or d.definition is distinct from r->'formula_metadata'->'definition' then raise exception 'Calculation definition unavailable'; end if;
  for dep in select jsonb_array_elements_text(r->'dependency_ids') loop
    if not(dep=any(ids)) then raise exception 'Calculation dependency missing'; end if;
  end loop;
  for i in select value from jsonb_each(r->'inputs_json') loop
    if i->>'measurement_id' is not null and not((i->>'measurement_id')=any(ids)) then raise exception 'Input measurement missing'; end if;
    if i->>'calculation_id' is not null and not((i->>'calculation_id')=any(ids)) then raise exception 'Input calculation missing'; end if;
  end loop;
 end loop;
 return new;
end;
$$;
revoke all on function private.validate_calculation_snapshot() from public,anon;
grant execute on function private.validate_calculation_snapshot() to authenticated;
create trigger measurement_calculation_integrity before insert on public.consultation_anthropometry
 for each row execute function private.validate_calculation_snapshot();

drop view public.registered_measurements;
drop view public.calculated_measurements;
create view public.registered_measurements with(security_invoker=true) as
 with latest as (
  select a.*,max(revision) over(partition by consultation_id) max_revision from public.consultation_anthropometry a
 )
 select a.id as revision_id,a.professional_id,a.patient_id,a.consultation_id,a.revision,
 e.value->>'id' as id,e.value->>'measurement_type_id' as measurement_type_id,e.value->>'code' as code,e.value->>'name' as name,
 (e.value->>'value')::numeric as value,e.value->>'unit' as unit,e.value->>'source_type' as source_type,
 nullif(e.value->>'device_id','')::uuid as device_id,(e.value->>'measured_at')::timestamptz as measured_at,
 (e.value->>'created_at')::timestamptz as created_at,nullif(e.value->>'created_by','')::uuid as created_by,
 e.value->>'notes' as notes,e.value->>'protocol' as protocol,nullif(e.value->>'reused_from_id','') as reused_from_id,
 nullif(e.value->>'original_measured_at','')::timestamptz as original_measured_at,e.value as measurement
 from latest a cross join lateral jsonb_each(a.payload->'workflow'->'entries') e where a.revision=a.max_revision;
create view public.calculated_measurements with(security_invoker=true) as
 with latest as (
  select a.*,max(revision) over(partition by consultation_id) max_revision from public.consultation_anthropometry a
 )
 select a.id as revision_id,a.professional_id,a.patient_id,a.consultation_id,a.revision,
 r.value->>'calculation_id' as id,r.value->>'calculation_code' as calculation_code,r.value->>'label' as name,
 r.value->>'method' as method,r.value->>'methodVersion' as method_version,
 (r.value->>'raw_value')::numeric as raw_value,(r.value->>'display_value')::numeric as display_value,
 r.value->>'unit' as unit,r.value->>'classification' as classification,r.value->>'reference_id' as reference_id,
 r.value->>'reference_version' as reference_version,r.value->'inputs_json' as inputs_json,
 r.value->'dependency_ids' as dependency_ids,r.value->'formula_metadata' as formula_metadata,
 (r.value->>'calculated_at')::timestamptz as calculated_at,nullif(r.value->>'recalculated_at','')::timestamptz as recalculated_at,
 r.value as result
 from latest a cross join lateral jsonb_array_elements(a.payload->'workflow'->'calculations') r where a.revision=a.max_revision;
revoke all on public.registered_measurements,public.calculated_measurements from public,anon,authenticated;
grant select on public.registered_measurements,public.calculated_measurements to authenticated;
