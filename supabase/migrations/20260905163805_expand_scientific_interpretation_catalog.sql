-- Objective 6B: scientifically supported descriptive interpretation for
-- Heath-Carter components and the complete somatotype. No mathematical
-- calculation is changed and no historical result is backfilled.

create or replace function private.heath_carter_somatotype_category(deps jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  endo numeric;
  meso numeric;
  ecto numeric;
begin
  if not (
    deps ? 'somatotype_endomorphy'
    and deps ? 'somatotype_mesomorphy'
    and deps ? 'somatotype_ectomorphy'
  ) then
    return null;
  end if;
  begin
    endo := (deps->>'somatotype_endomorphy')::numeric;
    meso := (deps->>'somatotype_mesomorphy')::numeric;
    ecto := (deps->>'somatotype_ectomorphy')::numeric;
  exception when others then
    return null;
  end;

  if greatest(endo, meso, ecto) - least(endo, meso, ecto) <= 1 then
    return 'central';
  elsif abs(endo - meso) <= .5 and ecto < least(endo, meso) then
    return 'mesomorph-endomorph';
  elsif abs(meso - ecto) <= .5 and endo < least(meso, ecto) then
    return 'mesomorph-ectomorph';
  elsif abs(endo - ecto) <= .5 and meso < least(endo, ecto) then
    return 'endomorph-ectomorph';
  elsif endo > meso and endo > ecto then
    if abs(meso - ecto) <= .5 then return 'balanced-endomorph'; end if;
    if meso > ecto then return 'mesomorphic-endomorph'; end if;
    return 'ectomorphic-endomorph';
  elsif meso > endo and meso > ecto then
    if abs(endo - ecto) <= .5 then return 'balanced-mesomorph'; end if;
    if endo > ecto then return 'endomorphic-mesomorph'; end if;
    return 'ectomorphic-mesomorph';
  elsif ecto > endo and ecto > meso then
    if abs(endo - meso) <= .5 then return 'balanced-ectomorph'; end if;
    if endo > meso then return 'endomorphic-ectomorph'; end if;
    return 'mesomorphic-ectomorph';
  end if;
  return null;
end;
$$;

revoke all on function private.heath_carter_somatotype_category(jsonb) from public, anon;
grant execute on function private.heath_carter_somatotype_category(jsonb) to authenticated;

create or replace function private.interpret_result(
  code text,
  val numeric,
  result_unit text,
  ctx jsonb,
  refs jsonb,
  consultation uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r jsonb; c jsonb; rule jsonb; chosen jsonb; first_ref jsonb; missing_ref jsonb;
  applicable jsonb := '[]'; defaults jsonb := '[]'; matched jsonb := '[]';
  missing_labels text[]; first_missing text[]; outside boolean; result jsonb;
  condition_result text; evaluated numeric;
begin
  result := jsonb_build_object(
    'state','no_reference','resultCode',code,'value',val,'unit',result_unit,
    'consultationId',consultation,'context',ctx,'interpretedAt',now(),
    'reason','Sin referencia de interpretación disponible.',
    'reference',null,'rule',null,'candidates','[]'::jsonb
  );
  for r in select value from jsonb_array_elements(refs) where value->>'resultCode' = code loop
    first_ref := coalesce(first_ref,r);
    outside := r->>'unit' <> result_unit;
    missing_labels := array[]::text[];
    for c in select value from jsonb_array_elements(r->'conditions') loop
      condition_result := private.interpretation_condition(c,ctx);
      if condition_result = 'outside' then outside := true; end if;
      if condition_result = 'missing' then
        missing_labels := array_append(missing_labels,c->>'label');
      end if;
    end loop;
    if not outside and cardinality(missing_labels) = 0 then
      applicable := applicable || jsonb_build_array(r);
      if (r->>'isDefault')::boolean then
        defaults := defaults || jsonb_build_array(r);
      end if;
    elsif not outside and missing_ref is null then
      missing_ref := r;
      first_missing := missing_labels;
    end if;
  end loop;
  if first_ref is null then return result; end if;
  if jsonb_array_length(defaults) > 0 then applicable := defaults; end if;
  if jsonb_array_length(applicable) > 1 then
    return result || jsonb_build_object(
      'state','requires_decision',
      'reason','Hay varias referencias aplicables; se requiere decisión metodológica.',
      'candidates',(select jsonb_agg((value->>'id') || '@' || (value->>'version')) from jsonb_array_elements(applicable))
    );
  end if;
  if jsonb_array_length(applicable) = 0 then
    return result || jsonb_build_object(
      'state',case when missing_ref is null then 'not_applicable' else 'missing_context' end,
      'reference',coalesce(missing_ref,first_ref),
      'reason',case when missing_ref is null
        then 'La referencia no aplica al contexto de esta consulta.'
        else 'Falta: ' || array_to_string(first_missing,', ') || '.' end
    );
  end if;

  chosen := applicable->0;
  evaluated := case
    when chosen->>'valueTransform' = 'nearest_half' then round(val * 2) / 2
    else val
  end;
  for rule in select value from jsonb_array_elements(chosen->'rules') loop
    if rule->>'lower' is not null and (
      evaluated < (rule->>'lower')::numeric
      or (evaluated = (rule->>'lower')::numeric and not (rule->>'lowerInclusive')::boolean)
    ) then continue; end if;
    if rule->>'upper' is not null and (
      evaluated > (rule->>'upper')::numeric
      or (evaluated = (rule->>'upper')::numeric and not (rule->>'upperInclusive')::boolean)
    ) then continue; end if;
    if exists(
      select 1
      from jsonb_array_elements(coalesce(rule->'conditions','[]')) as conditions(condition)
      where private.interpretation_condition(conditions.condition,ctx) <> 'matches'
    ) then continue; end if;
    matched := matched || jsonb_build_array(rule);
  end loop;
  return result || jsonb_build_object(
    'reference',chosen,
    'evaluatedValue',evaluated,
    'state',case jsonb_array_length(matched)
      when 0 then 'not_applicable' when 1 then 'classified' else 'requires_decision' end,
    'rule',case when jsonb_array_length(matched)=1 then matched->0 else null end,
    'reason',case jsonb_array_length(matched)
      when 0 then 'Valor fuera del rango clasificatorio definido por la referencia.'
      when 1 then ''
      else 'Existen rangos superpuestos; se requiere decisión metodológica.' end
  );
end;
$$;

create or replace function private.snapshot_result_interpretation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.patients;
  c public.consultations;
  ctx jsonb;
  refs jsonb;
  stage text;
  pregnant boolean;
  w numeric;
  bmi numeric;
  age_years integer;
begin
  select * into c from public.consultations where id = new.consultation_id;
  select * into p from public.patients where id = new.patient_id;
  if c.professional_id is distinct from auth.uid() or c.status <> 'draft' then
    raise exception 'Interpretations require an owned draft' using errcode='42501';
  end if;
  select a.value #>> '{}' into stage
  from public.consultation_answers a
  join public.consultation_snapshots s
    on s.consultation_id=a.consultation_id and s.revision=a.revision
  where a.consultation_id=c.id and a.question_key='life_stage';
  pregnant := case
    when stage='Embarazo' then true
    when stage='Ninguna particular' then false
    else c.interpretation_pregnancy end;
  age_years := case when p.birth_date is null then null else
    extract(year from age((c.consultation_date at time zone p.timezone)::date,p.birth_date))::integer end;
  if age_years < 0 then age_years := null; end if;
  select (m.value #>> '{}')::numeric into w
  from public.consultation_measurements m
  join public.measurement_types t on t.id=m.measurement_type_id
  where m.consultation_id=c.id and t.code='weight';
  if w > 0 and p.height_cm > 0 then bmi := w / power(p.height_cm/100,2); end if;
  ctx := jsonb_build_object(
    'age',age_years,'sex',p.equation_sex,'birthDate',p.birth_date,
    'consultationDate',c.consultation_date,'timezone',p.timezone,
    'pregnant',pregnant,'bmi',bmi,
    'somatotypeEndomorphy',new.dependency_snapshot->'somatotype_endomorphy',
    'somatotypeMesomorphy',new.dependency_snapshot->'somatotype_mesomorphy',
    'somatotypeEctomorphy',new.dependency_snapshot->'somatotype_ectomorphy',
    'somatotypeCategory',private.heath_carter_somatotype_category(new.dependency_snapshot)
  );
  if tg_op='UPDATE'
    and new.raw_result=old.raw_result
    and new.input_snapshot=old.input_snapshot
    and new.dependency_snapshot=old.dependency_snapshot
    and new.result_values=old.result_values
  then
    -- An unchanged stored result is historical evidence. New context fields or
    -- future catalogue versions must never reinterpret it as a side effect.
    new.interpretation_snapshot := old.interpretation_snapshot;
    return new;
  end if;
  select coalesce(jsonb_agg(definition order by id,version),'[]') into refs
  from public.interpretation_references where active;
  new.interpretation_snapshot := private.interpret_result(
    new.calculation_code,new.raw_result,new.unit,ctx,refs,new.consultation_id
  );
  return new;
end;
$$;

with component_refs(
  id, result_code, noun, adjective, description, limitation, second_limitation
) as (
  values
    ('heath-carter-endomorphy-level','somatotype_endomorphy','Endomorfia','endomórfico','adiposidad relativa','Es una descripción morfológica, no una categoría de salud, obesidad ni riesgo.','Debe interpretarse junto con mesomorfia y ectomorfia, no de forma aislada.'),
    ('heath-carter-mesomorphy-level','somatotype_mesomorphy','Mesomorfia','mesomórfico','robustez musculoesquelética relativa','Es una descripción morfológica, no una medición de masa muscular ni una categoría de salud.','Debe interpretarse junto con endomorfia y ectomorfia, no de forma aislada.'),
    ('heath-carter-ectomorphy-level','somatotype_ectomorphy','Ectomorfia','ectomórfico','linealidad relativa','Es una descripción morfológica, no una categoría de salud ni de riesgo.','Debe interpretarse junto con endomorfia y mesomorfia, no de forma aislada.')
), definitions as (
  select id, '1.0.0'::text as version, jsonb_build_object(
    'id',id,'version','1.0.0','resultCode',result_code,
    'name','Magnitud de ' || lower(noun) || ' · Heath-Carter',
    'organization','J. E. L. Carter · San Diego State University','year',2002,
    'sourceVersion','Somatotype Instruction Manual, revisión de marzo de 2002',
    'title','The Heath-Carter Anthropometric Somatotype: Instruction Manual',
    'url','https://mdthinducollege.org/ebooks/statistics/Heath-CarterManual.pdf',
    'locator','Introducción, p. 2 (magnitudes); procedimientos, p. 14 (reporte a media unidad)',
    'population','Personas con componente ' || adjective || ' calculado mediante el método antropométrico Heath-Carter',
    'unit','componente','valueTransform','nearest_half','isDefault',true,
    'conditions','[]'::jsonb,
    'rules',jsonb_build_array(
      jsonb_build_object('id','low','label',noun || ' baja','description','Magnitud descriptiva baja del componente ' || adjective || '.','level',0,'lower',0.5,'upper',2.5,'lowerInclusive',true,'upperInclusive',true),
      jsonb_build_object('id','moderate','label',noun || ' moderada','description','Magnitud descriptiva moderada del componente ' || adjective || '.','level',1,'lower',3,'upper',5,'lowerInclusive',true,'upperInclusive',true),
      jsonb_build_object('id','high','label',noun || ' alta','description','Magnitud descriptiva alta del componente ' || adjective || '.','level',2,'lower',5.5,'upper',7,'lowerInclusive',true,'upperInclusive',true),
      jsonb_build_object('id','very-high','label',noun || ' muy alta','description','Magnitud descriptiva muy alta del componente ' || adjective || '.','level',3,'lower',7.5,'upper',null,'lowerInclusive',true,'upperInclusive',false)
    ),
    'notes',jsonb_build_array(
      'El manual expresa los niveles en incrementos de media unidad; Nuthrick redondea únicamente para elegir el descriptor y conserva intacto el resultado decimal.',
      noun || ' describe ' || description || ' dentro del somatotipo.'
    ),
    'limitations',jsonb_build_array(limitation,second_limitation)
  ) as definition
  from component_refs
)
insert into public.interpretation_references(id,version,definition,active)
select id,version,definition,true from definitions
on conflict (id,version) do update set definition=excluded.definition,active=true;

with categories(id,label,description,level) as (
  values
    ('central','Somatotipo central','Ningún componente difiere más de una unidad de los otros dos.',0),
    ('balanced-endomorph','Endomorfo balanceado','Endomorfia dominante; mesomorfia y ectomorfia no difieren más de media unidad.',1),
    ('mesomorphic-endomorph','Endomorfo mesomórfico','Endomorfia dominante y mesomorfia mayor que ectomorfia.',2),
    ('mesomorph-endomorph','Meso-endomorfo','Endomorfia y mesomorfia no difieren más de media unidad; ectomorfia es menor.',3),
    ('endomorphic-mesomorph','Mesomorfo endomórfico','Mesomorfia dominante y endomorfia mayor que ectomorfia.',4),
    ('balanced-mesomorph','Mesomorfo balanceado','Mesomorfia dominante; endomorfia y ectomorfia no difieren más de media unidad.',5),
    ('ectomorphic-mesomorph','Mesomorfo ectomórfico','Mesomorfia dominante y ectomorfia mayor que endomorfia.',6),
    ('mesomorph-ectomorph','Meso-ectomorfo','Mesomorfia y ectomorfia no difieren más de media unidad; endomorfia es menor.',7),
    ('mesomorphic-ectomorph','Ectomorfo mesomórfico','Ectomorfia dominante y mesomorfia mayor que endomorfia.',8),
    ('balanced-ectomorph','Ectomorfo balanceado','Ectomorfia dominante; endomorfia y mesomorfia no difieren más de media unidad.',9),
    ('endomorphic-ectomorph','Ectomorfo endomórfico','Ectomorfia dominante y endomorfia mayor que mesomorfia.',10),
    ('endomorph-ectomorph','Endo-ectomorfo','Endomorfia y ectomorfia no difieren más de media unidad; mesomorfia es menor.',11),
    ('ectomorphic-endomorph','Endomorfo ectomórfico','Endomorfia dominante y ectomorfia mayor que mesomorfia.',12)
), category_rules as (
  select jsonb_agg(jsonb_build_object(
    'id',id,'label',label,'description',description,'level',level,
    'lower',null,'upper',null,'lowerInclusive',false,'upperInclusive',false,
    'conditions',jsonb_build_array(jsonb_build_object(
      'field','somatotypeCategory','label','categoría somatotípica','equals',id
    ))
  ) order by level) as rules,
  jsonb_agg(id order by level) as ids
  from categories
), definition as (
  select jsonb_build_object(
    'id','heath-carter-somatotype-category','version','1.0.0',
    'resultCode','somatochart_coordinates','name','Categoría somatotípica · Heath-Carter',
    'organization','J. E. L. Carter · San Diego State University','year',2002,
    'sourceVersion','Somatotype Instruction Manual, revisión de marzo de 2002',
    'title','The Heath-Carter Anthropometric Somatotype: Instruction Manual',
    'url','https://mdthinducollege.org/ebooks/statistics/Heath-CarterManual.pdf',
    'locator','Somatotype categories, pp. 9–10: trece categorías basadas en la relación entre los tres componentes',
    'population','Personas con los tres componentes del somatotipo antropométrico Heath-Carter disponibles',
    'unit','coordenadas','isDefault',true,
    'conditions',jsonb_build_array(jsonb_build_object(
      'field','somatotypeCategory','label','los tres componentes del somatotipo','oneOf',ids
    )),
    'rules',rules,
    'notes',jsonb_build_array(
      'La categoría se deriva de la relación entre endomorfia, mesomorfia y ectomorfia; las coordenadas X/Y siguen mostrándose como resultado separado.',
      'Las comparaciones usan los componentes decimales sin redondear y los límites relacionales de 0.5 y 1.0 unidades del manual.'
    ),
    'limitations',jsonb_build_array(
      'La categoría describe la forma y composición corporal actual; no es diagnóstico, riesgo ni juicio de salud.',
      'La precisión depende de la técnica y reproducibilidad de todas las mediciones antropométricas de origen.'
    )
  ) as definition
  from category_rules
)
insert into public.interpretation_references(id,version,definition,active)
select 'heath-carter-somatotype-category','1.0.0',definition,true from definition
on conflict (id,version) do update set definition=excluded.definition,active=true;
