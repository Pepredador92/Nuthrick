begin;
set local lock_timeout='5s';

create function private.has_usable_pes_etiology(value text) returns boolean
language sql immutable set search_path='' as $$
 select normalized<>'' and normalized<>all(array['na','noaplica','noaplicable','ninguna','ninguno','sindatos','sininformacion',
  'noregistrada','noregistrado','nodisponible','desconocida','desconocido','pendiente','porconfirmar','etiologiapendiente','sinetiologia'])
 from (select regexp_replace(translate(lower(btrim(coalesce(value,''))),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g') normalized) s;
$$;
revoke all on function private.has_usable_pes_etiology(text) from public,anon,authenticated,service_role;

-- Keep partial drafts and existing answers. Only clinical approval needs a real
-- etiology. Patch the existing owned/revision-checked entry point in place.
do $patch$
declare original text; amended text; needle text;
begin
 original:=pg_get_functiondef('private.clinical_workspace(uuid,integer,text,jsonb,uuid)'::regprocedure);
 needle:='if p_payload->>''stamp'' is distinct from reviewed->>''stamp'' then raise exception ''context_changed''; end if;';
 amended:=replace(original,needle,needle || E'\n   if not private.has_usable_pes_etiology(p_payload->>''etiology'') then raise exception ''pes_etiology_required''; end if;');
 if amended=original then raise exception 'pes_etiology_guard_patch_failed'; end if;
 execute amended;

 original:=pg_get_functiondef('private.clinical_objective(uuid,integer,text,text,text,jsonb)'::regprocedure);
 needle:='if p_action=''approve'' then';
 amended:=replace(original,needle,needle || E'\n   if not private.has_usable_pes_etiology(answers->>''pes_etiology'') then raise exception ''pes_etiology_required''; end if;');
 if amended=original then raise exception 'objective_etiology_guard_patch_failed'; end if;
 execute amended;

 original:=pg_get_functiondef('private.ai_refund_invalid_pes(uuid,uuid)'::regprocedure);
 amended:=replace(original,'(''pes_diagnosis@8'',''pes_diagnosis@9'')','(''pes_diagnosis@8'',''pes_diagnosis@9'',''pes_diagnosis@10'')');
 if amended=original then raise exception 'pes_refund_version_patch_failed'; end if;
 execute amended;
end $patch$;

-- Actual provider usage/cost and original ledger debits remain auditable. Refunds
-- have one deterministic adjustment key and audit record per generation.
create function private.ai_refund_objective_output(p_owner uuid,p_generation uuid) returns numeric
language plpgsql security definer set search_path='' as $$
declare g private.ai_generations; debit numeric; refund_key uuid;
begin
 select * into g from private.ai_generations where id=p_generation and professional_id=p_owner
  and feature='consultation_support' and prompt_version in ('consultation_support@4','consultation_support@5','consultation_support@6') for update;
 if not found then raise exception 'invalid_refund_target' using errcode='42501'; end if;
 if g.status not in ('invalid_output','failed') and not (
  g.status='succeeded' and exists(select 1 from public.consultation_snapshots s
    where s.consultation_id=g.consultation_id and s.professional_id=p_owner and s.revision=g.clinical_revision
    and s.working_drafts->'proposal:consultation_support'->>'generationId'=g.id::text
    and s.working_drafts->'proposal:consultation_support'->'output'->'objectives'='[]'::jsonb)
 ) then raise exception 'invalid_refund_target' using errcode='42501'; end if;
 if g.charged_credits=0 then return 0; end if;
 select -coalesce(sum(included_delta+purchased_delta),0) into debit from private.ai_credit_ledger
  where professional_id=p_owner and generation_id=g.id and type='USAGE';
 if debit<>g.charged_credits or debit<=0 then raise exception 'invalid_refund_accounting'; end if;
 refund_key:=md5('objective-output-refund:'||g.id::text)::uuid;
 perform private.adjust_ai_credits(p_owner,refund_key,debit);
 insert into private.admin_audit(action,target_professional,entity,entity_id,reason,metadata)
 select 'objective_output_compensation',p_owner,'ai_generations',g.id::text,
  'Reintegro automático: la solicitud no entregó objetivos utilizables.',
  jsonb_build_object('source','ai_server','prompt_version',g.prompt_version,'credits',debit,'operation_key',refund_key,'input_tokens',g.input_tokens,'output_tokens',g.output_tokens,'actual_cost',g.actual_cost)
 where not exists(select 1 from private.admin_audit a where a.action='objective_output_compensation' and a.target_professional=p_owner and a.entity='ai_generations' and a.entity_id=g.id::text);
 update private.ai_generations set status='invalid_output',error_code='objective_output_refunded' where id=g.id;
 update public.consultation_snapshots set working_drafts=working_drafts-'proposal:consultation_support',working_drafts_version=working_drafts_version+1
  where consultation_id=g.consultation_id and professional_id=p_owner and revision=g.clinical_revision
   and working_drafts->'proposal:consultation_support'->>'generationId'=g.id::text
   and working_drafts->'proposal:consultation_support'->'output'->'objectives'='[]'::jsonb;
 return debit;
end $$;
create function public.ai_refund_objective_output(p_owner uuid,p_generation uuid) returns numeric
language sql security invoker set search_path='' as $$select private.ai_refund_objective_output(p_owner,p_generation)$$;
revoke all on function private.ai_refund_objective_output(uuid,uuid),public.ai_refund_objective_output(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.ai_refund_objective_output(uuid,uuid),public.ai_refund_objective_output(uuid,uuid) to service_role;

-- Compensate only historical empty results that can still be proven by their
-- stored proposal; never infer emptiness from token counts or patient identity.
do $$declare g record; begin
 for g in select gen.id,gen.professional_id from private.ai_generations gen
  join public.consultation_snapshots s on s.consultation_id=gen.consultation_id and s.professional_id=gen.professional_id and s.revision=gen.clinical_revision
  where gen.feature='consultation_support' and gen.prompt_version in ('consultation_support@4','consultation_support@5') and gen.status='succeeded' and gen.charged_credits>0
   and s.working_drafts->'proposal:consultation_support'->>'generationId'=gen.id::text
   and s.working_drafts->'proposal:consultation_support'->'output'->'objectives'='[]'::jsonb
 loop perform private.ai_refund_objective_output(g.professional_id,g.id); end loop;
end $$;
commit;
