-- ADMIN-1 enforcement. These guards never use commercial plan codes.
create function private.my_feature(p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.can_use_feature(auth.uid(),p_key)
$$;
create function private.require_my_entitlement(p_key text) returns void language plpgsql stable security definer set search_path='' as $$
begin perform private.require_entitlement(auth.uid(),p_key); end $$;
revoke all on function private.my_feature(text),private.require_my_entitlement(text) from public,anon,service_role;
grant execute on function private.my_feature(text),private.require_my_entitlement(text) to authenticated;
grant execute on function private.require_entitlement(uuid,text),private.can_use_feature(uuid,text) to service_role;
-- RPC for explicit actions such as client-rendered exports. Only one's own account.
create function public.require_entitlement(p_key text) returns void language sql security invoker set search_path='' as $$select private.require_my_entitlement(p_key)$$;
revoke all on function public.require_entitlement(text) from public,anon,service_role;
grant execute on function public.require_entitlement(text) to authenticated;

-- Quota usage is counted on insertion; changing clinical created_at cannot
-- backdate usage or reclaim it by deleting a consultation.
create table private.commercial_usage_months (
 professional_id uuid not null references public.professional_profiles(id) on delete restrict,
 period_start date not null, consultations bigint not null default 0 check(consultations>=0),
 primary key(professional_id,period_start)
);
alter table private.commercial_usage_months enable row level security;
revoke all on private.commercial_usage_months from public,anon,authenticated,service_role;
create policy admin_rpc_only on private.commercial_usage_months to authenticated using(false);
insert into private.commercial_usage_months(professional_id,period_start,consultations)
 select professional_id,date_trunc('month',created_at at time zone 'UTC')::date,count(*) from public.consultations group by 1,2;

create function private.enforce_commercial_write() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 owner_id uuid; cap jsonb; used bigint;
begin
 owner_id:=coalesce(row_data->>'professional_id',row_data->>'owner_id')::uuid;
 -- Shared catalog rows are maintained by existing internal publication workflows.
 if owner_id is null then return case when tg_op='DELETE' then old else new end; end if;
 perform private.require_entitlement(owner_id,tg_argv[0]);
 if tg_op='UPDATE' and coalesce(to_jsonb(old)->>'professional_id',to_jsonb(old)->>'owner_id') is distinct from owner_id::text then
  raise exception 'owner_immutable' using errcode='42501';
 end if;
 if tg_table_name='patients' and (tg_op='INSERT' or (tg_op='UPDATE' and to_jsonb(old)->>'deleted_at' is not null and row_data->>'deleted_at' is null)) and row_data->>'deleted_at' is null then
  -- Serializes quota checks across REST, RPC and server paths for this owner.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8317));
  cap:=private.get_limit(owner_id,'patients.limit');
  if cap<>'"unlimited"'::jsonb then
   select count(*) into used from public.patients where professional_id=owner_id and deleted_at is null;
   if used>=(cap::text)::numeric then raise exception 'patients_limit_reached' using errcode='42501'; end if;
  end if;
 elsif tg_table_name='consultations' and tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8317));
  cap:=private.get_limit(owner_id,'consultations.monthly_limit');
  if cap<>'"unlimited"'::jsonb then
   select coalesce((select consultations from private.commercial_usage_months where professional_id=owner_id and period_start=date_trunc('month',now() at time zone 'UTC')::date),0) into used;
   if used>=(cap::text)::numeric then raise exception 'consultations_limit_reached' using errcode='42501'; end if;
  end if;
  insert into private.commercial_usage_months(professional_id,period_start,consultations) values(owner_id,date_trunc('month',now() at time zone 'UTC')::date,1)
  on conflict(professional_id,period_start) do update set consultations=private.commercial_usage_months.consultations+1;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.enforce_commercial_write() from public,anon,authenticated,service_role;

-- Restrictive policies AND with existing tenant isolation. Triggers also guard
-- SECURITY DEFINER/service writes, which would otherwise bypass those policies.
do $$ declare item record; begin
 for item in select * from (values
 ('patients','patients'),('patient_notes','patients'),('patient_tags','patients'),('patient_tag_assignments','patients'),('patient_progress_photos','patients'),
 ('patient_measurements','patients'),('patient_measurement_templates','patients'),('patient_measurement_followups','patients'),('patient_measurement_followup_items','patients'),
 ('consultations','consultations'),('consultation_answers','consultations'),('consultation_snapshots','consultations'),('consultation_notes','consultations'),('consultation_anthropometry','consultations'),
 ('consultation_measurements','consultations'),('consultation_device_sessions','consultations'),('consultation_calculation_results','consultations'),
 ('laboratory_reports','consultations'),('laboratory_results','consultations'),('questionnaire_responses','consultations'),('questionnaire_submissions','consultations'),
 ('consultation_templates','consultation_design'),('consultation_template_sections','consultation_design'),('consultation_template_questions','consultation_design'),
 ('nutrition_plans','diet_workshop'),('nutrition_plan_versions','diet_workshop'),('diet_library_items','diet_library'),('diet_library_contributions','diet_library'),
 ('agenda_entries','agenda'),('agenda_requests','agenda'),('agenda_audit','agenda'),('availability_settings','agenda'),('availability_slots','agenda')
 ) as m(table_name,feature) loop
  if item.feature='consultation_design' then
   execute format('create policy commercial_read on public.%I as restrictive for select to authenticated using ((select private.my_feature(''consultations'')) or (select private.my_feature(''consultation_design'')))',item.table_name);
   execute format('create policy commercial_insert on public.%I as restrictive for insert to authenticated with check ((select private.my_feature(''consultation_design'')))',item.table_name);
   execute format('create policy commercial_update on public.%I as restrictive for update to authenticated using ((select private.my_feature(''consultation_design''))) with check ((select private.my_feature(''consultation_design'')))',item.table_name);
   execute format('create policy commercial_delete on public.%I as restrictive for delete to authenticated using ((select private.my_feature(''consultation_design'')))',item.table_name);
  else
   execute format('create policy commercial_access on public.%I as restrictive for all to authenticated using ((select private.my_feature(%L))) with check ((select private.my_feature(%L)))',item.table_name,item.feature,item.feature);
  end if;
  execute format('create trigger commercial_write before insert or update or delete on public.%I for each row execute function private.enforce_commercial_write(%L)',item.table_name,item.feature);
 end loop;
end $$;

-- The public projection stays intact; visibility reacts to expiration immediately.
create function private.public_profile_access(p_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.can_use_feature(id,'public_profile') from public.professional_profiles where storage_key=p_key),false)
$$;
revoke all on function private.public_profile_access(uuid) from public,anon,authenticated,service_role;
grant execute on function private.public_profile_access(uuid) to anon,authenticated;
create policy commercial_public_profile on public.public_professional_pages as restrictive for select to anon,authenticated using(private.public_profile_access(profile_key));

-- Preserve existing ownership/clinical validation and guard privileged RPC entry.
-- A missing or incompatible function aborts the migration instead of silently
-- leaving an unguarded endpoint. Functions retain their original ACLs.
do $$ declare item record; original text; amended text; signature regprocedure; begin
 for item in select * from (values
 ('public.publish_nutrition_plan_version(uuid,bigint,uuid)','diet_workshop'),
 ('public.apply_diet_library(uuid,bigint,uuid,bigint,uuid,jsonb)','diet_library'),
 ('public.apply_diet_library_with_targets(uuid,bigint,uuid,bigint,uuid,jsonb,text)','diet_library'),
 ('public.restore_diet_library_backup(uuid,uuid,bigint)','diet_library'),
 ('public.submit_diet_library(uuid,bigint,boolean)','diet_library'),
 ('public.withdraw_diet_library_contribution(uuid)','diet_library'),
 ('public.review_diet_library_contribution(uuid,boolean,text,boolean)','diet_library'),
 ('public.delete_consultation_record(uuid)','consultations'),
 ('public.reopen_consultation_for_edit(uuid)','consultations'),
 ('private.clinical_workspace(uuid,integer,text,jsonb,uuid)','consultations'),
 ('private.clinical_objective(uuid,integer,text,text,text)','consultations')
 ) as m(signature,feature) loop
  signature:=item.signature::regprocedure;
  original:=pg_get_functiondef(signature);
  amended:=regexp_replace(original,'\mbegin\M',format(E'begin\n perform private.require_my_entitlement(%L);',item.feature),'i');
  if amended=original then raise exception 'unexpected_guard_target: %',item.signature; end if;
  execute amended;
 end loop;
end $$;

-- Service-only provider/agenda/portal boundaries. Disabling capabilities never
-- prevents settlement/release of credits that were already reserved.
do $$ declare original text; amended text; marker text; begin
 original:=pg_get_functiondef('public.ai_server(text,uuid,jsonb)'::regprocedure);
 amended:=regexp_replace(original,'\mbegin\M',$guard$begin
 if p_action in ('config','reserve','claim') then
  perform private.require_entitlement(p_owner,case coalesce(p_data->>'feature',(select feature from private.ai_generations where id=(p_data->>'generation_id')::uuid and professional_id=p_owner))
    when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes' when 'diet_draft' then 'ai.diet_draft' else 'ai.unsupported' end);
 end if;
$guard$,'i');
 if amended=original then raise exception 'unexpected_ai_server'; end if; execute amended;
 original:=pg_get_functiondef('public.patient_portal(text,jsonb)'::regprocedure);
 amended:=regexp_replace(original,'\mbegin\M',$guard$begin
 if p_data->>'owner' is not null then perform private.require_entitlement((p_data->>'owner')::uuid,'patient_superlink'); end if;
$guard$,'i');
 marker:='if actor=''professional'' and p.professional_id<>(p_data->>''owner'')::uuid then return ''{"error":"portal_unavailable"}''; end if;';
 if position(marker in amended)=0 then raise exception 'unexpected_portal_boundary'; end if;
 amended:=replace(amended,marker,marker||E'\n  perform private.require_entitlement(p.professional_id,''patient_superlink'');\n  if p_action=''export_plan'' then perform private.require_entitlement(p.professional_id,''exports''); end if;');
 execute amended;
 original:=pg_get_functiondef('public.agenda_context(text,date,integer)'::regprocedure);
 marker:='if not found then return jsonb_build_object(''error'',''profile_unavailable''); end if;';
 if position(marker in original)=0 then raise exception 'unexpected_agenda_boundary'; end if;
 amended:=replace(original,marker,marker||E'\n perform private.require_entitlement(p.id,''agenda'');\n perform private.require_entitlement(p.id,''public_profile'');');
 execute amended;
end $$;

-- Agenda's service facade already binds owner_id from Auth in Edge. Guard it
-- in the database before credential reads and calendar/OAuth operations.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('public.agenda_server(text,jsonb)'::regprocedure);
 amended:=regexp_replace(original,'\mbegin\M',$guard$begin
 if owner_id is not null then perform private.require_entitlement(owner_id,'agenda'); end if;
$guard$,'i');
 if amended=original then raise exception 'unexpected_agenda_server'; end if;
 execute amended;
end $$;
