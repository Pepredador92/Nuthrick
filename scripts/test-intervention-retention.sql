create temporary table retention_assertions(label text);
create function pg_temp.assert_retention(ok boolean,label text) returns void
language plpgsql security definer set search_path='' as $$begin
 if ok is distinct from true then raise exception 'Retention assertion failed: %',label; end if;
 insert into pg_temp.retention_assertions values(label);
end $$;
create temporary table retention_fixture(owner_id uuid,other_id uuid,selected_ids uuid[],other_visit uuid);
create temporary table retention_visits(visit uuid,allowed boolean,status text);
create temporary table retention_cases(visit uuid,action text,data jsonb,allowed boolean,expected_state text);
grant select on retention_fixture,retention_visits,retention_cases to authenticated;

do $$
declare
 owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); plan_id uuid:=gen_random_uuid(); other_plan uuid:=gen_random_uuid();
 selected_ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; excluded uuid:=gen_random_uuid();
 pat uuid; visit uuid; snap uuid; ident uuid; selected boolean; status text; action text; item_state text; approved_item boolean; stamp timestamptz;
 strategy jsonb; doc jsonb; records jsonb; approved jsonb; goal jsonb;
begin
 insert into public.professional_profiles values(owner_id),(other_id);
 insert into private.plans values(plan_id,'respaldo'),(other_plan,'profesional');
 insert into private.professional_access values(owner_id,plan_id,'live'),(other_id,other_plan,'live');
 insert into private.billing_retention values(owner_id,'live',now()-interval '1 day',now()+interval '30 days',selected_ids);
 foreach pat in array selected_ids||excluded loop
  insert into public.patients(id,professional_id,full_name) values(pat,owner_id,'SYNTHETIC RETENTION');
 end loop;
 select jsonb_object_agg(field,'Contenido sintético') into strategy from unnest(array['title','action','etiologyLink','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','adjustmentCriteria','access','dose','composition','educationTopic','materials','comprehensionCheck','coordinationWith','coordinationReason','referenceTitle','referenceUrl','referenceVersion','referenceNotes']) field;
 strategy:=strategy||'{"category":"education","route":"not_applicable","agreement":"patient","priority":1,"goalIndexes":[0],"evidence":[],"referenceIds":[],"missingContext":[],"referenceUrl":""}';
 doc:=jsonb_build_object('version',1,'pesApprovedAt','2026-10-18T12:00:00Z','objectiveApprovedAt','2026-10-18T12:10:00Z','strategy',strategy);
 goal:='{"outcome":"Mejorar ingesta","etiology":"Falta de conocimientos","sign":"Registro sintético","indicator":"Ingesta","baseline":"Registro fechado","target":"Meta acordada","timeframe":"Próxima consulta","monitoring":"Registro dietético","feasibility":"Apoyo disponible","agreement":"patient"}';
 records:=jsonb_build_object('pes',jsonb_build_object('approved_at',doc->>'pesApprovedAt'),'objective',jsonb_build_object('approved_at',doc->>'objectiveApprovedAt','pes_approved_at',doc->>'pesApprovedAt','pes_statement','Enunciado sintético','smart_plan',jsonb_build_object('version',1,'pesApprovedAt',doc->>'pesApprovedAt','goals',jsonb_build_array(goal))));
 foreach status in array array['draft','completed'] loop
  foreach selected in array array[false,true] loop
   pat:=case when selected then selected_ids[1] else excluded end;
   visit:=gen_random_uuid();
   insert into public.consultations(id,professional_id,patient_id,status,consultation_date) values(visit,owner_id,pat,status,'2026-10-18');
   insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,template_name,template_version,structure)
    values(owner_id,pat,visit,1,'Synthetic retention',1,'{"sections":[{"questions":[{"question_key":"pes_statement"}]}]}') returning id into snap;
   insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,question_key,value)
    select owner_id,pat,visit,1,key,value from jsonb_each('{"pes_problem":"Ingesta insuficiente","pes_etiology":"Falta de conocimientos","pes_evidence":"Registro sintético","pes_statement":"Enunciado sintético"}');
   update public.consultation_snapshots set clinical_records=records where id=snap;
   insert into retention_visits values(visit,selected,status);
   foreach action in array case when status='draft' then array['save','approve','delete','revert','start','communicate','complete','withdraw'] else array['start','communicate','complete','withdraw'] end loop
    ident:=gen_random_uuid();
    approved_item:=action in ('revert','start','communicate','complete','withdraw');
    item_state:=case when action in ('complete','withdraw') then 'executing' when approved_item then 'approved' else 'draft' end;
    approved:=case when approved_item then jsonb_build_object('document',doc,'version',1,'approvedAt','2026-10-18T12:20:00Z') else null end;
    insert into public.consultation_interventions(id,snapshot_id,professional_id,draft,approved,version,state)
     values(ident,snap,owner_id,case when not approved_item or action='revert' then doc end,approved,case when approved_item then 1 else 0 end,item_state) returning updated_at into stamp;
    insert into retention_cases values(visit,action,jsonb_build_object('id',ident,'expectedUpdatedAt',stamp,'document',doc,'executor','Paciente sintético','startDate','2026-10-18','recipient','Cuidador sintético','reason','Resultado sintético'),selected,
      case action when 'save' then 'draft' when 'approve' then 'approved' when 'delete' then null when 'start' then 'executing' when 'complete' then 'completed' when 'withdraw' then 'withdrawn' else item_state end);
   end loop;
  end loop;
 end loop;
 pat:=gen_random_uuid();visit:=gen_random_uuid();
 insert into public.patients(id,professional_id,full_name) values(pat,other_id,'SYNTHETIC STANDARD PLAN');
 insert into public.consultations(id,professional_id,patient_id,status) values(visit,other_id,pat,'draft');
 insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,structure) values(other_id,pat,visit,1,'{"sections":[]}');
 insert into retention_fixture values(owner_id,other_id,selected_ids,visit);
end $$;

select set_config('request.jwt.claim.sub',owner_id::text,true) from retention_fixture;
set local role authenticated;
do $$declare item record; before_value jsonb; result jsonb; actual text;before_history bigint;begin
 for item in select * from pg_temp.retention_visits loop
  result:=public.clinical_interventions(item.visit,1);
  perform pg_temp.assert_retention(jsonb_typeof(result->'items')='array',format('Own %s history readable: selected=%s',item.status,item.allowed));
 end loop;
 for item in select c.*,v.status from pg_temp.retention_cases c join pg_temp.retention_visits v using(visit) order by c.allowed,c.action loop
  if not item.allowed then
   select to_jsonb(i) into before_value from public.consultation_interventions i where id=(item.data->>'id')::uuid;
   select count(*) into before_history from public.consultation_intervention_history where intervention_id=(item.data->>'id')::uuid;
   begin
    perform public.clinical_interventions(item.visit,1,item.action,item.data);
    raise exception 'Excluded Respaldo patient accepted % in % consultation',item.action,item.status;
   exception when insufficient_privilege then
    if sqlerrm<>'retention_patient_read_only' then raise; end if;
    perform pg_temp.assert_retention(true,format('Excluded patient denied %s (%s)',item.action,item.status));
   end;
   perform pg_temp.assert_retention((select to_jsonb(i)=before_value from public.consultation_interventions i where id=(item.data->>'id')::uuid),format('Rejected %s preserves strategy',item.action));
   perform pg_temp.assert_retention((select count(*)=before_history from public.consultation_intervention_history where intervention_id=(item.data->>'id')::uuid),format('Rejected %s preserves history',item.action));
  else
   result:=public.clinical_interventions(item.visit,1,item.action,item.data);
   select i.state into actual from public.consultation_interventions i where id=(item.data->>'id')::uuid;
   perform pg_temp.assert_retention(actual is not distinct from item.expected_state,format('Selected patient permits %s (%s)',item.action,item.status));
  end if;
 end loop;
end $$;
reset role;

do $$declare ids record;item record;pat uuid;result jsonb;begin
 select * into ids from pg_temp.retention_fixture;
 foreach pat in array ids.selected_ids loop
  perform private.require_retention_patient(ids.owner_id,pat);
  perform pg_temp.assert_retention(true,'Each of the five selected patient slots remains writable');
 end loop;
 select * into item from pg_temp.retention_cases where allowed and action='save' limit 1;
 perform set_config('nuthrick.test_account_read_only','true',true);
 begin
  perform public.clinical_interventions(item.visit,1,'save',item.data);
  raise exception 'Account read-only check bypassed';
 exception when insufficient_privilege then if sqlerrm<>'account_read_only' then raise;end if;end;
 perform pg_temp.assert_retention(true,'General account read-only check remains enforced');
 perform set_config('nuthrick.test_account_read_only','false',true);
 update private.billing_retention set ends_at=now()-interval '1 minute';
 begin perform public.clinical_interventions(item.visit,1,'save',item.data);raise exception 'Expired retention accepted';
 exception when insufficient_privilege then if sqlerrm<>'retention_patient_read_only' then raise;end if;end;
 perform pg_temp.assert_retention(true,'Expired retention cannot write a formerly selected patient');
 update private.billing_retention set ends_at=now()+interval '1 day',mode='test';
 begin perform public.clinical_interventions(item.visit,1,'save',item.data);raise exception 'Wrong billing mode accepted';
 exception when insufficient_privilege then if sqlerrm<>'retention_patient_read_only' then raise;end if;end;
 perform pg_temp.assert_retention(true,'Retention from another billing mode cannot authorize a write');
 perform set_config('request.jwt.claim.sub',ids.other_id::text,true);
 result:=public.clinical_interventions(ids.other_visit,1,'save',jsonb_build_object('id',gen_random_uuid(),'expectedUpdatedAt',null,'document',item.data->'document'));
 perform pg_temp.assert_retention(jsonb_array_length(result->'items')=1,'A non-Respaldo professional can still save a strategy');
 perform set_config('request.jwt.claim.sub',ids.owner_id::text,true);
 begin perform public.clinical_interventions(ids.other_visit,1);raise exception 'Foreign professional accepted';
 exception when raise_exception then if sqlerrm<>'context_unavailable' then raise;end if;end;
 perform pg_temp.assert_retention(true,'Another professional consultation remains inaccessible');
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.clinical_interventions(item.visit,1);raise exception 'Anonymous identity accepted';
 exception when insufficient_privilege then if sqlerrm<>'context_unavailable' then raise;end if;end;
 perform pg_temp.assert_retention(true,'Missing identity remains rejected');
end $$;
select pg_temp.assert_retention(not has_function_privilege('anon','public.clinical_interventions(uuid,integer,text,jsonb)','execute'),'Anonymous RPC execution stays revoked');
select pg_temp.assert_retention(not has_function_privilege('authenticated','private.require_retention_patient(uuid,uuid)','execute'),'Patient authorization helper remains internal');
select pg_temp.assert_retention(not (select prosecdef from pg_proc where oid='public.clinical_interventions(uuid,integer,text,jsonb)'::regprocedure),'Public RPC stays security invoker');
select pg_temp.assert_retention(not has_table_privilege('authenticated','public.consultation_interventions','insert,update,delete'),'Direct authenticated strategy writes stay revoked');
select jsonb_build_object('result','Intervention retention checks passed','assertions',count(*)) from retention_assertions;
