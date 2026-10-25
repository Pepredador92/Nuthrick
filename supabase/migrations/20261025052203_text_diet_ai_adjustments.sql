begin;
set local lock_timeout='5s';
-- Read the owned saved draft and the original confirmed preferences, when this
-- plan has an accepted text-generation snapshot. No catalog is loaded.
create function public.ai_text_diet_edit_source(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare loaded jsonb; plan public.nutrition_plans; original_context jsonb;
begin
 loaded:=public.ai_text_diet_source(p_owner,p_plan,p_revision);
 select * into plan from public.nutrition_plans where id=p_plan and professional_id=p_owner
   and status='draft' and deleted_at is null and draft_revision=p_revision;
 if plan.id is null or plan.text_diet is null then raise exception 'context_unavailable'; end if;
 select s.snapshot->'payload' into original_context from private.ai_diet_snapshots s
   join private.ai_generations g on g.id=s.generation_id and g.professional_id=p_owner
   where s.plan_id=plan.id and g.feature='diet_draft' and g.status='succeeded' and g.workshop_decision='accepted'
     and g.patient_id is not distinct from plan.patient_id and g.consultation_id is not distinct from plan.consultation_id
     and s.snapshot->>'format'='text_diet' and s.snapshot->'payload'->>'format'='text_diet'
   order by g.started_at desc,g.id desc limit 1;
 -- Bind/apply use the original loader's same revision and content signature.
 return jsonb_set(loaded,'{source,plan,text_diet}',plan.text_diet)||jsonb_build_object('originalTextContext',original_context);
end $$;
revoke all on function public.ai_text_diet_edit_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_text_diet_edit_source(uuid,uuid,integer) to service_role;
commit;
