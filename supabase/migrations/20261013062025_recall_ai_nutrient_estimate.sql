-- Reviewed AI intake estimates are separate from frozen manual catalog items.
-- Only the current owned draft can accept/withdraw one. Closed revisions stay intact.
create function private.valid_recall_estimate(p_estimate jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare meal jsonb; note jsonb; key text; cap numeric; total numeric;
begin
  if jsonb_typeof(p_estimate) is distinct from 'object'
    or p_estimate->>'confidence' is null or p_estimate->>'confidence' not in ('low','moderate','high')
    or jsonb_typeof(p_estimate->'meals') is distinct from 'array'
    or jsonb_array_length(p_estimate->'meals') not between 1 and 12
    or exists(select 1 from jsonb_object_keys(p_estimate) k where k not in ('meals','assumptions','uncertainties','confidence')) then return false; end if;
  foreach key in array array['assumptions','uncertainties'] loop
    if jsonb_typeof(p_estimate->key) is distinct from 'array' or jsonb_array_length(p_estimate->key)>20 then return false; end if;
    for note in select value from jsonb_array_elements(p_estimate->key) loop
      if jsonb_typeof(note) is distinct from 'string' or length(btrim(note#>>'{}')) not between 1 and 1000 then return false; end if;
    end loop;
  end loop;
  for meal in select value from jsonb_array_elements(p_estimate->'meals') loop
    if jsonb_typeof(meal) is distinct from 'object'
      or jsonb_typeof(meal->'mealLabel') is distinct from 'string' or length(btrim(meal->>'mealLabel')) not between 1 and 120
      or jsonb_typeof(meal->'description') is distinct from 'string' or length(btrim(meal->>'description')) not between 1 and 1000
      or exists(select 1 from jsonb_object_keys(meal) k where k not in ('mealLabel','description','energy_kcal','protein_g','carbohydrate_g','fat_g')) then return false; end if;
    foreach key in array array['energy_kcal','protein_g','carbohydrate_g','fat_g'] loop
      cap:=case when key='energy_kcal' then 10000 else 1000 end;
      if jsonb_typeof(meal->key) is distinct from 'number' or (meal->>key)::numeric not between 0 and cap then return false; end if;
    end loop;
  end loop;
  foreach key in array array['energy_kcal','protein_g','carbohydrate_g','fat_g'] loop
    cap:=case when key='energy_kcal' then 30000 else 3000 end;
    select sum((m->>key)::numeric) into total from jsonb_array_elements(p_estimate->'meals') m;
    if total>cap then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_recall_estimate(jsonb) from public,anon,authenticated,service_role;

create function private.clinical_recall_estimate(p_consultation uuid,p_revision integer,p_action text,p_payload jsonb,p_generation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots;
  context jsonb; g private.ai_generations; audit jsonb; saved jsonb;
begin
  if owner is null then raise exception 'context_unavailable' using errcode='42501'; end if;
  perform private.require_entitlement(owner,'consultations');
  select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null and status='draft' for update;
  if not found then raise exception 'context_unavailable'; end if;
  select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner and patient_id=c.patient_id order by revision desc limit 1 for update;
  if s.id is null or s.revision is distinct from p_revision then raise exception 'context_changed'; end if;
  if p_action is null or p_action not in ('approve','remove') or p_payload is null or octet_length(p_payload::text)>80000 then raise exception 'invalid_request'; end if;
  context:=public.ai_clinical_source(owner,c.patient_id,c.id,p_revision);
  if p_payload->>'stamp' is distinct from context->>'stamp' then raise exception 'context_changed'; end if;
  if p_action='remove' then
    update public.consultation_snapshots set clinical_records=(clinical_records-'recall'-'pes'-'objective')||jsonb_build_object('updated_at',clock_timestamp()) where id=s.id;
    return jsonb_build_object('removed',true);
  end if;
  if p_payload->>'method' is distinct from 'ai_estimate' or jsonb_typeof(p_payload->'narrative') is distinct from 'string'
    or length(btrim(p_payload->>'narrative')) not between 1 and 8000 or not private.valid_recall_estimate(p_payload->'estimate') then raise exception 'invalid_request'; end if;
  if p_generation is not null then
    select * into g from private.ai_generations where id=p_generation and professional_id=owner and patient_id=c.patient_id
      and consultation_id=c.id and clinical_revision=p_revision and feature='recall_24h' and prompt_version='recall_24h@3' and status='succeeded';
    if not found then raise exception 'generation_unavailable'; end if;
    audit:=jsonb_build_object('generated_with_ai',true,'generation_id',g.id,'prompt_version',g.prompt_version,'model',g.model,'generated_at',g.started_at);
  elsif s.clinical_records->'recall'->>'method'='ai_estimate' and s.clinical_records->'recall'->>'approved_at' is not null then
    audit:=jsonb_build_object('generated_with_ai',true,'generation_id',s.clinical_records->'recall'->'generation_id',
      'prompt_version',s.clinical_records->'recall'->'prompt_version','model',s.clinical_records->'recall'->'model','generated_at',s.clinical_records->'recall'->'generated_at');
  else raise exception 'generation_unavailable'; end if;
  saved:=audit||jsonb_build_object('method','ai_estimate','schema_version',2,'approved_at',clock_timestamp(),
    'narrative',p_payload->>'narrative','estimate',p_payload->'estimate','items','[]'::jsonb);
  update public.consultation_snapshots set clinical_records=jsonb_set(clinical_records-'pes'-'objective','{recall}',saved)||jsonb_build_object('updated_at',clock_timestamp()) where id=s.id;
  return saved;
end $$;
revoke all on function private.clinical_recall_estimate(uuid,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.clinical_recall_estimate(uuid,integer,text,jsonb,uuid) to authenticated;
create function public.clinical_recall_estimate(p_consultation uuid,p_revision integer,p_action text,p_payload jsonb,p_generation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.clinical_recall_estimate(p_consultation,p_revision,p_action,p_payload,p_generation);
$$;
revoke all on function public.clinical_recall_estimate(uuid,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.clinical_recall_estimate(uuid,integer,text,jsonb,uuid) to authenticated;

-- Both diet paths receive the approved estimate; the raw narrative stays out of diet prompts.
do $$
declare signature text; definition text; amended text;
begin
  foreach signature in array array['public.ai_diet_source(uuid,uuid,integer)','public.ai_text_diet_source(uuid,uuid,integer)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    amended:=replace(definition,
      '''approved_at'',s.clinical_records->''recall''->>''approved_at'',',
      '''approved_at'',s.clinical_records->''recall''->>''approved_at'',
       ''method'',s.clinical_records->''recall''->>''method'',
       ''estimate'',case when s.clinical_records->''recall''->>''method''=''ai_estimate'' then s.clinical_records->''recall''->''estimate'' else null end,');
    if amended=definition then raise exception 'recall_diet_projection_patch_failed: %',signature; end if;
    execute amended;
  end loop;
end $$;

-- Deploy compatible adapters before activating the new output schema.
update private.ai_feature_config set prompt_version='recall_24h@3',max_output_tokens=4096,updated_at=now()
  where feature='recall_24h' and prompt_version='recall_24h@1';
notify pgrst,'reload schema';
