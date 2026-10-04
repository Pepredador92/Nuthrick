create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',msg;end if;end$$;
create function pg_temp.reject(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm=expected then return;end if;raise;end;raise exception 'Expected rejection: %',q;end$$;
insert into professional_profiles values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into patients(id,professional_id,full_name) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','SYNTHETIC');
insert into consultations(id,professional_id,patient_id,status,consultation_date,sequence_number,consultation_type)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 case n when 5 then 'draft' when 6 then 'cancelled' else 'completed' end,'2026-08-01'::timestamptz+n*interval '1 day',n,case n when 1 then 'initial' else 'follow_up' end from generate_series(1,7)n;
-- Current=5, cancelled=6 and future=7 must not enter history. Deleted=2 omitted.
update consultations set deleted_at=now() where sequence_number=2;
insert into consultation_snapshots(professional_id,consultation_id,patient_id,revision,clinical_records)
select professional_id,id,patient_id,1,'{}' from consultations;
insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,value)
select professional_id,id,patient_id,1,'treatment_objective',to_jsonb('Goal '||sequence_number) from consultations;
insert into nutrition_plans(id,professional_id,patient_id,consultation_id,status,target_calories,macro_distribution,updated_at)
select '30000000-0000-0000-0000-000000000001',professional_id,patient_id,id,'draft',2000,'{"supplements":[{"preserved":true}]}',now() from consultations where sequence_number=5;
do $$
declare src jsonb; oldstamp text; prior jsonb; owner uuid:='00000000-0000-0000-0000-000000000001'; pid uuid:='30000000-0000-0000-0000-000000000001'; gid uuid:=gen_random_uuid();
begin
 perform pg_temp.assert(not has_function_privilege('authenticated','public.ai_diet_source(uuid,uuid,integer)','execute'),'source exposed');
 perform pg_temp.assert(not has_function_privilege('anon','public.ai_diet_draft(uuid,text,jsonb)','execute'),'apply exposed');
 perform pg_temp.reject(format('select ai_diet_source(%L,%L,1)','00000000-0000-0000-0000-000000000002',pid),'context_unavailable');
 src:=ai_diet_source(owner,pid,1)->'source';
 perform pg_temp.assert(jsonb_array_length(src->'datedContext')=4,'wrong history selection');
 perform pg_temp.assert(src->>'objectiveSuggestion'='Goal 5','wrong current objective');
 perform pg_temp.assert((src->'datedContext'->0->>'current')::boolean,'selected visit not first');
 perform pg_temp.assert(not(src::text like '%Goal 2%' or src::text like '%Goal 6%' or src::text like '%Goal 7%'),'deleted cancelled future history leaked');
 oldstamp:=src->>'stamp';
 update consultation_answers set value='"Revised historic goal"' where consultation_id='20000000-0000-0000-0000-000000000001';
 src:=ai_diet_source(owner,pid,1)->'source';perform pg_temp.assert(src->>'stamp'<>oldstamp,'history changes not in stamp');
 insert into private.ai_accounts(professional_id) values(owner);
 insert into private.ai_generations(id,professional_id,patient_id,consultation_id,idempotency_key,request_hash,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost)
 values(gid,owner,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005',gen_random_uuid(),repeat('a',64),'diet_draft','openai','mock','diet_draft@3','{}','reserved',0,0,0);
 perform ai_diet_draft(owner,'bind',jsonb_build_object('generationId',gid,'planId',pid,'revision',1,'stamp',src->>'stamp','snapshot','{"guided":true,"hasManualMenu":true,"plan":{"exchange_prescription":{"fixture":1},"meal_distribution":{"fixture":2}}}'::jsonb));
 update private.ai_generations set status='running' where id=gid;
 perform ai_diet_draft(owner,'result',jsonb_build_object('generationId',gid,'result','{"validation":{"status":"needs_adjustment","draft":{"fixture":3},"requiresTargetReview":true}}'::jsonb));
 update private.ai_generations set status='succeeded' where id=gid;
 select to_jsonb(p) into prior from nutrition_plans p where id=pid;
 perform pg_temp.reject(format('select ai_diet_draft(%L,%L,%L)',owner,'apply',jsonb_build_object('generationId',gid,'acceptDifferences',true)),'replacement_confirmation_required');
 perform pg_temp.reject(format('select ai_diet_draft(%L,%L,%L)',owner,'apply',jsonb_build_object('generationId',gid,'replaceExisting',true)),'difference_confirmation_required');
 perform pg_temp.assert((select to_jsonb(p)=prior from nutrition_plans p where id=pid),'failed apply changed plan');
 perform ai_diet_draft(owner,'apply',jsonb_build_object('generationId',gid,'replaceExisting',true,'acceptDifferences',true));
 perform pg_temp.assert((select diet_menu->>'fixture'='3' and meal_distribution->>'fixture'='2' and exchange_prescription->>'fixture'='1' and target_calories=2000 and macro_distribution=prior->'macro_distribution' and status='draft' from nutrition_plans where id=pid),'non-atomic apply or supplement overwrite');
 perform pg_temp.assert((ai_diet_draft(owner,'apply',jsonb_build_object('generationId',gid))->>'replay')::boolean,'apply not idempotent');
 raise notice 'PASS guided context, isolation, history freshness, atomic apply, differences, replacement, supplements and replay';
end $$;
rollback;
