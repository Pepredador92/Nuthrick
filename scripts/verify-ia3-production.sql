-- Explicit synthetic production smoke test. Always rolls back all fixture data.
-- No AI provider, generation, credits, publication, email or real patient edits.
begin;
set local request.jwt.claim.sub='56a02bbb-6d29-4a8b-87de-49760ea1360d';
do $$
declare owner uuid:=auth.uid(); pid uuid:=gen_random_uuid(); c public.consultations;
 s public.consultation_snapshots; tid uuid; verify_plan_id uuid:=gen_random_uuid(); ctx jsonb;
 args jsonb; shared_before jsonb; goals jsonb; before_generations bigint; before_ledger bigint;
begin
 select count(*) into before_generations from private.ai_generations;
 select count(*) into before_ledger from private.ai_credit_ledger;
 insert into public.patients(id,professional_id,full_name) values(pid,owner,'PRUEBA TRANSACCIONAL IA3 — NO PACIENTE');
 select * into c from public.start_consultation_draft(pid,'initial');
 select id into strict tid from public.consultation_templates where template_key='system_initial_v2' and is_system;
 select * into s from public.adopt_consultation_template(c.id,tid,0);
 if not exists(select 1 from jsonb_array_elements(s.structure->'sections') sec,
   jsonb_array_elements(sec->'questions') q where q->>'question_key'='treatment_objective') then raise exception 'objective missing';end if;
 ctx:=public.clinical_workspace(c.id,s.revision);
 perform public.clinical_workspace(c.id,s.revision,'pes',jsonb_build_object('stamp',ctx->>'stamp',
   'problem','Caso ficticio','etiology','Prueba técnica','signsSymptoms',jsonb_build_array('Dato sintético'),
   'pesStatement','PES ficticio aprobado para verificar IA-3'));
 perform public.save_consultation_responses(c.id,s.revision,'{"treatment_objective":"Objetivo ficticio acordado IA-3"}');
 args:=jsonb_build_object('owner',owner,'patientId',pid);
 shared_before:=public.patient_portal('view',args)->'shared';
 update public.consultations set status='completed' where id=c.id and professional_id=owner;
 goals:=public.patient_portal('goal_candidates',args)->'goals';
 if goals->0->>'content' is distinct from 'Objetivo ficticio acordado IA-3' then raise exception 'wrong candidate';end if;
 if public.patient_portal('view',args)->'shared' is distinct from shared_before then raise exception 'unexpected sharing';end if;
 insert into public.nutrition_plans(id,professional_id,patient_id,consultation_id,title,status,target_calories,macro_distribution)
 values(verify_plan_id,owner,pid,c.id,'PRUEBA TRANSACCIONAL IA3','draft',2000,
 '{"complete":true,"macros":{"PROTEIN":{"grams":100},"CARBOHYDRATE":{"grams":250},"FAT":{"grams":66.6667}}}');
 ctx:=public.ai_workshop_source(owner,verify_plan_id,1);
 if ctx->>'goal' is distinct from 'Objetivo ficticio acordado IA-3' or ctx->>'approvedPes' is distinct from 'PES ficticio aprobado para verificar IA-3' then raise exception 'missing approved context';end if;
 if public.ai_workshop_status(verify_plan_id)->>'enabled' is distinct from 'false' then raise exception 'AI enabled unexpectedly';end if;
 if exists(select 1 from public.nutrition_plan_versions v where v.plan_id=verify_plan_id) then raise exception 'unexpected publication';end if;
 if (select count(*) from private.ai_generations)<>before_generations or (select count(*) from private.ai_credit_ledger)<>before_ledger then raise exception 'unexpected AI activity';end if;
 raise notice 'PASS: saved objective, approved PES, finalized consultation, unshared portal candidate, disabled Workshop, no versions or AI activity';
end $$;
rollback;
select 'Synthetic IA-3 verification completed; all fixture records rolled back' as result;
