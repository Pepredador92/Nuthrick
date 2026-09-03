-- Extend the existing revision store; do not create a second clinical source of truth.
alter table public.patients add column equation_sex text check(equation_sex in ('male','female'));
create table public.measurement_types (
 id text primary key, code text not null unique, name text not null check(length(name) between 1 and 120),
 category text not null check(category in ('general','circumference','skinfold','diameter','bioimpedance','laboratory','other')),
 unit text not null, data_type text not null default 'number' check(data_type='number'),
 min_value numeric not null default 0, max_value numeric not null, decimal_places integer not null check(decimal_places between 0 and 6),
 description text not null default '', is_active boolean not null default true,
 created_by uuid references public.professional_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(min_value<max_value), check(code ~ '^[a-z][a-z0-9_]{0,100}$')
);
create index measurement_types_owner_idx on public.measurement_types(created_by);
create table public.measurement_devices (
 id uuid primary key default gen_random_uuid(), manufacturer text not null check(length(btrim(manufacturer)) between 1 and 120),
 model text not null check(length(btrim(model)) between 1 and 120), device_type text not null, technology text not null default '',
 notes text not null default '', is_system_device boolean not null default false,
 created_by uuid references public.professional_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(is_system_device=(created_by is null))
);
create index measurement_devices_owner_idx on public.measurement_devices(created_by);
create table public.calculation_definitions (
 code text primary key, name text not null, category text not null, method_version text not null,
 status text not null check(status in ('implemented','not_implemented')), definition jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.patient_measurement_templates (
 patient_id uuid primary key, professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
 revision integer not null check(revision>0), configuration jsonb not null check(jsonb_typeof(configuration)='object'),
 device_id uuid references public.measurement_devices(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(professional_id,patient_id) references public.patients(professional_id,id) on delete cascade
);
create index patient_measurement_templates_owner_idx on public.patient_measurement_templates(professional_id,patient_id);
create index patient_measurement_templates_device_idx on public.patient_measurement_templates(device_id);
alter table public.measurement_types enable row level security;
alter table public.measurement_devices enable row level security;
alter table public.calculation_definitions enable row level security;
alter table public.patient_measurement_templates enable row level security;
revoke all on public.measurement_types,public.measurement_devices,public.calculation_definitions,public.patient_measurement_templates from public,anon,authenticated;
grant select,insert,update on public.measurement_types,public.measurement_devices,public.patient_measurement_templates to authenticated;
grant select on public.calculation_definitions to authenticated;
create policy types_read on public.measurement_types for select to authenticated using(created_by is null or created_by=(select auth.uid()));
create policy types_insert on public.measurement_types for insert to authenticated with check(created_by=(select auth.uid()));
create policy types_update on public.measurement_types for update to authenticated using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
create policy devices_read on public.measurement_devices for select to authenticated using(is_system_device or created_by=(select auth.uid()));
create policy devices_insert on public.measurement_devices for insert to authenticated with check(created_by=(select auth.uid()) and not is_system_device);
create policy devices_update on public.measurement_devices for update to authenticated using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()) and not is_system_device);
create policy definitions_read on public.calculation_definitions for select to authenticated using(true);
create policy templates_read on public.patient_measurement_templates for select to authenticated using(professional_id=(select auth.uid()));
create policy templates_insert on public.patient_measurement_templates for insert to authenticated with check(professional_id=(select auth.uid()));
create policy templates_update on public.patient_measurement_templates for update to authenticated using(professional_id=(select auth.uid())) with check(professional_id=(select auth.uid()));

insert into public.measurement_types(id,code,name,category,unit,data_type,min_value,max_value,decimal_places,description,is_active) values
('weight','weight','Peso','general','kg','number',0.001,1000,1,'Medición registrada por el profesional.',true),
('height','height','Talla','general','cm','number',0.001,300,1,'Medición registrada por el profesional.',true),
('waist_circumference','waist_circumference','Cintura','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('hip_circumference','hip_circumference','Cadera','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('abdominal_circumference','abdominal_circumference','Abdomen','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('relaxed_arm_circumference','relaxed_arm_circumference','Brazo relajado','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('flexed_arm_circumference','flexed_arm_circumference','Brazo contraído','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('thigh_circumference','thigh_circumference','Muslo','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('calf_circumference','calf_circumference','Pantorrilla','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('chest_circumference','chest_circumference','Tórax','circumference','cm','number',0.001,400,1,'Medición registrada por el profesional.',true),
('triceps_skinfold','triceps_skinfold','Tríceps','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('biceps_skinfold','biceps_skinfold','Bíceps','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('subscapular_skinfold','subscapular_skinfold','Subescapular','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('suprailiac_skinfold','suprailiac_skinfold','Suprailíaco','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('supraespinale_skinfold','supraespinale_skinfold','Supraespinal','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('abdominal_skinfold','abdominal_skinfold','Abdominal','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('thigh_skinfold','thigh_skinfold','Muslo anterior','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('calf_skinfold','calf_skinfold','Pantorrilla','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('chest_skinfold','chest_skinfold','Pectoral','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('midaxillary_skinfold','midaxillary_skinfold','Axilar medio','skinfold','mm','number',0,150,1,'Medición registrada por el profesional.',true),
('humerus_breadth','humerus_breadth','Biepicondilar del húmero','diameter','cm','number',0.001,100,2,'Medición registrada por el profesional.',true),
('femur_breadth','femur_breadth','Biepicondilar del fémur','diameter','cm','number',0.001,100,2,'Medición registrada por el profesional.',true),
('wrist_breadth','wrist_breadth','Biestiloideo','diameter','cm','number',0.001,100,2,'Medición registrada por el profesional.',true),
('biacromial_breadth','biacromial_breadth','Biacromial','diameter','cm','number',0.001,100,2,'Medición registrada por el profesional.',true),
('biiliocristal_breadth','biiliocristal_breadth','Biiliocrestal','diameter','cm','number',0.001,100,2,'Medición registrada por el profesional.',true),
('body_fat_percentage_device','body_fat_percentage_device','Grasa corporal','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('body_water_percentage_device','body_water_percentage_device','Agua corporal','bioimpedance','%','number',0,100,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('fat_mass_device','fat_mass_device','Masa grasa','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('fat_free_mass_device','fat_free_mass_device','Masa libre de grasa','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('muscle_mass_device','muscle_mass_device','Masa muscular','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('skeletal_muscle_mass_device','skeletal_muscle_mass_device','Masa muscular esquelética','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('bone_mass_device','bone_mass_device','Masa ósea','bioimpedance','kg','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('total_body_water_device','total_body_water_device','Agua corporal total','bioimpedance','L','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('visceral_fat_device','visceral_fat_device','Grasa visceral (escala del equipo)','bioimpedance','nivel','number',0,1000,1,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('basal_metabolism_device','basal_metabolism_device','Metabolismo basal reportado','bioimpedance','kcal/día','number',0,10000,0,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('metabolic_age_device','metabolic_age_device','Edad metabólica reportada','bioimpedance','años','number',0,150,0,'Valor reportado por el equipo, no calculado por Nuthrick.',true),
('body_density_measured','body_density_measured','Densidad corporal obtenida por otro método','other','g/cm³','number',0.001,2,5,'Medición registrada por el profesional.',true);
insert into public.calculation_definitions(code,name,category,method_version,status,definition) values
('bmi','IMC','index','2.0.0','implemented','{"code":"bmi","name":"IMC","category":"index","requiredInputs":["weight","height"],"dependencies":[],"calculation":"peso_kg / (talla_cm / 100)²","unit":"kg/m²","decimalPlaces":1,"description":"Relaciona peso con talla.","referenceUrls":["https://iris.who.int/handle/10665/42330"],"limitations":"No distingue grasa de músculo. Clasificación OMS sólo en adultos no gestantes confirmados.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('waist_hip_ratio','Índice cintura/cadera','index','2.0.0','implemented','{"code":"waist_hip_ratio","name":"Índice cintura/cadera","category":"index","requiredInputs":["waist_circumference","hip_circumference"],"dependencies":[],"calculation":"cintura_cm / cadera_cm","unit":"ratio","decimalPlaces":2,"description":"Describe la proporción entre cintura y cadera.","referenceUrls":["https://www.who.int/publications/i/item/9789241501491"],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('waist_height_ratio','Índice cintura/talla','index','2.0.0','implemented','{"code":"waist_height_ratio","name":"Índice cintura/talla","category":"index","requiredInputs":["waist_circumference","height"],"dependencies":[],"calculation":"cintura_cm / talla_cm","unit":"ratio","decimalPlaces":2,"description":"Relaciona cintura y talla. Se muestra sin clasificación automática.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('jackson_pollock_7','Jackson-Pollock 7','density','2.0.0','implemented','{"code":"jackson_pollock_7","name":"Jackson-Pollock 7","category":"density","requiredInputs":["chest_skinfold","midaxillary_skinfold","triceps_skinfold","subscapular_skinfold","suprailiac_skinfold","abdominal_skinfold","thigh_skinfold"],"dependencies":[],"calculation":"Masculina: D = 1.112 − 0.00043499S + 0.00000055S² − 0.00028826edad. Femenina: D = 1.097 − 0.00046971S + 0.00000056S² − 0.00012828edad. S = suma de 7 pliegues en mm.","unit":"g/cm³","decimalPlaces":5,"description":"Estima densidad corporal a partir de siete pliegues.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/718832/","https://pubmed.ncbi.nlm.nih.gov/7402053/"],"limitations":"Masculina: 18–61 años; femenina: 18–55. Requiere sexo de la ecuación y contexto adulto no gestante. Depende de técnica y población.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":["male","female"],"applicableAgeRange":[18,61]}'::jsonb),
('siri','Siri','body_fat','2.0.0','implemented','{"code":"siri","name":"Siri","category":"body_fat","requiredInputs":[],"dependencies":["body_density"],"calculation":"495 / densidad − 450","unit":"%","decimalPlaces":1,"description":"Convierte densidad a grasa corporal con un modelo de dos compartimentos.","referenceUrls":["https://www.ncbi.nlm.nih.gov/books/NBK218181/"],"limitations":"Asume densidades constantes. No intercambiar métodos para evaluar evolución.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('brozek','Brozek','body_fat','2.0.0','implemented','{"code":"brozek","name":"Brozek","category":"body_fat","requiredInputs":[],"dependencies":["body_density"],"calculation":"457 / densidad − 414.2","unit":"%","decimalPlaces":1,"description":"Conversión alternativa de densidad a porcentaje de grasa.","referenceUrls":["https://pubmed.ncbi.nlm.nih.gov/14062375/"],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('fat_mass','Masa grasa','body_composition','2.0.0','implemented','{"code":"fat_mass","name":"Masa grasa","category":"body_composition","requiredInputs":["weight"],"dependencies":["body_fat"],"calculation":"peso × porcentaje_grasa / 100","unit":"kg","decimalPlaces":1,"description":"Deriva masa grasa usando el porcentaje del método seleccionado.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('fat_free_mass','Masa libre de grasa','body_composition','2.0.0','implemented','{"code":"fat_free_mass","name":"Masa libre de grasa","category":"body_composition","requiredInputs":["weight"],"dependencies":["fat_mass"],"calculation":"peso − masa_grasa","unit":"kg","decimalPlaces":1,"description":"No equivale a masa muscular.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('jackson_pollock_3','Jackson-Pollock 3','body_composition','2.0.0','not_implemented','{"code":"jackson_pollock_3","name":"Jackson-Pollock 3","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('durnin_womersley','Durnin-Womersley','body_composition','2.0.0','not_implemented','{"code":"durnin_womersley","name":"Durnin-Womersley","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('faulkner','Faulkner','body_composition','2.0.0','not_implemented','{"code":"faulkner","name":"Faulkner","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('yuhasz','Yuhasz','body_composition','2.0.0','not_implemented','{"code":"yuhasz","name":"Yuhasz","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('lee','Masa muscular · Lee','body_composition','2.0.0','not_implemented','{"code":"lee","name":"Masa muscular · Lee","category":"body_composition","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('heath_carter','Somatotipo · Heath-Carter','somatotype','2.0.0','not_implemented','{"code":"heath_carter","name":"Somatotipo · Heath-Carter","category":"somatotype","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('somatochart_x','Somatocarta · X','somatotype','2.0.0','not_implemented','{"code":"somatochart_x","name":"Somatocarta · X","category":"somatotype","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb),
('somatochart_y','Somatocarta · Y','somatotype','2.0.0','not_implemented','{"code":"somatochart_y","name":"Somatocarta · Y","category":"somatotype","requiredInputs":[],"dependencies":[],"calculation":"","unit":"unidad","decimalPlaces":2,"description":"Preparado para incorporar una fórmula y aplicabilidad validadas.","referenceUrls":[],"limitations":"No constituye un diagnóstico. Interpretar con la evaluación profesional.","status":"not_implemented","version":"2.0.0","optionalInputs":[],"applicableSex":[],"applicableAgeRange":null}'::jsonb);
insert into public.measurement_devices(manufacturer,model,device_type,technology,notes,is_system_device) values
 ('InBody','270','bioimpedance','BIA','Catálogo de identificación. No interpreta algoritmos propietarios.',true),
 ('Tanita','MC-780MA','bioimpedance','BIA','Catálogo de identificación. Registra modo/software utilizado.',true),
 ('Omron','HBF-514C','bioimpedance','BIA','Verifica el modelo exacto de tu equipo.',true),
 ('SECA','mBCA 515','bioimpedance','BIA','Verifica el modelo exacto de tu equipo.',true);

create function private.validate_measurement_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
declare w jsonb; e jsonb; r jsonb; t public.measurement_types; dep text; ids text[]; measurement_count integer;
begin
 w:=new.payload->'workflow';
 if w is null then return new; end if;
 if coalesce((w->>'version')::integer,0)<>2 or jsonb_typeof(w->'entries') is distinct from 'object' or jsonb_typeof(w->'calculations') is distinct from 'array' or jsonb_typeof(w->'configuration') is distinct from 'object' then
  raise exception 'Invalid measurement workflow';
 end if;
 select count(*) into measurement_count from jsonb_each(w->'entries');
 if measurement_count>200 or jsonb_array_length(w->'calculations')>100 then raise exception 'Too many measurement entries'; end if;
 ids:=array[]::text[];
 for e in select value from jsonb_each(w->'entries') loop
  if e->>'patient_id' is distinct from new.patient_id::text or e->>'consultation_id' is distinct from new.consultation_id::text or e->>'created_by' is distinct from new.professional_id::text
     or jsonb_typeof(e->'value') is distinct from 'number' or coalesce(e->>'source_type','') not in ('manual','device','imported')
     or coalesce(e->>'id','') !~ '^[0-9a-f-]{36}$' then raise exception 'Invalid measurement ownership or value'; end if;
  if e->>'id'=any(ids) then raise exception 'Duplicate measurement id'; end if;
  ids:=array_append(ids,e->>'id');
  select * into t from public.measurement_types where id=e->>'measurement_type_id';
  if not found or e->>'code'<>t.code or e->>'unit'<>t.unit or (e->>'value')::numeric<t.min_value or (e->>'value')::numeric>t.max_value then raise exception 'Invalid measurement type, unit or range'; end if;
  if e->>'source_type'='device' and (e->>'device_id' is null or not exists(select 1 from public.measurement_devices where id=(e->>'device_id')::uuid)) then raise exception 'Device unavailable'; end if;
  if t.category='bioimpedance' and e->>'source_type'='manual' then raise exception 'Device measurements must retain device provenance'; end if;
 end loop;
 for r in select value from jsonb_array_elements(w->'calculations') loop
  if r->>'patient_id' is distinct from new.patient_id::text or r->>'consultation_id' is distinct from new.consultation_id::text or r->>'source_type' is distinct from 'calculated'
    or jsonb_typeof(r->'raw_value') is distinct from 'number' or jsonb_typeof(r->'display_value') is distinct from 'number'
    or coalesce(r->>'calculation_id','') !~ '^[0-9a-f-]{36}$' then raise exception 'Invalid calculated result'; end if;
  if r->>'calculation_id'=any(ids) then raise exception 'Duplicate result id'; end if;
  ids:=array_append(ids,r->>'calculation_id');
 end loop;
 for r in select value from jsonb_array_elements(w->'calculations') loop
  for dep in select jsonb_array_elements_text(r->'dependency_ids') loop
   if not(dep=any(ids)) then raise exception 'Calculation dependency missing'; end if;
  end loop;
 end loop;
 return new;
end;
$$;
revoke all on function private.validate_measurement_workflow() from public,anon;
grant execute on function private.validate_measurement_workflow() to authenticated;
create trigger measurement_workflow_guard before insert on public.consultation_anthropometry for each row execute function private.validate_measurement_workflow();

-- Atomic save of a revision and optionally the habitual template. Current consultation config stays in the revision.
create function public.save_measurement_workflow(p_consultation uuid,p_expected_revision integer,p_payload jsonb,p_template_scope text,p_expected_template_revision integer,p_save_patient_context boolean default false)
returns public.consultation_anthropometry language plpgsql security invoker set search_path='' as $$
declare c public.consultations; t public.patient_measurement_templates; a public.consultation_anthropometry; config jsonb;
begin
 select * into c from public.consultations where id=p_consultation for update;
 if not found or c.professional_id<>(select auth.uid()) or c.status<>'draft' then raise insufficient_privilege using message='Only an owned draft can be saved'; end if;
 perform 1 from public.patients where id=c.patient_id and professional_id=(select auth.uid()) for update;
 if p_template_scope not in ('habitual','today') then raise exception 'Invalid template scope'; end if;
 select * into t from public.patient_measurement_templates where patient_id=c.patient_id for update;
 if p_template_scope='habitual' then
  if coalesce(t.revision,0)<>p_expected_template_revision then raise exception 'Template changed. Reload before saving.'; end if;
  config:=p_payload->'workflow'->'configuration';
  if jsonb_typeof(config) is distinct from 'object' or config->>'version'<>'1' then raise exception 'Invalid template'; end if;
  if config->>'deviceId' is not null and not exists(select 1 from public.measurement_devices where id=(config->>'deviceId')::uuid) then raise exception 'Device unavailable'; end if;
  insert into public.patient_measurement_templates(patient_id,professional_id,revision,configuration,device_id)
   values(c.patient_id,c.professional_id,coalesce(t.revision,0)+1,config,(config->>'deviceId')::uuid)
   on conflict(patient_id) do update set revision=excluded.revision,configuration=excluded.configuration,device_id=excluded.device_id,updated_at=now();
 end if;
 if p_save_patient_context then
  update public.patients set equation_sex=nullif(p_payload->'workflow'->'context'->>'sex',''),birth_date=nullif(p_payload->'workflow'->'context'->>'birthDate','')::date
   where id=c.patient_id and professional_id=(select auth.uid());
 end if;
 insert into public.consultation_anthropometry(professional_id,patient_id,consultation_id,revision,measured_at,payload)
 values(c.professional_id,c.patient_id,c.id,p_expected_revision+1,(p_payload->'input'->>'measuredAt')::timestamptz,p_payload) returning * into a;
 return a;
end;
$$;
revoke all on function public.save_measurement_workflow(uuid,integer,jsonb,text,integer,boolean) from public,anon;
grant execute on function public.save_measurement_workflow(uuid,integer,jsonb,text,integer,boolean) to authenticated;

-- Read models for future time series; methods and revision IDs remain separate.
create view public.registered_measurements with(security_invoker=true) as
 select a.id as revision_id,a.professional_id,a.patient_id,a.consultation_id,a.revision,
 e.value->>'id' as id,e.value->>'measurement_type_id' as measurement_type_id,e.value->>'code' as code,
 (e.value->>'value')::numeric as value,e.value->>'unit' as unit,e.value->>'source_type' as source_type,
 nullif(e.value->>'device_id','')::uuid as device_id,(e.value->>'measured_at')::timestamptz as measured_at,
 e.value as measurement
 from public.consultation_anthropometry a cross join lateral jsonb_each(a.payload->'workflow'->'entries') e;
create view public.calculated_measurements with(security_invoker=true) as
 select a.id as revision_id,a.professional_id,a.patient_id,a.consultation_id,a.revision,
 r.value->>'calculation_id' as id,r.value->>'calculation_code' as calculation_code,r.value->>'method' as method,
 r.value->>'methodVersion' as method_version,(r.value->>'raw_value')::numeric as raw_value,
 (r.value->>'display_value')::numeric as display_value,r.value->>'unit' as unit,
 (r.value->>'calculated_at')::timestamptz as calculated_at,r.value as result
 from public.consultation_anthropometry a cross join lateral jsonb_array_elements(a.payload->'workflow'->'calculations') r;
revoke all on public.registered_measurements,public.calculated_measurements from public,anon,authenticated;
grant select on public.registered_measurements,public.calculated_measurements to authenticated;
