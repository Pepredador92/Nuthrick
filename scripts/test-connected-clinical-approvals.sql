create temporary table flow_results(label text);
create function pg_temp.check_flow(ok boolean,label text) returns void language plpgsql security definer set search_path='' as $$begin
 if ok is distinct from true then raise exception 'Clinical flow assertion: %',label; end if;
 insert into pg_temp.flow_results values(label);
end $$;
create function pg_temp.compose_test(goal jsonb) returns text language sql security definer set search_path='' as $$select private.compose_nutrition_objective(goal)$$;
create function pg_temp.save_test(visit uuid,answers jsonb) returns void language sql security definer set search_path='' as $$select public.save_consultation_responses(visit,1,answers)$$;
create temporary table flow_visits(visit uuid,question text,layout text);
grant select on flow_visits to authenticated;
do $$declare owner_id uuid:=gen_random_uuid(); pat uuid:=gen_random_uuid(); visit uuid; layout text; question text; config jsonb; begin
 insert into public.professional_profiles values(owner_id);
 insert into public.patients(id,professional_id,full_name) values(pat,owner_id,'SYNTHETIC CLINICAL FLOW');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 foreach layout in array array['follow_up','initial','english_repeatable','string_array'] loop
  visit:=gen_random_uuid();question:=case when layout='initial' then 'treatment_objective' else 'next_objectives' end;
  config:=case when layout='initial' then '{}'::jsonb else jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('key',case when layout='english_repeatable' then 'objective' else 'objetivo' end,'label',case when layout='english_repeatable' then 'Objective' else 'Objetivo' end))) end;
  insert into public.consultations(id,professional_id,patient_id,status,consultation_type) values(visit,owner_id,pat,'draft',case when layout='initial' then 'initial' else 'follow_up' end);
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,structure)
   values(owner_id,pat,visit,1,jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('question_key','pes_statement'),jsonb_build_object('question_key',question,'configuration',config))))));
  insert into flow_visits values(visit,question,layout);
 end loop;
end $$;
set local role authenticated;
do $$declare f record; pes jsonb; goal jsonb; plan jsonb; goals jsonb; answer jsonb; w jsonb; strategy jsonb; doc jsonb; sid uuid; item jsonb; approved_at text; pes_at text; visit_version integer; key text; begin
 for f in select * from pg_temp.flow_visits loop
  pes:=jsonb_build_object('problem','Patrón de comidas irregular','etiology','Horarios variables','signsSymptoms',jsonb_build_array('Omisión de comidas referida'),'evidence',jsonb_build_array(),'missingContext',jsonb_build_array(),'uncertainties',jsonb_build_array(),'evidenceReviewed',true);
  pes:=pes||jsonb_build_object('pesStatement','Patrón de comidas irregular relacionado con Horarios variables, evidenciado por Omisión de comidas referida.','stamp',public.clinical_workspace(f.visit,1)->>'stamp');
  w:=public.clinical_workspace(f.visit,1,'pes',pes);pes_at:=w->>'approved_at';
  goal:='{"outcome":"Anota cuándo haces tus comidas","etiology":"Horarios variables","sign":"Omisión de comidas referida","indicator":"Comidas anotadas","baseline":"Omisión referida","target":"Llevar un registro que podamos revisar","timeframe":"Próxima consulta acordada","monitoring":"Revisaremos tus anotaciones","feasibility":"Registro disponible","agreement":"patient","textStyle":"patient_v1"}';
  goals:=jsonb_build_array(goal,goal||jsonb_build_object('outcome','Anota cómo te sientes después de comer'));
  plan:=jsonb_build_object('version',1,'pesApprovedAt',pes_at,'goals',goals);
  if f.layout='initial' then
   select to_jsonb(string_agg(pg_temp.compose_test(g),E'\n\n' order by n)) into answer from jsonb_array_elements(goals) with ordinality a(g,n);
  elsif f.layout='string_array' then
   select jsonb_agg(pg_temp.compose_test(g) order by n) into answer from jsonb_array_elements(goals) with ordinality a(g,n);
  else
   key:=case when f.layout='english_repeatable' then 'objective' else 'objetivo' end;
   select jsonb_agg(jsonb_build_object(key,pg_temp.compose_test(g),'prioridad','Principal') order by n) into answer from jsonb_array_elements(goals) with ordinality a(g,n);
  end if;
  perform pg_temp.save_test(f.visit,jsonb_build_object(f.question,answer));
  w:=public.clinical_objective(f.visit,1);
  w:=public.clinical_objective(f.visit,1,'approve',w->>'stamp',f.question,plan);
  approved_at:=w->'objective'->>'approved_at';
  perform pg_temp.check_flow(approved_at is not null,f.layout||': two goals approved');
  select jsonb_object_agg(field,'') into strategy from unnest(array['title','action','etiologyLink','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','adjustmentCriteria','access','dose','composition','educationTopic','materials','comprehensionCheck','coordinationWith','coordinationReason','referenceTitle','referenceUrl','referenceVersion','referenceNotes']) field;
  strategy:=strategy||'{"title":"Prepara una opción para llevar","action":"Elige una comida que puedas llevar al trabajo.","category":"education","route":"not_applicable","agreement":"pending","priority":1,"goalIndexes":[0,1],"evidence":[],"referenceIds":[],"missingContext":[]}';
  doc:=jsonb_build_object('version',1,'pesApprovedAt',pes_at,'objectiveApprovedAt',approved_at,'strategy',strategy);sid:=gen_random_uuid();
  w:=public.clinical_interventions(f.visit,1,'approve',jsonb_build_object('id',sid,'document',doc));item:=w->'items'->0;
  perform pg_temp.check_flow(item->>'state'='approved' and item->>'requiresReview'='false',f.layout||': minimal strategy approved');
  w:=public.clinical_objective(f.visit,1,'approve',public.clinical_objective(f.visit,1)->>'stamp',f.question,plan);
  perform pg_temp.check_flow(w->'objective'->>'approved_at'=approved_at,f.layout||': repeated objective approval preserves identity');
  w:=public.clinical_objective(f.visit,1,'save',public.clinical_objective(f.visit,1)->>'stamp',f.question,plan);
  perform pg_temp.check_flow(w->'objective'->>'approved_at'=approved_at,f.layout||': unchanged save preserves approval');
  w:=public.clinical_interventions(f.visit,1,'approve',jsonb_build_object('id',sid,'expectedUpdatedAt',item->>'updated_at','document',doc));item:=w->'items'->0;
  perform pg_temp.check_flow(item->>'version'='1' and jsonb_array_length(item->'history')=1,f.layout||': repeated strategy approval is idempotent');
  pes:=pes||jsonb_build_object('stamp',public.clinical_workspace(f.visit,1)->>'stamp');
  w:=public.clinical_workspace(f.visit,1,'pes',pes);
  perform pg_temp.check_flow(w->>'approved_at'=pes_at,f.layout||': identical PES keeps approval');
  w:=public.clinical_interventions(f.visit,1);
  perform pg_temp.check_flow(w->'items'->0->>'requiresReview'='false',f.layout||': reloaded strategy stays approved');
  plan:=jsonb_set(plan,'{goals,0,target}',to_jsonb('Meta revisada con el paciente'::text));
  w:=public.clinical_objective(f.visit,1,'save',public.clinical_objective(f.visit,1)->>'stamp',f.question,plan);
  perform pg_temp.check_flow(w->'objective'='null'::jsonb,f.layout||': a changed goal requires its own approval');
  w:=public.clinical_interventions(f.visit,1);
  perform pg_temp.check_flow(w->'items'->0->>'requiresReview'='true',f.layout||': changed approved context is identified');
 end loop;
end $$;
reset role;
select 'PASS '||label from flow_results;
