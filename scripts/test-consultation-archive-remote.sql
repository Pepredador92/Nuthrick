-- Transaction-only smoke test: only newly created synthetic rows are touched.
begin;
do $$ declare pro uuid; p uuid; c uuid; d uuid; plan_id uuid; begin
 select id into pro from public.professional_profiles order by id limit 1;
 if pro is null then raise exception 'No professional available for isolated fixture'; end if;
 insert into public.patients(professional_id,full_name) values(pro,'Prueba transaccional sin paciente real') returning id into p;
 insert into public.consultations(professional_id,patient_id,status,sequence_number) values(pro,p,'completed',1) returning id into c;
 insert into public.consultations(professional_id,patient_id,status,sequence_number) values(pro,p,'draft',2) returning id into d;
 insert into public.patient_measurements(professional_id,patient_id,consultation_id,weight_kg,height_cm) values(pro,p,c,72,170);
 insert into public.nutrition_plans(professional_id,patient_id,consultation_id,title) values(pro,p,c,'Prueba transaccional') returning id into plan_id;
 insert into public.nutrition_plan_versions(plan_id,professional_id,patient_id,consultation_id,version_number,draft_revision,snapshot_schema_version,validation_rules_version,content_hash,idempotency_key,snapshot,published_by)
 values(plan_id,pro,p,c,1,1,1,'fixture',repeat('0',64),gen_random_uuid(),'{"fixture":true}',pro);
 perform set_config('qa.archive_owner',pro::text,true);
 perform set_config('qa.archive_patient',p::text,true);
 perform set_config('qa.archive_completed',c::text,true);
 perform set_config('qa.archive_draft',d::text,true);
 perform set_config('request.jwt.claim.sub',pro::text,true);
end $$;
set local role authenticated;
do $$ declare c uuid:=current_setting('qa.archive_completed')::uuid; d uuid:=current_setting('qa.archive_draft')::uuid; begin
 perform public.delete_consultation_record(c);
 perform public.delete_consultation_record(c);
 perform public.delete_consultation_record(d);
 if exists(select 1 from public.consultations where patient_id=current_setting('qa.archive_patient')::uuid and deleted_at is null) then raise exception 'Consultations still active'; end if;
 if (select count(*) from public.patient_measurements where consultation_id=c)<>1 then raise exception 'Measurement lost or detached'; end if;
 if (select count(*) from public.nutrition_plan_versions where consultation_id=c)<>1 then raise exception 'Published snapshot lost or detached'; end if;
 begin
  perform public.reopen_consultation_for_edit(c);
  raise exception 'Archived consultation reopened';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.delete_consultation_record(c);
  raise exception 'Foreign owner allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 insert into public.consultations(professional_id,patient_id,status,sequence_number)
 values(current_setting('qa.archive_owner')::uuid,current_setting('qa.archive_patient')::uuid,'draft',3);
end $$;
rollback;
select 'Remote archive smoke test passed; all synthetic data rolled back' as result;
