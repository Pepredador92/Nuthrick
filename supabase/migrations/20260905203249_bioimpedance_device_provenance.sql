-- Objective 7: a standard equipment catalog, each professional's physical
-- devices, and immutable-by-origin device sessions inside consultations.

alter table public.measurement_devices
  add column if not exists commercial_name text,
  add column if not exists family text,
  add column if not exists is_active boolean not null default true,
  add column if not exists frequency_count integer check (frequency_count is null or frequency_count > 0),
  add column if not exists electrode_count integer check (electrode_count is null or electrode_count > 0),
  add column if not exists is_segmental boolean not null default false,
  add column if not exists validation_status text not null default 'legacy'
    check (validation_status in ('verified', 'partial', 'pending', 'legacy')),
  add column if not exists source_title text,
  add column if not exists source_url text,
  add column if not exists source_version text,
  add column if not exists verified_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object');

create unique index if not exists measurement_devices_system_model_key
  on public.measurement_devices (lower(manufacturer), lower(model))
  where is_system_device;

create table public.measurement_device_capabilities (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.measurement_devices(id) on delete cascade,
  measurement_type_id text not null references public.measurement_types(id),
  manufacturer_variable_name text not null check (length(btrim(manufacturer_variable_name)) between 1 and 180),
  manufacturer_unit text,
  mapping_status text not null default 'verified' check (mapping_status in ('verified', 'ambiguous', 'proprietary')),
  source_locator text not null default '',
  notes text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (device_id, measurement_type_id)
);

create index measurement_device_capabilities_device_idx
  on public.measurement_device_capabilities(device_id, display_order);

create table public.professional_devices (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  catalog_device_id uuid references public.measurement_devices(id) on delete restrict,
  custom_manufacturer text,
  custom_model text,
  custom_name text,
  alias text not null check (length(btrim(alias)) between 1 and 120),
  serial_number text,
  internal_id text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (catalog_device_id is not null and custom_manufacturer is null and custom_model is null)
    or
    (catalog_device_id is null
      and length(btrim(custom_manufacturer)) between 1 and 120
      and length(btrim(custom_model)) between 1 and 120)
  )
);

create index professional_devices_owner_idx on public.professional_devices(professional_id, is_active);
alter table public.professional_devices
  add constraint professional_devices_owner_id_key unique (professional_id, id);
create unique index professional_devices_one_default_idx
  on public.professional_devices(professional_id) where is_default and is_active;

create table public.professional_device_capabilities (
  id uuid primary key default gen_random_uuid(),
  professional_device_id uuid not null references public.professional_devices(id) on delete cascade,
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  measurement_type_id text not null references public.measurement_types(id),
  manufacturer_variable_name text not null check (length(btrim(manufacturer_variable_name)) between 1 and 180),
  manufacturer_unit text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (professional_device_id, measurement_type_id),
  foreign key (professional_id, professional_device_id)
    references public.professional_devices(professional_id, id) on delete cascade
);

create index professional_device_capabilities_owner_idx
  on public.professional_device_capabilities(professional_id, professional_device_id);

create table public.consultation_device_sessions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null,
  consultation_id uuid not null,
  professional_device_id uuid not null references public.professional_devices(id) on delete restrict,
  capture_source text not null default 'manual' check (capture_source in ('manual', 'imported', 'integration', 'other')),
  device_snapshot jsonb not null check (jsonb_typeof(device_snapshot) = 'object'),
  measured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, consultation_id, professional_device_id),
  unique (id, professional_id, consultation_id, patient_id),
  foreign key (professional_id, patient_id) references public.patients(professional_id, id) on delete cascade,
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations(professional_id, id, patient_id) on delete cascade,
  foreign key (professional_id, professional_device_id)
    references public.professional_devices(professional_id, id) on delete restrict
);

create index consultation_device_sessions_consultation_idx
  on public.consultation_device_sessions(professional_id, consultation_id, measured_at);
create index consultation_device_sessions_patient_idx
  on public.consultation_device_sessions(professional_id, patient_id, measured_at desc);

alter table public.consultation_measurements
  add column device_session_id uuid;

alter table public.consultation_measurements
  drop constraint consultation_measurements_professional_id_consultation_id_m_key;

create unique index consultation_measurements_manual_key
  on public.consultation_measurements(professional_id, consultation_id, measurement_type_id)
  where device_session_id is null;
create unique index consultation_measurements_device_key
  on public.consultation_measurements(device_session_id, measurement_type_id)
  where device_session_id is not null;
create index consultation_measurements_device_session_idx
  on public.consultation_measurements(device_session_id)
  where device_session_id is not null;

alter table public.consultation_measurements
  add constraint consultation_measurements_device_session_owner_fkey
  foreign key (device_session_id, professional_id, consultation_id, patient_id)
  references public.consultation_device_sessions(id, professional_id, consultation_id, patient_id)
  on delete cascade;

alter table public.measurement_device_capabilities enable row level security;
alter table public.professional_devices enable row level security;
alter table public.professional_device_capabilities enable row level security;
alter table public.consultation_device_sessions enable row level security;

revoke all on public.measurement_device_capabilities, public.professional_devices,
  public.professional_device_capabilities, public.consultation_device_sessions
  from public, anon, authenticated;
grant select on public.measurement_device_capabilities to authenticated;
grant select, insert, update on public.professional_devices to authenticated;
grant select, insert, update, delete on public.professional_device_capabilities to authenticated;
grant select, insert, update on public.consultation_device_sessions to authenticated;

create policy measurement_device_capabilities_read on public.measurement_device_capabilities
  for select to authenticated using (
    exists (
      select 1 from public.measurement_devices d
      where d.id = device_id and d.is_system_device and d.is_active
    )
  );
create policy professional_devices_owner_read on public.professional_devices
  for select to authenticated using ((select auth.uid()) = professional_id);
create policy professional_devices_owner_insert on public.professional_devices
  for insert to authenticated with check ((select auth.uid()) = professional_id);
create policy professional_devices_owner_update on public.professional_devices
  for update to authenticated using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy professional_device_capabilities_owner_all on public.professional_device_capabilities
  for all to authenticated using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);
create policy consultation_device_sessions_owner_read on public.consultation_device_sessions
  for select to authenticated using ((select auth.uid()) = professional_id);
create policy consultation_device_sessions_owner_insert on public.consultation_device_sessions
  for insert to authenticated with check ((select auth.uid()) = professional_id);
create policy consultation_device_sessions_owner_update on public.consultation_device_sessions
  for update to authenticated using ((select auth.uid()) = professional_id)
  with check ((select auth.uid()) = professional_id);

-- Standard catalog. Capabilities below are limited to outputs explicitly listed
-- by current official product/result-sheet documentation.
insert into public.measurement_devices(
  manufacturer, model, commercial_name, family, device_type, technology, notes,
  is_system_device, is_active, frequency_count, electrode_count, is_segmental,
  validation_status, source_title, source_url, source_version, verified_at
)
values
  ('InBody','270S','InBody 270S','InBody','bioimpedance','DSM-MFBIA','Official professional analyzer.',true,true,2,8,true,'verified','InBody 270S product and result sheet','https://inbodyusa.com/products/inbody-270s/','consulted 2026-09-05',now()),
  ('InBody','770S','InBody 770S','InBody','bioimpedance','DSM-MFBIA','Official medical-grade analyzer.',true,true,6,8,true,'verified','InBody 770S product page','https://inbodyusa.com/products/inbody770s/','consulted 2026-09-05',now()),
  ('Tanita','MC-780U Plus','MC-780U Plus','MC','bioimpedance','Multi-frequency BIA','Official segmental analyzer.',true,true,3,8,true,'verified','Tanita MC-780U Plus product page','https://tanita.com/EN-US/products/mc-780uplus','consulted 2026-09-05',now()),
  ('Omron','BCM-500','BCM-500','BCM','bioimpedance','Foot-to-foot BIA 50 kHz','Home-use body composition monitor.',true,true,1,4,false,'verified','OMRON BCM-500 product page and instruction manual','https://omronhealthcare.com/products/body-composition-monitor-and-scale-with-bluetooth-connectivity-bcm-500','consulted 2026-09-05',now()),
  ('seca','mBCA 555','seca mBCA 555','mBCA','bioimpedance','8-point BIA','Medical body composition analyzer.',true,true,null,8,true,'verified','seca mBCA 555 product sheet','https://www.seca.com/fileadmin/documents/product_sheet/seca_pst__mBCA_555_en.pdf','consulted 2026-09-05',now()),
  ('seca','mBCA Go 525c','seca mBCA Go','mBCA','bioimpedance','8-point BIA measuring mat','Mobile medical analyzer for supine measurement.',true,true,null,8,false,'verified','seca mBCA Go product sheet','https://www.seca.com/fileadmin/documents/product_sheet/seca_pst_mBCA-Go_int_en.pdf','consulted 2026-09-05',now())
on conflict (lower(manufacturer), lower(model)) where is_system_device do update set
  commercial_name = excluded.commercial_name, family = excluded.family,
  technology = excluded.technology, notes = excluded.notes, is_active = true,
  frequency_count = excluded.frequency_count, electrode_count = excluded.electrode_count,
  is_segmental = excluded.is_segmental, validation_status = excluded.validation_status,
  source_title = excluded.source_title, source_url = excluded.source_url,
  source_version = excluded.source_version, verified_at = excluded.verified_at;

-- Upgrade the pre-existing official HBF-514C row instead of creating a duplicate.
update public.measurement_devices set
  commercial_name='HBF-514C', family='HBF', technology='Full-body BIA 50 kHz',
  notes='Official full-body monitor with seven fitness indicators.', is_active=true,
  frequency_count=1, electrode_count=8, is_segmental=false,
  validation_status='verified', source_title='OMRON HBF-514C product page and instruction manual',
  source_url='https://omronhealthcare.com/products/body-composition-monitor-and-scale-with-seven-fitness-indicators-hbf-514c',
  source_version='consulted 2026-09-05', verified_at=now()
where is_system_device and lower(manufacturer)='omron' and lower(model)='hbf-514c';

-- One mapping source. Values absent from this list are intentionally not inferred.
with capability(manufacturer, model, measurement_type_id, variable_name, variable_unit, display_order) as (values
  ('InBody','270S','weight','Weight','kg',10),
  ('InBody','270S','total_body_water_device','Total Body Water','L',20),
  ('InBody','270S','fat_mass_device','Body Fat Mass','kg',30),
  ('InBody','270S','body_fat_percentage_device','Percent Body Fat','%',40),
  ('InBody','270S','skeletal_muscle_mass_device','Skeletal Muscle Mass','kg',50),
  ('InBody','270S','phase_angle_device','Whole Body Phase Angle','°',60),
  ('InBody','270S','left_arm_lean_mass_device','Segmental Lean Analysis · Left Arm','kg',100),
  ('InBody','270S','right_arm_lean_mass_device','Segmental Lean Analysis · Right Arm','kg',110),
  ('InBody','270S','left_leg_lean_mass_device','Segmental Lean Analysis · Left Leg','kg',120),
  ('InBody','270S','right_leg_lean_mass_device','Segmental Lean Analysis · Right Leg','kg',130),
  ('InBody','270S','trunk_lean_mass_device','Segmental Lean Analysis · Trunk','kg',140),
  ('InBody','770S','weight','Weight','kg',10),
  ('InBody','770S','total_body_water_device','Total Body Water','L',20),
  ('InBody','770S','intracellular_water_device','Intracellular Water','L',30),
  ('InBody','770S','extracellular_water_device','Extracellular Water','L',40),
  ('InBody','770S','ecw_tbw_ratio_device','ECW/TBW','ratio',50),
  ('InBody','770S','fat_mass_device','Body Fat Mass','kg',60),
  ('InBody','770S','body_fat_percentage_device','Percent Body Fat','%',70),
  ('InBody','770S','skeletal_muscle_mass_device','Skeletal Muscle Mass','kg',80),
  ('InBody','770S','visceral_fat_area_device','Visceral Fat Area','cm²',90),
  ('InBody','770S','phase_angle_device','Whole Body Phase Angle','°',100),
  ('InBody','770S','impedance_device','Impedance','Ω',110),
  ('InBody','770S','left_arm_lean_mass_device','Segmental Lean Analysis · Left Arm','kg',200),
  ('InBody','770S','right_arm_lean_mass_device','Segmental Lean Analysis · Right Arm','kg',210),
  ('InBody','770S','left_leg_lean_mass_device','Segmental Lean Analysis · Left Leg','kg',220),
  ('InBody','770S','right_leg_lean_mass_device','Segmental Lean Analysis · Right Leg','kg',230),
  ('InBody','770S','trunk_lean_mass_device','Segmental Lean Analysis · Trunk','kg',240),
  ('Tanita','MC-780U Plus','weight','Weight','kg',10),
  ('Tanita','MC-780U Plus','fat_mass_device','Body Fat Mass','kg',20),
  ('Tanita','MC-780U Plus','body_fat_percentage_device','Body Fat Percentage','%',30),
  ('Tanita','MC-780U Plus','muscle_mass_device','Muscle Mass','kg',40),
  ('Tanita','MC-780U Plus','visceral_fat_device','Visceral Fat Rating','puntaje',50),
  ('Tanita','MC-780U Plus','body_water_percentage_device','Total Body Water Percentage','%',60),
  ('Tanita','MC-780U Plus','total_body_water_device','Total Body Water Mass','L',70),
  ('Tanita','MC-780U Plus','intracellular_water_device','Intracellular Water','L',80),
  ('Tanita','MC-780U Plus','extracellular_water_device','Extracellular Water','L',90),
  ('Tanita','MC-780U Plus','basal_metabolism_device','Basal Metabolic Rate','kcal/día',100),
  ('Tanita','MC-780U Plus','metabolic_age_device','Metabolic Age','años',110),
  ('Tanita','MC-780U Plus','bone_mass_device','Bone Mass','kg',120),
  ('Tanita','MC-780U Plus','phase_angle_device','Phase Angle','°',130),
  ('Tanita','MC-780U Plus','fat_free_mass_device','Fat Free Mass','kg',140),
  ('Tanita','MC-780U Plus','impedance_device','Resistance','Ω',150),
  ('Omron','HBF-514C','weight','Body Weight','kg',10),
  ('Omron','HBF-514C','body_fat_percentage_device','Body Fat Percentage','%',20),
  ('Omron','HBF-514C','skeletal_muscle_percentage_device','Skeletal Muscle Percentage','%',30),
  ('Omron','HBF-514C','basal_metabolism_device','Resting Metabolism','kcal/día',40),
  ('Omron','HBF-514C','visceral_fat_device','Visceral Fat Level','puntaje',50),
  ('Omron','HBF-514C','metabolic_age_device','Body Age','años',60),
  ('Omron','BCM-500','weight','Body Weight','kg',10),
  ('Omron','BCM-500','body_fat_percentage_device','Body Fat Percentage','%',20),
  ('Omron','BCM-500','skeletal_muscle_percentage_device','Skeletal Muscle Percentage','%',30),
  ('Omron','BCM-500','basal_metabolism_device','Resting Metabolism','kcal/día',40),
  ('Omron','BCM-500','visceral_fat_device','Visceral Fat Level','puntaje',50),
  ('seca','mBCA 555','weight','Weight','kg',10),
  ('seca','mBCA 555','skeletal_muscle_mass_device','Skeletal Muscle Mass','kg',20),
  ('seca','mBCA 555','fat_mass_device','Fat Mass','kg',30),
  ('seca','mBCA 555','fat_free_mass_device','Fat-Free Mass','kg',40),
  ('seca','mBCA 555','total_body_water_device','Total Body Water','L',50),
  ('seca','mBCA 555','visceral_fat_device','Visceral Fat','puntaje',60),
  ('seca','mBCA 555','phase_angle_device','Phase Angle','°',70),
  ('seca','mBCA Go 525c','skeletal_muscle_mass_device','Muscle Mass','kg',10),
  ('seca','mBCA Go 525c','fat_mass_device','Fat Mass','kg',20),
  ('seca','mBCA Go 525c','total_body_water_device','Total Body Water','L',30),
  ('seca','mBCA Go 525c','intracellular_water_device','Intracellular Water','L',40),
  ('seca','mBCA Go 525c','extracellular_water_device','Extracellular Water','L',50),
  ('seca','mBCA Go 525c','visceral_fat_device','Visceral Fat','puntaje',60),
  ('seca','mBCA Go 525c','phase_angle_device','Phase Angle','°',70)
)
insert into public.measurement_device_capabilities(
  device_id, measurement_type_id, manufacturer_variable_name, manufacturer_unit,
  mapping_status, source_locator, display_order
)
select d.id, c.measurement_type_id, c.variable_name, c.variable_unit,
  'verified', coalesce(d.source_title, 'Official manufacturer documentation'), c.display_order
from capability c
join public.measurement_devices d
  on lower(d.manufacturer)=lower(c.manufacturer) and lower(d.model)=lower(c.model)
  and d.is_system_device
join public.measurement_types mt on mt.id=c.measurement_type_id
on conflict (device_id, measurement_type_id) do update set
  manufacturer_variable_name=excluded.manufacturer_variable_name,
  manufacturer_unit=excluded.manufacturer_unit,
  mapping_status='verified', source_locator=excluded.source_locator,
  display_order=excluded.display_order;

create or replace function private.validate_professional_device_capability()
returns trigger language plpgsql security invoker set search_path='' as $$
declare d public.professional_devices; t public.measurement_types;
begin
  select * into d from public.professional_devices where id=new.professional_device_id;
  if not found or d.professional_id<>new.professional_id or d.catalog_device_id is not null then
    raise exception 'Capabilities can only be defined for an owned custom device' using errcode='23514';
  end if;
  select * into t from public.measurement_types where id=new.measurement_type_id;
  if not found or not t.is_active or (t.category<>'bioimpedance' and t.code<>'weight') then
    raise exception 'Unsupported custom device capability' using errcode='23514';
  end if;
  new.manufacturer_variable_name=coalesce(nullif(btrim(new.manufacturer_variable_name),''), t.display_name);
  new.manufacturer_unit=t.unit;
  return new;
end $$;
revoke all on function private.validate_professional_device_capability() from public, anon;
grant execute on function private.validate_professional_device_capability() to authenticated;
create trigger professional_device_capability_validate
  before insert or update on public.professional_device_capabilities
  for each row execute function private.validate_professional_device_capability();

create or replace function public.save_professional_device(p_device jsonb, p_capability_ids text[] default array[]::text[])
returns public.professional_devices language plpgsql security invoker set search_path='' as $$
declare result public.professional_devices; requested_id uuid; catalog public.measurement_devices; custom boolean;
begin
  requested_id:=nullif(p_device->>'id','')::uuid;
  custom:=nullif(p_device->>'catalog_device_id','') is null;
  if not custom then
    select * into catalog from public.measurement_devices
    where id=(p_device->>'catalog_device_id')::uuid and is_system_device and is_active and validation_status='verified';
    if not found then raise exception 'Catalog device is unavailable' using errcode='23514'; end if;
  elsif coalesce(array_length(p_capability_ids,1),0)=0 then
    raise exception 'A custom device needs at least one capability' using errcode='23514';
  end if;
  if coalesce((p_device->>'is_default')::boolean,false) then
    update public.professional_devices set is_default=false, updated_at=now()
    where professional_id=(select auth.uid()) and is_default;
  end if;
  if requested_id is null then
    insert into public.professional_devices(professional_id,catalog_device_id,custom_manufacturer,custom_model,custom_name,alias,serial_number,internal_id,is_active,is_default)
    values((select auth.uid()),case when custom then null else catalog.id end,
      case when custom then nullif(btrim(p_device->>'custom_manufacturer'),'') end,
      case when custom then nullif(btrim(p_device->>'custom_model'),'') end,
      case when custom then nullif(btrim(p_device->>'custom_name'),'') end,
      btrim(p_device->>'alias'),nullif(btrim(p_device->>'serial_number'),''),nullif(btrim(p_device->>'internal_id'),''),
      coalesce((p_device->>'is_active')::boolean,true),coalesce((p_device->>'is_default')::boolean,false)) returning * into result;
  else
    update public.professional_devices set
      catalog_device_id=case when custom then null else catalog.id end,
      custom_manufacturer=case when custom then nullif(btrim(p_device->>'custom_manufacturer'),'') end,
      custom_model=case when custom then nullif(btrim(p_device->>'custom_model'),'') end,
      custom_name=case when custom then nullif(btrim(p_device->>'custom_name'),'') end,
      alias=btrim(p_device->>'alias'), serial_number=nullif(btrim(p_device->>'serial_number'),''),
      internal_id=nullif(btrim(p_device->>'internal_id'),''),
      is_active=coalesce((p_device->>'is_active')::boolean,true),
      is_default=coalesce((p_device->>'is_default')::boolean,false) and coalesce((p_device->>'is_active')::boolean,true), updated_at=now()
    where id=requested_id and professional_id=(select auth.uid()) returning * into result;
    if not found then raise exception 'Professional device not found' using errcode='42501'; end if;
  end if;
  delete from public.professional_device_capabilities where professional_device_id=result.id;
  if custom then
    insert into public.professional_device_capabilities(professional_device_id,professional_id,measurement_type_id,manufacturer_variable_name,manufacturer_unit,display_order)
    select result.id,result.professional_id,mt.id,mt.display_name,mt.unit,row_number() over(order by mt.display_order)
    from public.measurement_types mt where mt.id=any(p_capability_ids) and mt.is_active and (mt.category='bioimpedance' or mt.code='weight');
    if (select count(*) from public.professional_device_capabilities where professional_device_id=result.id)<>coalesce(array_length(p_capability_ids,1),0) then
      raise exception 'One or more custom capabilities are invalid' using errcode='23514';
    end if;
  end if;
  return result;
end $$;
revoke all on function public.save_professional_device(jsonb,text[]) from public, anon;
grant execute on function public.save_professional_device(jsonb,text[]) to authenticated;

create or replace function private.validate_consultation_measurement()
returns trigger language plpgsql security invoker set search_path='' as $$
declare catalog public.measurement_types; consultation_record public.consultations; session_record public.consultation_device_sessions;
begin
  select * into catalog from public.measurement_types where id=new.measurement_type_id;
  if not found or not catalog.is_active or catalog.category='laboratory' then raise exception 'Measurement type is unavailable in this workspace' using errcode='23514'; end if;
  select * into consultation_record from public.consultations where id=new.consultation_id;
  if not found or consultation_record.professional_id<>new.professional_id or consultation_record.patient_id<>new.patient_id or consultation_record.status<>'draft' then
    raise exception 'Measurements can only be saved in an owned draft consultation' using errcode='42501';
  end if;
  if new.device_session_id is not null then
    select * into session_record from public.consultation_device_sessions where id=new.device_session_id;
    if not found or session_record.professional_id<>new.professional_id or session_record.patient_id<>new.patient_id or session_record.consultation_id<>new.consultation_id then
      raise exception 'Device session provenance does not match the consultation' using errcode='23514';
    end if;
    if catalog.category<>'bioimpedance' and catalog.code<>'weight' then raise exception 'This variable is not a device capability' using errcode='23514'; end if;
    if not exists(
      select 1 from public.professional_devices pd
      where pd.id=session_record.professional_device_id and pd.professional_id=new.professional_id and (
        (pd.catalog_device_id is not null and exists(select 1 from public.measurement_device_capabilities mc where mc.device_id=pd.catalog_device_id and mc.measurement_type_id=new.measurement_type_id and mc.mapping_status='verified'))
        or (pd.catalog_device_id is null and exists(select 1 from public.professional_device_capabilities pc where pc.professional_device_id=pd.id and pc.measurement_type_id=new.measurement_type_id))
      )
    ) then raise exception 'Measurement is incompatible with the selected device' using errcode='23514'; end if;
  elsif catalog.category='bioimpedance' then
    raise exception 'Bioimpedance values require explicit device provenance' using errcode='23514';
  end if;
  if new.data_type<>catalog.data_type or new.unit is distinct from catalog.unit then raise exception 'Measurement metadata does not match the catalog' using errcode='23514'; end if;
  if catalog.data_type in ('number','percentage','ratio') then
    if jsonb_typeof(new.value)<>'number' or (new.value#>>'{}')::numeric<catalog.min_value or (new.value#>>'{}')::numeric>catalog.max_value then raise exception 'Measurement value is outside the allowed capture range' using errcode='23514'; end if;
  elsif catalog.data_type='boolean' then
    if jsonb_typeof(new.value)<>'boolean' then raise exception 'Measurement value has an invalid type' using errcode='23514'; end if;
  elsif catalog.data_type='choice' then
    if jsonb_typeof(new.value)<>'string' or (jsonb_array_length(catalog.choice_options)>0 and not catalog.choice_options?(new.value#>>'{}')) then raise exception 'Measurement option is unavailable' using errcode='23514'; end if;
  elsif jsonb_typeof(new.value)<>'string' then raise exception 'Measurement value has an invalid type' using errcode='23514'; end if;
  new.updated_at:=now(); return new;
end $$;

create or replace function public.save_consultation_measurements(p_consultation_id uuid,p_values jsonb)
returns setof public.consultation_measurements language plpgsql security invoker set search_path='' as $$
declare consultation_record public.consultations; item record; item_value jsonb; saved_ids text[]:=array[]::text[];
begin
  if jsonb_typeof(p_values)<>'object' or (select count(*) from jsonb_object_keys(p_values))>200 then raise exception 'Invalid measurement payload' using errcode='23514'; end if;
  select * into consultation_record from public.consultations where id=p_consultation_id for update;
  if not found or consultation_record.professional_id<>(select auth.uid()) or consultation_record.status<>'draft' then raise exception 'Measurements can only be saved in an owned draft consultation' using errcode='42501'; end if;
  for item in select key,value from jsonb_each(p_values) loop
    item_value:=item.value;
    if jsonb_typeof(item_value) not in ('number','string','boolean') then raise exception 'Invalid measurement value' using errcode='23514'; end if;
    saved_ids:=array_append(saved_ids,item.key);
    insert into public.consultation_measurements(professional_id,patient_id,consultation_id,measurement_type_id,value,unit,data_type,measured_at,device_session_id)
    select consultation_record.professional_id,consultation_record.patient_id,consultation_record.id,catalog.id,item_value,catalog.unit,catalog.data_type,consultation_record.consultation_date,null
    from public.measurement_types catalog where catalog.id=item.key and catalog.category<>'bioimpedance'
    on conflict (professional_id,consultation_id,measurement_type_id) where device_session_id is null
    do update set value=excluded.value,unit=excluded.unit,data_type=excluded.data_type,measured_at=excluded.measured_at,updated_at=now();
    if not found then raise exception 'Measurement type is unavailable in this workspace' using errcode='23514'; end if;
  end loop;
  delete from public.consultation_measurements where professional_id=consultation_record.professional_id and consultation_id=consultation_record.id and device_session_id is null and not(measurement_type_id=any(saved_ids));
  return query select * from public.consultation_measurements where professional_id=consultation_record.professional_id and consultation_id=consultation_record.id and device_session_id is null order by created_at;
end $$;

create or replace function public.save_device_measurements(p_consultation_id uuid,p_professional_device_id uuid,p_values jsonb,p_capture_source text default 'manual')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.consultations; pd public.professional_devices; md public.measurement_devices; s public.consultation_device_sessions; item record; catalog public.measurement_types; ids text[]:=array[]::text[]; snapshot jsonb;
begin
  if jsonb_typeof(p_values)<>'object' or p_values='{}'::jsonb or (select count(*) from jsonb_object_keys(p_values))>100 then raise exception 'Enter at least one valid device value' using errcode='23514'; end if;
  if p_capture_source not in ('manual','imported','integration','other') then raise exception 'Invalid capture source' using errcode='23514'; end if;
  select * into c from public.consultations where id=p_consultation_id for update;
  if not found or c.professional_id<>(select auth.uid()) or c.status<>'draft' then raise exception 'Measurements can only be saved in an owned draft consultation' using errcode='42501'; end if;
  select * into pd from public.professional_devices where id=p_professional_device_id and professional_id=(select auth.uid());
  if not found or not pd.is_active then raise exception 'Professional device is unavailable' using errcode='23514'; end if;
  if pd.catalog_device_id is not null then select * into md from public.measurement_devices where id=pd.catalog_device_id; end if;
  snapshot:=jsonb_build_object('professional_device_id',pd.id,'alias',pd.alias,'serial_number',pd.serial_number,'internal_id',pd.internal_id,'catalog_device_id',pd.catalog_device_id,
    'manufacturer',coalesce(md.manufacturer,pd.custom_manufacturer),'model',coalesce(md.model,pd.custom_model),'commercial_name',coalesce(md.commercial_name,pd.custom_name,pd.alias),
    'technology',coalesce(md.technology,'Equipo personalizado'),'is_standard',pd.catalog_device_id is not null,'captured_at',now());
  insert into public.consultation_device_sessions(professional_id,patient_id,consultation_id,professional_device_id,capture_source,device_snapshot,measured_at)
  values(c.professional_id,c.patient_id,c.id,pd.id,p_capture_source,snapshot,c.consultation_date)
  on conflict(professional_id,consultation_id,professional_device_id) do update set updated_at=now()
  returning * into s;
  for item in select key,value from jsonb_each(p_values) loop
    if jsonb_typeof(item.value)<>'number' then raise exception 'Device values must be numeric' using errcode='23514'; end if;
    select * into catalog from public.measurement_types where id=item.key;
    if not found then raise exception 'Unknown device measurement' using errcode='23514'; end if;
    ids:=array_append(ids,item.key);
    insert into public.consultation_measurements(professional_id,patient_id,consultation_id,measurement_type_id,value,unit,data_type,measured_at,device_session_id)
    values(c.professional_id,c.patient_id,c.id,catalog.id,item.value,catalog.unit,catalog.data_type,c.consultation_date,s.id)
    on conflict(device_session_id,measurement_type_id) where device_session_id is not null
    do update set value=excluded.value,unit=excluded.unit,data_type=excluded.data_type,measured_at=excluded.measured_at,updated_at=now();
  end loop;
  delete from public.consultation_measurements where device_session_id=s.id and not(measurement_type_id=any(ids));
  return jsonb_build_object('session',to_jsonb(s),'values',coalesce((select jsonb_agg(to_jsonb(cm) order by cm.created_at) from public.consultation_measurements cm where cm.device_session_id=s.id),'[]'::jsonb));
end $$;
revoke all on function public.save_device_measurements(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.save_device_measurements(uuid,uuid,jsonb,text) to authenticated;
