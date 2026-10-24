begin;

-- A patient may have a diet without selecting a consultation. Keep that
-- assignment, validate its owner, and load only the saved prescription.
create or replace function public.ai_text_diet_source(p_owner uuid,p_plan uuid,p_revision integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p public.nutrition_plans; patient public.patients; source jsonb; identifiers jsonb:='[]'::jsonb;
begin
 select * into p from public.nutrition_plans
 where id=p_plan and professional_id=p_owner and status='draft' and deleted_at is null;
 if p.id is null or p.draft_revision is distinct from p_revision then raise exception 'context_unavailable'; end if;
 if p.consultation_id is null then
  if p.patient_id is not null then
   select * into patient from public.patients
   where id=p.patient_id and professional_id=p_owner and deleted_at is null and status<>'archived';
   if patient.id is null then raise exception 'context_unavailable'; end if;
   identifiers:=jsonb_build_array(patient.full_name,patient.email,patient.phone);
  end if;
  source:=jsonb_build_object('plan',to_jsonb(p),'consultation',null,'answers','{}'::jsonb);
  return jsonb_build_object('source',source||jsonb_build_object('stamp',md5(source::text)),'identifiers',identifiers);
 end if;
 return private.ai_linked_text_diet_source(p_owner,p_plan,p_revision);
end $$;
revoke all on function public.ai_text_diet_source(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_text_diet_source(uuid,uuid,integer) to service_role;

commit;
