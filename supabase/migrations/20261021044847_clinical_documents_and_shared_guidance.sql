begin;
-- Explicit patient-facing projections from approved data in completed consultations.
create function private.portal_clinical_entries(pid uuid,owner_id uuid,target_consultation uuid,clinical_revision integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.consultation_snapshots; objective jsonb; goals jsonb:='[]'; strategies jsonb:='[]'; item jsonb; projected jsonb; i public.consultation_interventions; ordinal bigint;
begin
 select snap.* into s from public.consultation_snapshots snap join public.consultations c on c.id=snap.consultation_id
 where c.id=target_consultation and c.patient_id=pid and c.professional_id=owner_id and c.status='completed' and c.deleted_at is null
 and snap.patient_id=pid and snap.professional_id=owner_id and snap.revision=clinical_revision
 and snap.revision=(select max(revision) from public.consultation_snapshots where consultation_id=c.id);
 if not found then return '{"objectives":[],"strategies":[]}'; end if;
 objective:=s.clinical_records->'objective';
 if objective->>'approved_at' is null or s.clinical_records->'pes'->>'approved_at' is null
 or objective->>'pes_approved_at' is distinct from s.clinical_records->'pes'->>'approved_at'
 or jsonb_typeof(objective->'smart_plan'->'goals') is distinct from 'array' then return '{"objectives":[],"strategies":[]}'; end if;
 for item,ordinal in select value,ordinality from jsonb_array_elements(objective->'smart_plan'->'goals') with ordinality loop
  if coalesce(item->>'agreement','') not in ('patient','caregiver') then continue; end if;
  select jsonb_object_agg(k,coalesce(item->>k,'')) into projected from unnest(array['outcome','indicator','baseline','target','timeframe','monitoring','feasibility']) k;
  goals:=goals||jsonb_build_array(projected||jsonb_build_object('source',jsonb_build_object('consultationId',target_consultation,'revision',s.revision,'approvedAt',objective->>'approved_at','questionKey',objective->>'question_key','goalIndex',ordinal-1)));
 end loop;
 for i in select * from public.consultation_interventions where snapshot_id=s.id and professional_id=owner_id and draft is null and approved is not null and state in ('approved','executing','completed') order by (approved->'document'->'strategy'->>'priority')::integer,created_at loop
  if i.approved->'document'->>'pesApprovedAt' is distinct from s.clinical_records->'pes'->>'approved_at'
  or i.approved->'document'->>'objectiveApprovedAt' is distinct from objective->>'approved_at' then continue; end if;
  item:=i.approved->'document'->'strategy';
  select jsonb_object_agg(k,coalesce(item->>k,'')) into projected from unnest(array['title','action','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','composition','dose','educationTopic','materials','comprehensionCheck','coordinationWith','coordinationReason','access','route']) k;
  strategies:=strategies||jsonb_build_array(projected||jsonb_build_object('source',jsonb_build_object('consultationId',target_consultation,'revision',s.revision,'approvedAt',i.approved->>'approvedAt','strategyId',i.id,'version',i.version)));
 end loop;
 return jsonb_build_object('objectives',goals,'strategies',strategies);
end $$;
revoke all on function private.portal_clinical_entries(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.portal_clinical_entries(uuid,uuid,uuid,integer) to service_role;

-- Exact equality rejects forged origins, modified text and additional private fields.
create function private.portal_clinical_entry_valid(pid uuid,owner_id uuid,kind text,item jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 if kind not in ('objectives','strategies') or jsonb_typeof(item) is distinct from 'object' then return false; end if;
 return exists(select 1 from jsonb_array_elements(private.portal_clinical_entries(pid,owner_id,(item#>>'{source,consultationId}')::uuid,(item#>>'{source,revision}')::integer)->kind) candidate where candidate.value=item);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function private.portal_clinical_entry_valid(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.portal_clinical_entry_valid(uuid,uuid,text,jsonb) to service_role;

do $migration$
declare original text; amended text; needle text;
begin
 select pg_get_functiondef('public.patient_portal(text,jsonb)'::regprocedure) into original;
 needle:='if p_action=''goal_candidates'' and actor=''professional'' then';
 if position(needle in original)=0 then raise exception 'Portal candidate insertion point changed'; end if;
 amended:=replace(original,needle,$insert$
 if p_action='clinical_candidates' and actor='professional' then
  select coalesce(jsonb_agg(to_jsonb(g) order by g.date desc),'[]') into rows from (
   select c.id,c.consultation_date as date,s.revision,
    private.portal_clinical_entries(pid,p.professional_id,c.id,s.revision)->'objectives' as objectives,
    private.portal_clinical_entries(pid,p.professional_id,c.id,s.revision)->'strategies' as strategies
   from public.consultations c join lateral (select revision from public.consultation_snapshots where consultation_id=c.id and patient_id=pid and professional_id=p.professional_id order by revision desc limit 1) s on true
   where c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null
   order by c.consultation_date desc,c.id limit 50
  ) g;
  return jsonb_build_object('consultations',rows);
 elsif p_action='goal_candidates' and actor='professional' then
 $insert$);
 amended:=replace(amended,'''goal_candidates'',''plan_history''','''goal_candidates'',''clinical_candidates'',''plan_history''');
 needle:='update private.patient_portals set shared=p_data->''shared'',revision=revision+1,published_at=now() where patient_id=pid;';
 if position(needle in amended)=0 then raise exception 'Portal publication insertion point changed'; end if;
 amended:=replace(amended,needle,$insert$
 for old_body in select unnest(array['objectives','strategies']) loop
  if p_data->'shared' ? old_body then
   if jsonb_typeof(p_data->'shared'->old_body) is distinct from 'array' then raise exception 'invalid_input'; end if;
   if jsonb_array_length(p_data->'shared'->old_body)>(case when old_body='objectives' then 12 else 30 end) then raise exception 'invalid_input'; end if;
   if (select count(*)<>count(distinct value->'source') from jsonb_array_elements(p_data->'shared'->old_body)) then raise exception 'invalid_input'; end if;
   for item in select value from jsonb_array_elements(p_data->'shared'->old_body) loop
    if not private.portal_clinical_entry_valid(pid,p.professional_id,old_body,item) then return '{"error":"invalid_clinical_guidance"}'; end if;
   end loop;
  end if;
 end loop;
 update private.patient_portals set shared=p_data->'shared',revision=revision+1,published_at=now() where patient_id=pid;
 $insert$);
 needle:='-- Whitelisted profile fields only; no birth date, identifiers or contacts.';
 if position(needle in amended)=0 then raise exception 'Portal view insertion point changed'; end if;
 amended:=replace(amended,needle,$insert$
 -- Published copies are retracted when their consultation is reopened or removed.
 for old_body in select unnest(array['objectives','strategies']) loop
  if space.shared ? old_body then
   select coalesce(jsonb_agg(value order by ordinality),'[]') into rows from jsonb_array_elements(space.shared->old_body) with ordinality
    where private.portal_clinical_entry_valid(pid,p.professional_id,old_body,value);
   space.shared:=jsonb_set(space.shared,array[old_body],rows);
  end if;
 end loop;
 -- Whitelisted profile fields only; no birth date, identifiers or contacts.
 $insert$);
 execute amended;
 select pg_get_functiondef('private.require_portal_capability(uuid,text,text)'::regprocedure) into original;
 amended:=replace(original,'''goal_candidates''','''goal_candidates'',''clinical_candidates''');
 if amended=original then raise exception 'Portal capability insertion point changed'; end if;
 execute amended;
end $migration$;
revoke all on function public.patient_portal(text,jsonb) from public,anon,authenticated;
grant execute on function public.patient_portal(text,jsonb) to service_role;
commit;
