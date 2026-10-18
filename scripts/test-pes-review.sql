do $$
declare pro uuid:=gen_random_uuid(); pat uuid:=gen_random_uuid(); current_visit uuid:=gen_random_uuid(); prior_visit uuid:=gen_random_uuid();
 source jsonb; before_stamp text; payload jsonb; result jsonb; rejected boolean;
begin
 insert into public.professional_profiles values(pro);
 perform set_config('request.jwt.claim.sub',pro::text,true);
 insert into public.patients(id,professional_id,full_name,weight_kg,height_cm,birth_date,equation_sex)
   values(pat,pro,'SYNTHETIC PES context',85,170,'1990-01-01','male');
 insert into public.consultations(id,professional_id,patient_id,consultation_date,sequence_number,status)
   values(prior_visit,pro,pat,'2026-09-01',1,'completed'),(current_visit,pro,pat,'2026-10-18',2,'draft');
 insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
   values(pro,pat,current_visit,1,'Synthetic',1,'{"sections":[{"questions":[{"question_key":"pes_statement"}]}]}');
 insert into public.measurement_types(id,code,display_name,name)
   values('fat','body_fat_percentage_device','Grasa (%)','Grasa (%)'),('muscle','skeletal_muscle_mass_device','Masa músculo esquelética','Masa músculo esquelética');
 insert into public.consultation_measurements(professional_id,patient_id,consultation_id,measurement_type_id,value,unit,data_type,measured_at)
   values(pro,pat,prior_visit,'fat','32','%','percentage','2026-09-01'),(pro,pat,current_visit,'fat','30','%','percentage','2026-10-18'),
     (pro,pat,prior_visit,'muscle','28','kg','number','2026-09-01');
 source:=public.ai_clinical_source(pro,pat,current_visit,1);
 if not exists(select 1 from jsonb_array_elements(source->'facts') f where f->>'metric_code'='body_fat_percentage_device' and f->>'source' like 'Historial%') then raise exception 'Historical fat omitted'; end if;
 if not exists(select 1 from jsonb_array_elements(source->'facts') f where f->>'metric_code'='skeletal_muscle_mass_device') then raise exception 'Historical muscle omitted'; end if;
 if (select count(*) from jsonb_array_elements(source->'facts') f where f->>'origin'='baseline')<>4 then raise exception 'Baseline context incomplete'; end if;
 if source->'facts' @> '[{"finding":"1990-01-01"}]' or (source->'facts')::text like '%SYNTHETIC PES context%' then raise exception 'Identity leaked into facts'; end if;
 if not exists(select 1 from jsonb_array_elements(source->'facts') f where f->>'metric_code'='weight' and f->>'finding' like '%fecha de medición no registrada%') then raise exception 'Undated baseline treated as current'; end if;
 before_stamp:=source->>'stamp';
 update public.patients set weight_kg=84,updated_at=clock_timestamp() where id=pat;
 source:=public.ai_clinical_source(pro,pat,current_visit,1);
 if before_stamp=source->>'stamp' then raise exception 'Baseline edit failed to invalidate context'; end if;
 rejected:=false;
 begin perform public.ai_clinical_source(gen_random_uuid(),pat,current_visit,1); exception when others then if sqlerrm='context_unavailable' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'Foreign owner accepted'; end if;
 if has_function_privilege('authenticated','private.ai_clinical_source_v4(uuid,uuid,uuid,integer)','execute')
   or has_function_privilege('anon','public.ai_clinical_source(uuid,uuid,uuid,integer)','execute')
   or has_function_privilege('authenticated','private.clinical_workspace_v4(uuid,integer,text,jsonb,uuid)','execute') then raise exception 'Validation bypass exposed'; end if;
 payload:=jsonb_build_object('stamp',source->>'stamp','problem','Problema registrado','etiology','Causa registrada',
   'signsSymptoms',jsonb_build_array('Dato registrado'),'pesStatement','Texto incoherente','evidenceReviewed',true);
 rejected:=false;
 begin perform public.clinical_workspace(current_visit,1,'pes',payload); exception when others then if sqlerrm='pes_statement_mismatch' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'Inconsistent PES approved'; end if;
 payload:=payload || jsonb_build_object('pesStatement','Problema registrado relacionado con Causa registrada, evidenciado por Dato registrado.','evidenceReviewed',false);
 rejected:=false;
 begin perform public.clinical_workspace(current_visit,1,'pes',payload); exception when others then if sqlerrm='pes_evidence_review_required' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'PES approved without review'; end if;
 result:=public.clinical_workspace(current_visit,1,'pes',payload || '{"evidenceReviewed":true}');
 if result->>'approved_at' is null then raise exception 'Valid manual PES was not approved'; end if;
 if public.clinical_objective(current_visit,1)->'pes'->>'pesStatement' <> payload->>'pesStatement' then raise exception 'Approved statement not available to objectives'; end if;
 if result->'evidence_reviewed' is distinct from 'true'::jsonb then raise exception 'Review not recorded'; end if;
 insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure,clinical_records)
   select professional_id,patient_id,consultation_id,2,template_name,template_version,structure,clinical_records from public.consultation_snapshots where consultation_id=current_visit and revision=1;
 update public.patients set height_cm=171,updated_at=clock_timestamp() where id=pat;
 if exists(select 1 from public.consultation_snapshots where consultation_id=current_visit and revision=2 and clinical_records ? 'pes') then raise exception 'Baseline change retained approval'; end if;
 if not exists(select 1 from public.consultation_snapshots where consultation_id=current_visit and revision=1 and clinical_records ? 'pes') then raise exception 'Baseline change rewrote historical approval'; end if;
end $$;
select 'PES: baseline provenance, historical codes, ownership, context changes and coherent reviewed approval passed.' as result;
