
create function pg_temp.assert_progress(ok boolean, label text) returns void
language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Progress assertion failed: %', label; end if;
end$$;

create temporary table progress_fixture (
  owner_id uuid, outsider uuid, patient_id uuid, other_patient uuid,
  source_id uuid, followup_id uuid, other_followup uuid,
  snapshot_id uuid, third_id uuid, request_id uuid default gen_random_uuid(),
  revision jsonb default '{"instructions":"Cuida el registro","goals":[{"id":"goal-0","text":"Editado","assessment":{"status":"partial","result":"3 de 5 días","note":""}}],"strategies":[]}'
);
grant select on progress_fixture to authenticated;

do $$
declare
  owner_id uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  patient_id uuid := gen_random_uuid();
  other_patient uuid := gen_random_uuid();
  source_id uuid := gen_random_uuid();
  followup_id uuid := gen_random_uuid();
  other_followup uuid := gen_random_uuid();
  third_id uuid := gen_random_uuid();
  snapshot_id uuid;
  records jsonb := '{"pes":{"approved_at":"pes-approved"},"objective":{"approved_at":"goal-approved","pes_approved_at":"pes-approved","question_key":"treatment_objective","smart_plan":{"version":1,"pesApprovedAt":"pes-approved","goals":[{"outcome":"Registrar comida"},{"outcome":"Planear la semana"}]}}}';
begin
  insert into public.professional_profiles values (owner_id), (outsider);
  insert into public.patients(id,professional_id,full_name) values (patient_id,owner_id,'Paciente sintético'), (other_patient,owner_id,'Otro paciente sintético');
  insert into public.consultations(id,professional_id,patient_id,status,consultation_date,sequence_number,consultation_type)
  values (source_id,owner_id,patient_id,'completed','2026-11-01 16:00Z',1,'initial'),
    (followup_id,owner_id,patient_id,'completed','2026-11-09 16:00Z',2,'follow_up'),
    (third_id,owner_id,patient_id,'draft','2026-11-14 16:00Z',3,'follow_up'),
    (other_followup,owner_id,other_patient,'draft','2026-11-09 16:00Z',2,'follow_up');
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,structure,clinical_records)
    values(owner_id,patient_id,source_id,1,'{"sections":[]}',records) returning id into snapshot_id;
  insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,structure)
    values(owner_id,patient_id,followup_id,1,'{"sections":[]}'),(owner_id,patient_id,third_id,1,'{"sections":[]}');
  insert into public.consultation_answers(professional_id,patient_id,consultation_id,revision,question_key,value)
    values(owner_id,patient_id,source_id,1,'first_actions','"Indicación original"');
  update public.consultation_snapshots set clinical_records=records where id=snapshot_id;
  insert into public.consultation_interventions(snapshot_id,professional_id,state,version,approved)
    values (snapshot_id,owner_id,'completed',1,'{"document":{"objectiveApprovedAt":"goal-approved","pesApprovedAt":"pes-approved","strategy":{"title":"Anotar diariamente","priority":1,"goalIndexes":[0]}}}'),
      (snapshot_id,owner_id,'approved',1,'{"document":{"objectiveApprovedAt":"goal-approved","pesApprovedAt":"pes-approved","strategy":{"title":"Preparar menú","priority":2,"goalIndexes":[1]}}}'),
      (snapshot_id,owner_id,'draft',0,null);
  insert into progress_fixture(owner_id,outsider,patient_id,other_patient,source_id,followup_id,other_followup,snapshot_id,third_id)
    values (owner_id,outsider,patient_id,other_patient,source_id,followup_id,other_followup,snapshot_id,third_id);
end $$;

select set_config('request.jwt.claim.sub',owner_id::text,true) from progress_fixture;
set local role authenticated;
do $$
declare f record; sources jsonb; first_id uuid; second_id uuid := gen_random_uuid(); altered jsonb;
begin
  select * into f from pg_temp.progress_fixture;
  perform pg_temp.assert_progress(public.patient_clinical_progress_sources(f.other_patient)='[]','new patient has an empty history');
  sources := public.patient_clinical_progress_sources(f.patient_id);
  perform pg_temp.assert_progress(jsonb_array_length(sources)=2 and sources#>>'{0,id}'=f.followup_id::text, 'closed empty visit is available, draft is excluded');
  select value into sources from jsonb_array_elements(sources) where value->>'id'=f.source_id::text;
  perform pg_temp.assert_progress(jsonb_array_length(sources#>'{objective,goals}')=2, 'both objectives returned');
  perform pg_temp.assert_progress(jsonb_array_length(sources->'strategies')=2, 'two approved strategies, excluding draft');
  perform pg_temp.assert_progress(sources#>>'{instructions,0,value}'='Indicación original', 'original instructions');

  select id into first_id from public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.followup_id,0,f.request_id,f.revision);
  perform pg_temp.assert_progress(first_id=f.request_id, 'first review saved');
  perform pg_temp.assert_progress(
    (select version=1 and review_consultation_id=f.followup_id and review_consultation_date='2026-11-09 16:00Z'
      from public.patient_clinical_progress_reviews where id=first_id), 'visit and date linked');
  perform pg_temp.assert_progress(
    (select id=first_id from public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.followup_id,0,f.request_id,f.revision)),
    'retry returns existing revision');

  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.followup_id,0,gen_random_uuid(),f.revision);
    raise exception 'stale version accepted';
  exception when raise_exception then if sqlerrm <> 'progress_conflict' then raise; end if;
  end;
  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.other_followup,1,gen_random_uuid(),f.revision);
    raise exception 'other patient linked';
  exception when raise_exception then if sqlerrm <> 'progress_unavailable' then raise; end if;
  end;
  altered:=jsonb_set(f.revision,'{strategies}','[{"id":"strategy","text":"Estrategia","goalIds":["missing"],"assessment":{"status":"partial"}}]');
  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.third_id,1,gen_random_uuid(),altered);
    raise exception 'dangling strategy link accepted';
  exception when raise_exception then if sqlerrm <> 'progress_invalid' then raise; end if;
  end;
  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.third_id,1,gen_random_uuid(),
      jsonb_set(f.revision,'{goals,0,text}',to_jsonb(E' \n\t'::text)));
    raise exception 'blank goal accepted';
  exception when raise_exception then if sqlerrm <> 'progress_invalid' then raise; end if;
  end;
  perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.third_id,1,second_id,
    '{"goals":[],"strategies":[],"instructions":""}');
  perform pg_temp.assert_progress(
    (select count(*)=2 and min(version)=1 and max(version)=2 from public.patient_clinical_progress_reviews),
    'both versions retained');
  perform pg_temp.assert_progress(
    (select document->>'instructions'='Cuida el registro' from public.patient_clinical_progress_reviews where id=first_id),
    'first saved text unchanged');
  select value into sources from jsonb_array_elements(public.patient_clinical_progress_sources(f.patient_id)) where value->>'id'=f.source_id::text;
  perform pg_temp.assert_progress(sources#>'{latest_review,document}'='{"goals":[],"strategies":[],"instructions":""}', 'removed agreements stay removed');
  perform pg_temp.assert_progress(sources#>>'{latest_review,review_consultation_id}'=f.third_id::text,'revision belongs to third visit');
  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,f.followup_id,2,gen_random_uuid(),f.revision);
    raise exception 'older visit overwrote latest review';
  exception when raise_exception then if sqlerrm <> 'progress_later_review' then raise; end if;
  end;
  perform pg_temp.assert_progress(sources#>>'{instructions,0,value}'='Indicación original', 'original text unchanged');
  perform public.save_patient_clinical_progress(f.patient_id,f.followup_id,1,f.third_id,0,gen_random_uuid(),f.revision);
  perform pg_temp.assert_progress(exists(select 1 from public.patient_clinical_progress_reviews where source_consultation_id=f.followup_id), 'new objective from a closed empty visit');
  begin
    update public.patient_clinical_progress_reviews set document='{}' where id=first_id;
    raise exception 'direct update permitted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',f.outsider::text,true);
  perform pg_temp.assert_progress(public.patient_clinical_progress_sources(f.patient_id)='[]', 'unrelated professional sees no sources');
  perform pg_temp.assert_progress((select count(*)=0 from public.patient_clinical_progress_reviews), 'unrelated professional sees no reviews');
  begin
    perform public.save_patient_clinical_progress(f.patient_id,f.source_id,1,null,2,gen_random_uuid(),f.revision);
    raise exception 'unrelated professional could write';
  exception when raise_exception then if sqlerrm <> 'progress_unavailable' then raise; end if;
  end;
end $$;
reset role;

update public.consultations set status='draft' where id=(select source_id from progress_fixture);
insert into public.consultation_snapshots(professional_id,patient_id,consultation_id,revision,structure)
select owner_id,patient_id,source_id,2,'{"sections":[]}' from progress_fixture;
select set_config('request.jwt.claim.sub',owner_id::text,true) from progress_fixture;
set local role authenticated;
select pg_temp.assert_progress(
  (select (s->>'current')::boolean=false from progress_fixture f cross join lateral
    jsonb_array_elements(public.patient_clinical_progress_sources(f.patient_id)) s where s->>'id'=f.source_id::text),
  'review history remains readable after reopening the source');
reset role;
select 'PASS progress sources, history, retries, stale edits, and tenant isolation';
