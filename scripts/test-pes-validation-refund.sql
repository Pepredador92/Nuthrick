-- Accounting fixtures only; every insert, adjustment and audit entry is rolled back.
begin;
do $$
declare owner uuid; generation uuid:=gen_random_uuid(); before_balance numeric; restored numeric; rejected boolean;
begin
 select professional_id into owner from private.ai_accounts order by professional_id limit 1;
 if owner is null then raise exception 'No fixture account'; end if;
 select purchased_credits into before_balance from private.ai_accounts where professional_id=owner for update;
 insert into private.ai_generations(id,professional_id,idempotency_key,request_hash,feature,provider,model,prompt_version,
   config_snapshot,status,reserved_included,reserved_purchased,estimated_cost,actual_cost,charged_credits,
   input_tokens,output_tokens,cached_tokens,total_tokens,completed_at)
 values(generation,owner,gen_random_uuid(),repeat('a',64),'pes_diagnosis','openai','synthetic-test','pes_diagnosis@8',
   '{}','invalid_output',1,0,0.01,0.01,1,20,10,0,30,now());
 insert into private.ai_credit_ledger(professional_id,type,included_delta,feature,generation_id,operation_key)
   values(owner,'USAGE',-1,'pes_diagnosis',generation,gen_random_uuid());
 rejected:=false;
 begin perform public.ai_refund_invalid_pes(gen_random_uuid(),generation);
 exception when others then if sqlerrm='invalid_refund_target' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'Foreign owner accepted'; end if;
 restored:=public.ai_refund_invalid_pes(owner,generation);
 if restored<>1 then raise exception 'Wrong refund amount'; end if;
 perform public.ai_refund_invalid_pes(owner,generation);
 if (select purchased_credits-before_balance from private.ai_accounts where professional_id=owner)<>1
   then raise exception 'Refund missing or duplicated'; end if;
 if (select count(*) from private.admin_audit where action='pes_validation_compensation' and entity_id=generation::text)<>1
   then raise exception 'Audit missing or duplicated'; end if;
 if (select count(*) from private.ai_credit_ledger where professional_id=owner
   and operation_key=md5('pes-output-validation-refund:'||generation::text)::uuid and type='ADMIN_ADJUSTMENT')<>1
   then raise exception 'Ledger compensation missing or duplicated'; end if;
 if not exists(select 1 from private.ai_generations where id=generation and charged_credits=1 and actual_cost=0.01 and input_tokens=20)
   then raise exception 'Provider usage history was changed'; end if;
 update private.ai_generations set status='succeeded' where id=generation;
 rejected:=false;
 begin perform public.ai_refund_invalid_pes(owner,generation);
 exception when others then if sqlerrm='invalid_refund_target' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'Succeeded generation refunded'; end if;
 update private.ai_generations set status='invalid_output',charged_credits=0.5 where id=generation;
 rejected:=false;
 begin perform public.ai_refund_invalid_pes(owner,generation);
 exception when others then if sqlerrm='invalid_refund_accounting' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'Accounting mismatch accepted'; end if;
 if has_function_privilege('anon','public.ai_refund_invalid_pes(uuid,uuid)','execute')
   or has_function_privilege('authenticated','public.ai_refund_invalid_pes(uuid,uuid)','execute')
   or not has_function_privilege('service_role','public.ai_refund_invalid_pes(uuid,uuid)','execute')
   then raise exception 'Refund endpoint privileges incorrect'; end if;
end $$;
rollback;
select 'Passed: refund amount, idempotency, audit, ownership, status, accounting and RPC privileges. Fixtures rolled back.' as result;
