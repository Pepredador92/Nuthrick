-- Executed ONLY inside the isolated SQL test transaction/savepoint. The payload
-- was received from OpenAI; professional review and generation ledger are simulated.
insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value)
select c.professional_id,c.id,c.patient_id,1,replace(replace(f->>'source','Entrevista · ',''),' ','_'),to_jsonb(f->>'finding')
from consultations c cross join lateral jsonb_array_elements(current_setting('test.real_pes')::jsonb->'exactInput'->'context'->'facts') f
where f->>'source' like 'Entrevista%'
on conflict(professional_id,consultation_id,revision,question_key) do update set value=excluded.value,updated_at=clock_timestamp();
insert into consultation_measurements(professional_id,consultation_id,patient_id,measurement_type_id,value,unit,measured_at)
select professional_id,id,patient_id,'weight','70','kg','2026-09-21T12:00:00Z' from consultations;
update consultation_measurements set value='170',unit='cm',measured_at='2026-09-21T12:00:00Z',updated_at=clock_timestamp() where measurement_type_id='height';
set local role authenticated;
select pg_temp.assert_true(clinical_objective('20000000-0000-0000-0000-000000000001',1)->'pes'='null','real output is not approved merely by existing');
reset role;
insert into private.ai_accounts(professional_id) values('00000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into private.ai_generations(id,professional_id,idempotency_key,request_hash,patient_id,consultation_id,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,clinical_revision,clinical_stamp)
values('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',repeat('a',64),'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','pes_diagnosis','openai',current_setting('test.real_pes')::jsonb->>'responseModel','pes_diagnosis@1','{}','succeeded',0,0,0,1,
ai_clinical_source('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1)->>'stamp');
set local role authenticated;
select clinical_workspace('20000000-0000-0000-0000-000000000001',1,'pes',
  (current_setting('test.real_pes')::jsonb->'output') || jsonb_build_object('stamp',clinical_workspace('20000000-0000-0000-0000-000000000001',1)->>'stamp'),
  '40000000-0000-0000-0000-000000000001');
select pg_temp.assert_true(clinical_objective('20000000-0000-0000-0000-000000000001',1)->'pes'->>'pesStatement'=current_setting('test.real_pes')::jsonb->'output'->>'pesStatement','actual generated PES reaches objective after professional approval');
select pg_temp.assert_true(clinical_objective('20000000-0000-0000-0000-000000000001',1)->'objective'='null','real PES does not approve objective');
-- The minimal harness save stub has no production RPC grants. Seed the
-- professionally entered answer as fixture owner; approvals remain authenticated.
reset role;
select save_consultation_responses('20000000-0000-0000-0000-000000000001',1,'{"treatment_objective":"Preparar un desayuno sencillo la noche anterior cuatro días por semana y revisar adherencia en la próxima consulta."}');
set local role authenticated;
select clinical_objective('20000000-0000-0000-0000-000000000001',1,'approve',clinical_objective('20000000-0000-0000-0000-000000000001',1)->>'stamp','treatment_objective');
select pg_temp.assert_true(clinical_objective('20000000-0000-0000-0000-000000000001',1)->'objective'->>'pes_statement'=current_setting('test.real_pes')::jsonb->'output'->>'pesStatement','objective preserves PES provenance');
reset role;
select pg_temp.assert_true((select clinical_records->'pes'->>'generated_with_ai'='true' and clinical_records->'pes'->>'model'='gpt-5.6-terra' from consultation_snapshots where revision=1),'real output approval retains AI provenance');
select pg_temp.assert_true((select clinical_records->'objective'->>'revision'='1' and clinical_records->'objective'->>'approved_at' is not null from consultation_snapshots where revision=1),'objective retains its own approval and revision');
select pg_temp.assert_true((select target_calories=2100 and macro_distribution->'macros'->'PROTEIN'->>'grams'='100' from nutrition_plans),'real PES and objective never change deterministic prescription');
update consultation_measurements set value='71',updated_at=clock_timestamp() where measurement_type_id='weight';
select pg_temp.assert_true((select not(clinical_records ? 'pes') and not(clinical_records ? 'objective') from consultation_snapshots where revision=1),'subsequent real-context edit invalidates both approvals');
