-- Interpretation is independent of mathematical contracts; no historical backfill.
create table public.interpretation_references (
  id text not null,
  version text not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  active boolean not null default true,
  primary key (id, version),
  check (definition->>'id' = id and definition->>'version' = version)
);
alter table public.interpretation_references enable row level security;
revoke all on public.interpretation_references from public, anon, authenticated;
grant select on public.interpretation_references to authenticated;
create policy interpretation_references_read on public.interpretation_references for select to authenticated using (true);

alter table public.consultations add column interpretation_pregnancy boolean;
alter table public.consultation_calculation_results add column interpretation_snapshot jsonb
  check (interpretation_snapshot is null or jsonb_typeof(interpretation_snapshot) = 'object');

create function private.interpretation_condition(c jsonb, ctx jsonb)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare v jsonb := ctx->(c->>'field'); n numeric;
begin
  if v is null or v = 'null'::jsonb or v = '""'::jsonb then return 'missing'; end if;
  if c ? 'equals' and v <> c->'equals' then return 'outside'; end if;
  if c ? 'oneOf' and not ((c->'oneOf') @> jsonb_build_array(v)) then return 'outside'; end if;
  if c ? 'min' or c ? 'max' then
    if jsonb_typeof(v) <> 'number' then return 'outside'; end if;
    n := (v #>> '{}')::numeric;
    if c ? 'min' and (n < (c->>'min')::numeric or (n = (c->>'min')::numeric and not coalesce((c->>'minInclusive')::boolean,false))) then return 'outside'; end if;
    if c ? 'max' and (n > (c->>'max')::numeric or (n = (c->>'max')::numeric and not coalesce((c->>'maxInclusive')::boolean,false))) then return 'outside'; end if;
  end if;
  return 'matches';
end $$;

create function private.interpret_result(code text, val numeric, result_unit text, ctx jsonb, refs jsonb, consultation uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb; c jsonb; rule jsonb; chosen jsonb; first_ref jsonb; missing_ref jsonb;
  applicable jsonb := '[]'; defaults jsonb := '[]'; matched jsonb := '[]'; missing_labels text[]; first_missing text[];
  outside boolean; result jsonb; condition_result text;
begin
  result := jsonb_build_object('state','no_reference','resultCode',code,'value',val,'unit',result_unit,'consultationId',consultation,'context',ctx,'interpretedAt',now(),'reason','Sin referencia de interpretación disponible.','reference',null,'rule',null,'candidates','[]'::jsonb);
  for r in select value from jsonb_array_elements(refs) where value->>'resultCode' = code loop
    first_ref := coalesce(first_ref,r); outside := r->>'unit' <> result_unit; missing_labels := array[]::text[];
    for c in select value from jsonb_array_elements(r->'conditions') loop
      condition_result := private.interpretation_condition(c,ctx);
      if condition_result = 'outside' then outside := true; end if;
      if condition_result = 'missing' then missing_labels := array_append(missing_labels,c->>'label'); end if;
    end loop;
    if not outside and cardinality(missing_labels) = 0 then
      applicable := applicable || jsonb_build_array(r);
      if (r->>'isDefault')::boolean then defaults := defaults || jsonb_build_array(r); end if;
    elsif not outside and missing_ref is null then missing_ref := r; first_missing := missing_labels;
    end if;
  end loop;
  if first_ref is null then return result; end if;
  if jsonb_array_length(defaults) > 0 then applicable := defaults; end if;
  if jsonb_array_length(applicable) > 1 then
    return result || jsonb_build_object('state','requires_decision','reason','Hay varias referencias aplicables; se requiere decisión metodológica.','candidates',(select jsonb_agg((value->>'id') || '@' || (value->>'version')) from jsonb_array_elements(applicable)));
  end if;
  if jsonb_array_length(applicable) = 0 then
    return result || jsonb_build_object('state',case when missing_ref is null then 'not_applicable' else 'missing_context' end,'reference',coalesce(missing_ref,first_ref),'reason',case when missing_ref is null then 'La referencia no aplica al contexto de esta consulta.' else 'Falta: ' || array_to_string(first_missing,', ') || '.' end);
  end if;
  chosen := applicable->0;
  for rule in select value from jsonb_array_elements(chosen->'rules') loop
    if rule->>'lower' is not null and (val < (rule->>'lower')::numeric or (val = (rule->>'lower')::numeric and not (rule->>'lowerInclusive')::boolean)) then continue; end if;
    if rule->>'upper' is not null and (val > (rule->>'upper')::numeric or (val = (rule->>'upper')::numeric and not (rule->>'upperInclusive')::boolean)) then continue; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(rule->'conditions','[]')) as conditions(condition) where private.interpretation_condition(conditions.condition,ctx) <> 'matches') then continue; end if;
    matched := matched || jsonb_build_array(rule);
  end loop;
  return result || jsonb_build_object('reference',chosen,'state',case jsonb_array_length(matched) when 0 then 'not_applicable' when 1 then 'classified' else 'requires_decision' end,'rule',case when jsonb_array_length(matched)=1 then matched->0 else null end,'reason',case jsonb_array_length(matched) when 0 then 'Valor fuera del rango clasificatorio definido por la referencia.' when 1 then '' else 'Existen rangos superpuestos; se requiere decisión metodológica.' end);
end $$;

create function private.snapshot_result_interpretation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare p public.patients; c public.consultations; ctx jsonb; refs jsonb; stage text; pregnant boolean; w numeric; bmi numeric; age_years integer;
begin
  select * into c from public.consultations where id = new.consultation_id;
  select * into p from public.patients where id = new.patient_id;
  if c.professional_id is distinct from auth.uid() or c.status <> 'draft' then raise exception 'Interpretations require an owned draft' using errcode='42501'; end if;
  select a.value #>> '{}' into stage from public.consultation_answers a
    join public.consultation_snapshots s on s.consultation_id=a.consultation_id and s.revision=a.revision
    where a.consultation_id=c.id and a.question_key='life_stage';
  pregnant := case when stage='Embarazo' then true when stage='Ninguna particular' then false else c.interpretation_pregnancy end;
  age_years := case when p.birth_date is null then null else extract(year from age((c.consultation_date at time zone p.timezone)::date,p.birth_date))::integer end;
  if age_years < 0 then age_years := null; end if;
  select (m.value #>> '{}')::numeric into w from public.consultation_measurements m join public.measurement_types t on t.id=m.measurement_type_id where m.consultation_id=c.id and t.code='weight';
  if w > 0 and p.height_cm > 0 then bmi := w / power(p.height_cm/100,2); end if;
  ctx := jsonb_build_object('age',age_years,'sex',p.equation_sex,'birthDate',p.birth_date,'consultationDate',c.consultation_date,'timezone',p.timezone,'pregnant',pregnant,'bmi',bmi);
  -- An unchanged saved result retains the exact original interpretation, even when defaults change.
  if tg_op='UPDATE' and new.raw_result=old.raw_result and new.input_snapshot=old.input_snapshot and new.dependency_snapshot=old.dependency_snapshot and new.result_values=old.result_values and (old.interpretation_snapshot is null or old.interpretation_snapshot->'context'=ctx) then
    new.interpretation_snapshot := old.interpretation_snapshot;
    return new;
  end if;
  select coalesce(jsonb_agg(definition order by id,version),'[]') into refs from public.interpretation_references where active;
  new.interpretation_snapshot := private.interpret_result(new.calculation_code,new.raw_result,new.unit,ctx,refs,new.consultation_id);
  return new;
end $$;

-- PostgreSQL runs same-kind triggers by name: this runs after mathematical validation.
create trigger zz_snapshot_result_interpretation before insert or update on public.consultation_calculation_results
for each row execute function private.snapshot_result_interpretation();
revoke all on function private.snapshot_result_interpretation() from public,anon,authenticated;
revoke all on function private.interpretation_condition(jsonb,jsonb) from public,anon;
revoke all on function private.interpret_result(text,numeric,text,jsonb,jsonb,uuid) from public,anon;
grant execute on function private.interpretation_condition(jsonb,jsonb), private.interpret_result(text,numeric,text,jsonb,jsonb,uuid) to authenticated;

create function public.save_calculations_with_context(p_consultation_id uuid,p_results jsonb,p_pregnancy boolean)
returns setof public.consultation_calculation_results language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.consultations where id=p_consultation_id and professional_id=auth.uid() and status='draft' for update;
  if not found then raise exception 'Interpretations require an owned draft' using errcode='42501'; end if;
  update public.consultations set interpretation_pregnancy=p_pregnancy where id=p_consultation_id and professional_id=auth.uid() and status='draft';
  return query select * from public.save_consultation_calculation_results(p_consultation_id,p_results);
end $$;
revoke all on function public.save_calculations_with_context(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_calculations_with_context(uuid,jsonb,boolean) to authenticated;

-- Seed exported from frontend/src/features/interpretations/references.json.
insert into public.interpretation_references(id,version,definition)
select d->>'id', d->>'version', d from jsonb_array_elements($references$[{"id":"who-adult-bmi","version":"1.0.0","resultCode":"bmi","name":"IMC adulto · OMS","organization":"Organización Mundial de la Salud","year":2000,"sourceVersion":"WHO TRS 894 (2000)","title":"Obesity: preventing and managing the global epidemic","url":"https://www.who.int/publications/i/item/9241208945","locator":"Tabla 2.1; clasificación internacional de IMC adulto","population":"Adultos de 18 años o más, sin gestación","unit":"kg/m²","isDefault":true,"conditions":[{"field":"age","label":"edad en la consulta","min":18,"minInclusive":true},{"field":"pregnant","label":"situación de gestación","equals":false}],"rules":[{"id":"underweight","label":"Bajo peso","description":"IMC por debajo de 18.5 kg/m².","level":0,"lower":0,"upper":18.5,"lowerInclusive":false,"upperInclusive":false},{"id":"normal","label":"Peso normal","description":"Intervalo de peso normal de la referencia.","level":1,"lower":18.5,"upper":25,"lowerInclusive":true,"upperInclusive":false},{"id":"overweight","label":"Sobrepeso / preobesidad","description":"Intervalo de preobesidad; no incluye los grados de obesidad.","level":2,"lower":25,"upper":30,"lowerInclusive":true,"upperInclusive":false},{"id":"obesity-i","label":"Obesidad grado I","description":"Primer grado de obesidad según IMC.","level":3,"lower":30,"upper":35,"lowerInclusive":true,"upperInclusive":false},{"id":"obesity-ii","label":"Obesidad grado II","description":"Segundo grado de obesidad según IMC.","level":4,"lower":35,"upper":40,"lowerInclusive":true,"upperInclusive":false},{"id":"obesity-iii","label":"Obesidad grado III","description":"Tercer grado de obesidad según IMC.","level":5,"lower":40,"upper":null,"lowerInclusive":true,"upperInclusive":false}],"notes":["Los límites se aplican al valor interno, sin redondearlo.","La clasificación general de adultos utiliza 18 años como límite operativo, conforme a la definición de adultos de OMS. No implementa IMC pediátrico."],"limitations":["No distingue grasa de masa muscular; el riesgo varía entre poblaciones.","En personas mayores, alta masa muscular, edema u otras condiciones, requiere valoración profesional. No se inventan puntos de corte especiales.","La clasificación por IMC no sustituye la evaluación nutricional integral."]},{"id":"who-adult-whr","version":"1.0.0","resultCode":"waist_hip_ratio","name":"Cintura-cadera · OMS","organization":"Organización Mundial de la Salud","year":2011,"sourceVersion":"Consulta de expertos 2008; publicación 2011, ISBN 9789241501491","title":"Waist circumference and waist-hip ratio: report of a WHO expert consultation","url":"https://www.who.int/publications/i/item/9789241501491","locator":"Tabla 2: puntos de corte y riesgo de complicaciones metabólicas","population":"Adultos de 18 años o más, sin gestación; variantes por sexo de la referencia","unit":"razón","isDefault":true,"conditions":[{"field":"age","label":"edad en la consulta","min":18,"minInclusive":true},{"field":"sex","label":"sexo para ecuaciones en el expediente","oneOf":["male","female"]},{"field":"pregnant","label":"situación de gestación","equals":false}],"rules":[{"id":"male-below","label":"Por debajo del punto de corte","description":"No equivale a ausencia de riesgo metabólico.","level":0,"lower":0,"upper":0.9,"lowerInclusive":false,"upperInclusive":false,"conditions":[{"field":"sex","label":"sexo","equals":"male"}]},{"id":"male-increased","label":"Riesgo sustancialmente aumentado","description":"Punto de corte asociado con complicaciones metabólicas.","level":1,"lower":0.9,"upper":null,"lowerInclusive":true,"upperInclusive":false,"conditions":[{"field":"sex","label":"sexo","equals":"male"}]},{"id":"female-below","label":"Por debajo del punto de corte","description":"No equivale a ausencia de riesgo metabólico.","level":0,"lower":0,"upper":0.85,"lowerInclusive":false,"upperInclusive":false,"conditions":[{"field":"sex","label":"sexo","equals":"female"}]},{"id":"female-increased","label":"Riesgo sustancialmente aumentado","description":"Punto de corte asociado con complicaciones metabólicas.","level":1,"lower":0.85,"upper":null,"lowerInclusive":true,"upperInclusive":false,"conditions":[{"field":"sex","label":"sexo","equals":"female"}]}],"notes":["Se utiliza el sexo para ecuaciones registrado; no se infiere del género ni del nombre."],"limitations":["La asociación con riesgo varía por edad y población; no es un diagnóstico.","Requiere cintura y cadera medidas con técnica comparable. No aplicar durante gestación."]},{"id":"nice-adult-whtr","version":"1.0.0","resultCode":"waist_height_ratio","name":"Cintura-talla · NICE","organization":"National Institute for Health and Care Excellence","year":2025,"sourceVersion":"NG246, recomendación 1.9.14 [2022]; consultada 2026-09-05","title":"Overweight and obesity management: identifying and assessing overweight, obesity and central adiposity","url":"https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity","locator":"Clasificación de adiposidad central en adultos; IMC inferior a 35 kg/m²","population":"Adultos de 18 años o más, sin gestación, con IMC menor de 35 kg/m²; ambos sexos y todas las etnias","unit":"razón","isDefault":true,"conditions":[{"field":"age","label":"edad en la consulta","min":18,"minInclusive":true},{"field":"bmi","label":"IMC de esta consulta","min":0,"minInclusive":false,"max":35,"maxInclusive":false},{"field":"pregnant","label":"situación de gestación","equals":false}],"rules":[{"id":"healthy","label":"Adiposidad central saludable","description":"Sin incremento de riesgo según este indicador y referencia.","level":0,"lower":0.4,"upper":0.5,"lowerInclusive":true,"upperInclusive":false},{"id":"increased","label":"Adiposidad central aumentada","description":"Asociada con riesgo aumentado.","level":1,"lower":0.5,"upper":0.6,"lowerInclusive":true,"upperInclusive":false},{"id":"high","label":"Adiposidad central alta","description":"Asociada con riesgo aún mayor.","level":2,"lower":0.6,"upper":null,"lowerInclusive":true,"upperInclusive":false}],"notes":["Menos de 0.40 queda fuera del rango clasificatorio definido; no se le asigna una categoría.","Se usa IMC sin redondear de la misma consulta.","Este catálogo integra únicamente la población adulta de la guía."],"limitations":["No aplicar con IMC igual o superior a 35 kg/m² ni durante gestación.","No representa por sí sola un diagnóstico ni reemplaza la valoración integral."]}]$references$::jsonb) d;
