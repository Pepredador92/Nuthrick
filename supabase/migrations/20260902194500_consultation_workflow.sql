-- Guided consultations: versioned templates, immutable snapshots and private answers.
-- Historical consultations keep the question structure that was used at the time.

alter table public.consultations
  add column if not exists completed_at timestamptz;

update public.consultations
set status = 'draft'
where status = 'planned';

alter table public.consultations
  alter column status set default 'draft',
  drop constraint if exists consultations_status_check,
  add constraint consultations_status_check
    check (status in ('draft', 'completed', 'cancelled'));

create unique index if not exists consultations_one_open_draft_per_type_idx
  on public.consultations (professional_id, patient_id, consultation_type)
  where status = 'draft';

create index if not exists consultations_owner_drafts_idx
  on public.consultations (professional_id, patient_id, updated_at desc)
  where status = 'draft';

create table public.consultation_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professional_profiles(id) on delete cascade,
  template_key text not null unique check (template_key ~ '^[a-z0-9][a-z0-9_-]{2,119}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  consultation_type text not null check (consultation_type in ('initial', 'follow_up')),
  version integer not null default 1 check (version > 0),
  source_template_id uuid references public.consultation_templates(id) on delete set null,
  is_system boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_system and professional_id is null and not is_default) or (not is_system and professional_id is not null))
);

create unique index consultation_templates_one_default_idx
  on public.consultation_templates (professional_id, consultation_type)
  where is_default and is_active and not is_system;
create index consultation_templates_owner_type_idx
  on public.consultation_templates (professional_id, consultation_type, updated_at desc)
  where not is_system;

create table public.consultation_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.consultation_templates(id) on delete cascade,
  section_key text not null check (section_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 600),
  display_order integer not null check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, section_key),
  unique (template_id, display_order)
);
create index consultation_template_sections_template_idx
  on public.consultation_template_sections (template_id, display_order)
  where is_active;

create table public.consultation_template_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.consultation_template_sections(id) on delete cascade,
  question_key text not null check (question_key ~ '^[a-z0-9][a-z0-9_-]{1,119}$'),
  label text not null check (char_length(btrim(label)) between 2 and 500),
  help_text text check (help_text is null or char_length(help_text) <= 1200),
  question_type text not null check (question_type in ('short_text', 'long_text', 'boolean', 'select', 'multi_select', 'number', 'date', 'time', 'repeatable_group')),
  response_area text not null default 'patient_reported' check (response_area in ('patient_reported', 'professional_assessment')),
  is_required boolean not null default false,
  display_order integer not null check (display_order >= 0),
  is_active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  visibility_condition jsonb check (visibility_condition is null or jsonb_typeof(visibility_condition) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, question_key),
  unique (section_id, display_order)
);
create index consultation_template_questions_section_idx
  on public.consultation_template_questions (section_id, display_order)
  where is_active;

create table public.consultation_snapshots (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  consultation_id uuid not null,
  patient_id uuid not null,
  template_id uuid references public.consultation_templates(id) on delete set null,
  template_name text not null check (char_length(btrim(template_name)) between 2 and 120),
  template_version integer not null check (template_version > 0),
  structure jsonb not null check (jsonb_typeof(structure) = 'object'),
  created_at timestamptz not null default now(),
  unique (professional_id, consultation_id),
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete cascade
);
create index consultation_snapshots_patient_idx
  on public.consultation_snapshots (professional_id, patient_id, created_at desc);

create table public.consultation_answers (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  consultation_id uuid not null,
  patient_id uuid not null,
  question_key text not null check (question_key ~ '^[a-z0-9][a-z0-9_-]{1,119}$'),
  section_key text not null check (section_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  response_area text not null check (response_area in ('patient_reported', 'professional_assessment')),
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, consultation_id, question_key),
  foreign key (professional_id, consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete cascade
);
create index consultation_answers_consultation_idx
  on public.consultation_answers (professional_id, consultation_id, section_key);

create trigger consultation_templates_updated_at before update on public.consultation_templates
for each row execute function private.set_updated_at();
create trigger consultation_template_sections_updated_at before update on public.consultation_template_sections
for each row execute function private.set_updated_at();
create trigger consultation_template_questions_updated_at before update on public.consultation_template_questions
for each row execute function private.set_updated_at();
create trigger consultation_answers_updated_at before update on public.consultation_answers
for each row execute function private.set_updated_at();

-- A started template is a historical record. Only an explicit private copy is editable.
alter table public.consultation_templates enable row level security;
alter table public.consultation_template_sections enable row level security;
alter table public.consultation_template_questions enable row level security;
alter table public.consultation_snapshots enable row level security;
alter table public.consultation_answers enable row level security;

create policy consultation_templates_select on public.consultation_templates for select to authenticated
  using (is_system or (select auth.uid()) = professional_id);
create policy consultation_templates_insert on public.consultation_templates for insert to authenticated
  with check (coalesce(professional_id, (select auth.uid())) = (select auth.uid()) and not coalesce(is_system, false));
create policy consultation_templates_update on public.consultation_templates for update to authenticated
  using ((select auth.uid()) = professional_id and not is_system)
  with check ((select auth.uid()) = professional_id and not is_system);
create policy consultation_templates_delete on public.consultation_templates for delete to authenticated
  using ((select auth.uid()) = professional_id and not is_system);

create policy consultation_template_sections_select on public.consultation_template_sections for select to authenticated
  using (exists (select 1 from public.consultation_templates t where t.id = template_id and (t.is_system or t.professional_id = (select auth.uid()))));
create policy consultation_template_sections_write on public.consultation_template_sections for all to authenticated
  using (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.consultation_templates t where t.id = template_id and t.professional_id = (select auth.uid()) and not t.is_system));

create policy consultation_template_questions_select on public.consultation_template_questions for select to authenticated
  using (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and (t.is_system or t.professional_id = (select auth.uid()))));
create policy consultation_template_questions_write on public.consultation_template_questions for all to authenticated
  using (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system))
  with check (exists (select 1 from public.consultation_template_sections s join public.consultation_templates t on t.id = s.template_id where s.id = section_id and t.professional_id = (select auth.uid()) and not t.is_system));

create policy consultation_snapshots_select on public.consultation_snapshots for select to authenticated
  using ((select auth.uid()) = professional_id);
create policy consultation_snapshots_insert on public.consultation_snapshots for insert to authenticated
  with check ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = consultation_id and c.patient_id = patient_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));

create policy consultation_answers_select on public.consultation_answers for select to authenticated
  using ((select auth.uid()) = professional_id);
create policy consultation_answers_insert on public.consultation_answers for insert to authenticated
  with check ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = consultation_id and c.patient_id = patient_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));
create policy consultation_answers_update on public.consultation_answers for update to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = consultation_id and c.professional_id = (select auth.uid()) and c.status = 'draft'))
  with check ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = consultation_id and c.patient_id = patient_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));
create policy consultation_answers_delete on public.consultation_answers for delete to authenticated
  using ((select auth.uid()) = professional_id and exists (select 1 from public.consultations c where c.id = consultation_id and c.professional_id = (select auth.uid()) and c.status = 'draft'));

-- Completed and cancelled consultations are read-only. New clinical work starts as a draft.
drop policy if exists consultations_owner_all on public.consultations;
create policy consultations_owner_select on public.consultations for select to authenticated
  using ((select auth.uid()) = professional_id);
create policy consultations_owner_insert on public.consultations for insert to authenticated
  with check ((select auth.uid()) = professional_id and status = 'draft');
create policy consultations_owner_update on public.consultations for update to authenticated
  using ((select auth.uid()) = professional_id and status = 'draft')
  with check ((select auth.uid()) = professional_id and status in ('draft', 'completed', 'cancelled'));
create policy consultations_owner_delete on public.consultations for delete to authenticated
  using ((select auth.uid()) = professional_id and status = 'draft');

grant select, insert, update, delete on public.consultation_templates to authenticated;
grant select, insert, update, delete on public.consultation_template_sections to authenticated;
grant select, insert, update, delete on public.consultation_template_questions to authenticated;
grant select, insert on public.consultation_snapshots to authenticated;
grant select, insert, update, delete on public.consultation_answers to authenticated;

with template_seed(template_key, name, consultation_type, sections) as (
  values
  ('system_initial_v1', 'Consulta de inicio', 'initial',
   '[
     {"key":"motivo","title":"Motivo de consulta","description":"Contexto inicial y expectativas.","questions":[{"key":"main_reason","label":"¿Cuál es el motivo principal de consulta?","type":"long_text","area":"patient_reported","required":true},{"key":"expectations","label":"¿Qué esperas lograr con este acompañamiento?","type":"long_text","area":"patient_reported"},{"key":"previous_nutrition_care","label":"¿Has tenido atención nutricional previa?","type":"boolean","area":"patient_reported"}]},
     {"key":"health_history","title":"Antecedentes de salud","description":"Información referida por la persona; no sustituye valoración médica.","questions":[{"key":"personal_history","label":"Antecedentes personales relevantes","type":"long_text","area":"patient_reported"},{"key":"family_history","label":"Antecedentes familiares relevantes","type":"long_text","area":"patient_reported"},{"key":"diagnoses","label":"Diagnósticos actuales","type":"repeatable_group","area":"patient_reported","configuration":{"fields":["diagnóstico","desde_cuándo","seguimiento"]}},{"key":"medications","label":"Medicamentos","type":"repeatable_group","area":"patient_reported","configuration":{"fields":["nombre","dosis","frecuencia","motivo"]}},{"key":"supplements","label":"Suplementos","type":"repeatable_group","area":"patient_reported","configuration":{"fields":["nombre","dosis","frecuencia","motivo"]}},{"key":"allergies","label":"Alergias, intolerancias o restricciones","type":"long_text","area":"patient_reported"},{"key":"digestive_symptoms","label":"Síntomas digestivos o cambios relevantes","type":"long_text","area":"patient_reported"}]},
     {"key":"dietary_pattern","title":"Alimentación actual","description":"Patrón, horarios y recordatorio de 24 horas.","questions":[{"key":"usual_pattern","label":"Describe tu patrón habitual de alimentación","type":"long_text","area":"patient_reported"},{"key":"meal_schedule","label":"Horarios habituales de comida","type":"long_text","area":"patient_reported"},{"key":"recall_24h","label":"Recordatorio de 24 horas","type":"repeatable_group","area":"patient_reported","configuration":{"fields":["hora","alimento_o_bebida","cantidad_aproximada","lugar_o_contexto"]}},{"key":"hydration","label":"Hidratación habitual","type":"short_text","area":"patient_reported"},{"key":"cooking_context","label":"¿Quién compra o prepara los alimentos?","type":"short_text","area":"patient_reported"}]},
     {"key":"lifestyle","title":"Rutina y contexto","description":"Sueño, movimiento, hábitos y entorno.","questions":[{"key":"sleep","label":"Sueño y descanso","type":"long_text","area":"patient_reported"},{"key":"physical_activity","label":"Actividad física o movimiento cotidiano","type":"long_text","area":"patient_reported"},{"key":"stress","label":"Estrés, emociones o factores que influyen","type":"long_text","area":"patient_reported"},{"key":"schedule_constraints","label":"Horarios, trabajo o barreras de contexto","type":"long_text","area":"patient_reported"}]},
     {"key":"anthropometry","title":"Antropometría base","description":"Registra sólo las mediciones disponibles. El análisis clínico se mantiene manual.","questions":[{"key":"weight_context","label":"Contexto del peso y cambios recientes","type":"long_text","area":"patient_reported"},{"key":"measurement_notes","label":"Notas de medición","type":"long_text","area":"professional_assessment"}]},
     {"key":"assessment","title":"Valoración profesional","description":"Hipótesis y criterio clínico de la profesional.","questions":[{"key":"nutrition_assessment","label":"Valoración nutricional / problema identificado","type":"long_text","area":"professional_assessment","required":true},{"key":"pes_statement","label":"Redacción PES (opcional)","type":"long_text","area":"professional_assessment"},{"key":"clinical_notes","label":"Notas clínicas","type":"long_text","area":"professional_assessment"}]},
     {"key":"objectives","title":"Objetivos y cierre","description":"Acuerdos iniciales y siguientes pasos.","questions":[{"key":"objectives","label":"Objetivos acordados","type":"repeatable_group","area":"professional_assessment","configuration":{"fields":["objetivo","prioridad","fecha_o_revisión"]}},{"key":"first_actions","label":"Primeras acciones acordadas","type":"long_text","area":"professional_assessment"},{"key":"next_appointment","label":"Próxima cita o seguimiento","type":"date","area":"professional_assessment"}]}
   ]'::jsonb),
  ('system_follow_up_v1', 'Consulta de seguimiento', 'follow_up',
   '[
     {"key":"progress","title":"Cambios y progreso","description":"Percepción de avances desde la consulta anterior.","questions":[{"key":"changes_since_last","label":"Cambios desde la última consulta","type":"long_text","area":"patient_reported","required":true},{"key":"progress_perception","label":"¿Qué progreso percibe la persona?","type":"long_text","area":"patient_reported"},{"key":"adherence","label":"Adherencia a los acuerdos","type":"select","area":"patient_reported","configuration":{"options":["Alta","Parcial","Baja","No aplicó"]}}]},
     {"key":"health_changes","title":"Salud y síntomas","description":"Cambios relevantes, síntomas y tratamiento.","questions":[{"key":"symptoms_changes","label":"Síntomas o molestias actuales","type":"long_text","area":"patient_reported"},{"key":"medical_changes","label":"Cambios en diagnóstico, medicamentos o suplementos","type":"long_text","area":"patient_reported"}]},
     {"key":"indicators","title":"Mediciones e indicadores","description":"Anota los datos disponibles; no se generan diagnósticos automáticos.","questions":[{"key":"measurement_notes","label":"Notas de medición e indicadores","type":"long_text","area":"professional_assessment"},{"key":"indicator_progress","label":"Interpretación profesional de la evolución","type":"long_text","area":"professional_assessment"}]},
     {"key":"adjustments","title":"Barreras y ajustes","description":"Identifica lo que facilitó o dificultó el plan.","questions":[{"key":"barriers","label":"Barreras encontradas","type":"long_text","area":"patient_reported"},{"key":"facilitators","label":"Facilitadores o recursos","type":"long_text","area":"patient_reported"},{"key":"adjustments","label":"Ajustes acordados","type":"repeatable_group","area":"professional_assessment","configuration":{"fields":["ajuste","motivo","cómo_aplicarlo"]}}]},
     {"key":"closure","title":"Objetivos y cierre","description":"Acuerdos para el siguiente periodo.","questions":[{"key":"next_objectives","label":"Objetivos del siguiente periodo","type":"repeatable_group","area":"professional_assessment","configuration":{"fields":["objetivo","prioridad","revisión"]}},{"key":"professional_notes","label":"Notas profesionales","type":"long_text","area":"professional_assessment"},{"key":"next_appointment","label":"Próxima cita o seguimiento","type":"date","area":"professional_assessment"}]}
   ]'::jsonb)
), inserted_templates as (
  insert into public.consultation_templates (template_key, name, consultation_type, version, is_system, is_active)
  select template_key, name, consultation_type, 1, true, true from template_seed
  on conflict (template_key) do update set name = excluded.name
  returning id, template_key
), seeded_templates as (
  select it.id, ts.template_key, ts.sections
  from inserted_templates it join template_seed ts using (template_key)
), inserted_sections as (
  insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
  select st.id, section_data.section->>'key', section_data.section->>'title', section_data.section->>'description', section_data.ordinality - 1
  from seeded_templates st cross join lateral jsonb_array_elements(st.sections) with ordinality as section_data(section, ordinality)
  on conflict (template_id, section_key) do nothing
  returning id, template_id, section_key
)
insert into public.consultation_template_questions (section_id, question_key, label, question_type, response_area, is_required, display_order, configuration)
select sec.id, question_data.question->>'key', question_data.question->>'label', question_data.question->>'type', coalesce(question_data.question->>'area', 'patient_reported'), coalesce((question_data.question->>'required')::boolean, false), question_data.ordinality - 1, coalesce(question_data.question->'configuration', '{}'::jsonb)
from inserted_sections sec
join seeded_templates st on st.id = sec.template_id
cross join lateral jsonb_array_elements(st.sections) as section_data(section)
cross join lateral jsonb_array_elements(section_data.section->'questions') with ordinality as question_data(question, ordinality)
where section_data.section->>'key' = sec.section_key;
