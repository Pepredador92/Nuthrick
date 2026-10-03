-- All writes are synthetic fixtures inside a rolled-back transaction.
begin;
do $$
declare pro uuid; patient uuid; visit uuid;
begin
  select id into pro from public.professional_profiles
    where private.can_use_feature(id, 'consultations') and private.can_use_feature(id, 'patients')
      and not coalesce((private.resolve_effective_entitlements(id)->>'read_only')::boolean, true)
    order by id limit 1;
  if pro is null then raise exception 'No eligible professional for isolated fixture'; end if;
  insert into public.patients(professional_id, full_name)
    values (pro, 'Prueba transaccional de nombres') returning id into patient;
  insert into public.consultations(professional_id, patient_id, consultation_type, status, sequence_number, summary)
    values (pro, patient, 'follow_up', 'completed', 0, 'Resumen sintético conservado') returning id into visit;
  perform set_config('qa.names_owner', pro::text, true);
  perform set_config('qa.names_patient', patient::text, true);
  perform set_config('qa.names_visit', visit::text, true);
  perform set_config('request.jwt.claim.sub', pro::text, true);
  if has_function_privilege('anon', 'public.rename_consultation(uuid,text,text)', 'execute')
    or has_function_privilege('anon', 'private.rename_consultation(uuid,text,text)', 'execute') then
    raise exception 'Anonymous access was granted';
  end if;
end $$;
set local role authenticated;
do $$
declare visit uuid := current_setting('qa.names_visit')::uuid;
  before_row jsonb; after_row jsonb; renamed public.consultations;
begin
  select to_jsonb(c) - 'display_name' - 'updated_at' into before_row from public.consultations c where id = visit;
  select * into renamed from public.rename_consultation(visit, '  Seguimiento personalizado  ', null);
  if renamed.display_name <> 'Seguimiento personalizado' or renamed.status <> 'completed' then raise exception 'Name or status incorrect'; end if;
  select to_jsonb(c) - 'display_name' - 'updated_at' into after_row from public.consultations c where id = visit;
  if before_row is distinct from after_row then raise exception 'Clinical record changed while renaming'; end if;
  begin
    perform public.rename_consultation(visit, 'Stale write', null);
    raise exception 'Stale name overwrite allowed';
  exception when serialization_failure then null; end;
  begin
    perform public.rename_consultation(visit, repeat('x',121), 'Seguimiento personalizado');
    raise exception 'Oversized name allowed';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.rename_consultation(visit, 'Foreign owner', 'Seguimiento personalizado');
    raise exception 'Foreign owner allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.rename_consultation(visit, 'Missing identity', 'Seguimiento personalizado');
    raise exception 'Missing identity allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', current_setting('qa.names_owner'), true);
  select * into renamed from public.rename_consultation(visit, '  ', 'Seguimiento personalizado');
  if renamed.display_name is not null then raise exception 'Automatic name not restored'; end if;
  perform public.delete_consultation_record(visit);
  begin
    perform public.rename_consultation(visit, 'Archived record', null);
    raise exception 'Archived record allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Consultation name checks passed; all synthetic data rolled back' as result;
