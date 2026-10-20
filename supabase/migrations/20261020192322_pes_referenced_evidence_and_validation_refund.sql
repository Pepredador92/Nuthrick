begin;
-- Deploy Edge support for PES @8 first. The legacy prompt remains usable until
-- this transaction installs the refund endpoint and activates the new contract.
create function private.ai_refund_invalid_pes(p_owner uuid,p_generation uuid) returns numeric
language plpgsql security definer set search_path='' as $$
declare g private.ai_generations; debit numeric; refund_key uuid;
begin
 select * into g from private.ai_generations
   where id=p_generation and professional_id=p_owner and feature='pes_diagnosis'
     and prompt_version='pes_diagnosis@8' and status='invalid_output' for update;
 if not found then raise exception 'invalid_refund_target' using errcode='42501'; end if;
 if g.charged_credits=0 then return 0; end if;
 select -coalesce(sum(included_delta+purchased_delta),0) into debit
   from private.ai_credit_ledger where professional_id=p_owner and generation_id=g.id and type='USAGE';
 if debit<>g.charged_credits or debit<=0 then raise exception 'invalid_refund_accounting'; end if;
 refund_key:=md5('pes-output-validation-refund:'||g.id::text)::uuid;
 perform private.adjust_ai_credits(p_owner,refund_key,debit);
 insert into private.admin_audit(action,target_professional,entity,entity_id,reason,metadata)
 select 'pes_validation_compensation',p_owner,'ai_generations',g.id::text,
   'Reintegro automático: el diagnóstico PES no produjo un borrador válido.',
   jsonb_build_object('source','ai_server','prompt_version',g.prompt_version,'credits',debit,'operation_key',refund_key)
 where not exists(select 1 from private.admin_audit a where a.action='pes_validation_compensation'
   and a.target_professional=p_owner and a.entity='ai_generations' and a.entity_id=g.id::text);
 return debit;
end $$;
create function public.ai_refund_invalid_pes(p_owner uuid,p_generation uuid) returns numeric
language sql security invoker set search_path='' as $$select private.ai_refund_invalid_pes(p_owner,p_generation)$$;
revoke all on function private.ai_refund_invalid_pes(uuid,uuid),public.ai_refund_invalid_pes(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.ai_refund_invalid_pes(uuid,uuid),public.ai_refund_invalid_pes(uuid,uuid) to service_role;

do $$
begin
 if not exists(select 1 from private.ai_feature_config where feature='pes_diagnosis'
   and prompt_version in ('pes_diagnosis@6','pes_diagnosis@7')) then raise exception 'Unexpected PES configuration'; end if;
 update private.ai_feature_config set prompt_version='pes_diagnosis@8',updated_at=now()
   where feature='pes_diagnosis' and prompt_version in ('pes_diagnosis@6','pes_diagnosis@7');
end $$;
commit;
