alter table public.consultation_templates
  add column description text,
  add column estimated_duration_minutes integer,
  add column display_order integer not null default 0,
  add constraint consultation_templates_description_length
    check (description is null or char_length(description) <= 600),
  add constraint consultation_templates_duration_range
    check (estimated_duration_minutes is null or estimated_duration_minutes between 5 and 480),
  add constraint consultation_templates_display_order_nonnegative
    check (display_order >= 0);

update public.consultation_templates
set description = case
  when consultation_type = 'initial' then 'Entrevista clínico-nutricional para conocer el motivo de consulta, antecedentes, hábitos y objetivos.'
  else 'Revisión de evolución, barreras, cambios de salud y acuerdos para el siguiente periodo.'
end
where description is null and is_system;

update public.consultation_templates
set estimated_duration_minutes = case
  when template_key like '%brief%' then 30
  when consultation_type = 'initial' then 60
  else 45
end
where estimated_duration_minutes is null and is_system;

with ordered as (
  select id, row_number() over (
    partition by professional_id, consultation_type
    order by is_default desc, created_at, id
  ) - 1 as position
  from public.consultation_templates
)
update public.consultation_templates t
set display_order = ordered.position
from ordered where ordered.id = t.id;

create index consultation_templates_catalog_idx
  on public.consultation_templates
  (professional_id, consultation_type, is_active, is_default desc, display_order, created_at);

create or replace function public.copy_consultation_template(source_id uuid, new_key text)
returns public.consultation_templates language plpgsql security invoker set search_path = '' as $$
declare source public.consultation_templates; result public.consultation_templates; next_order integer;
begin
  perform 1 from public.professional_profiles where id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Profile unavailable'; end if;
  select * into source from public.consultation_templates where id = source_id
    and (is_system or professional_id = (select auth.uid()));
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
  select coalesce(max(display_order), -1) + 1 into next_order
  from public.consultation_templates
  where professional_id = (select auth.uid()) and consultation_type = source.consultation_type;
  insert into public.consultation_templates
    (professional_id, template_key, name, description, estimated_duration_minutes,
     display_order, consultation_type, version, source_template_id, is_default, is_active)
  values
    ((select auth.uid()), new_key, left(source.name, 100) || ' · copia',
     source.description, source.estimated_duration_minutes, next_order,
     source.consultation_type, 1, source.id, false, true)
  returning * into result;
  insert into public.consultation_template_sections
    (template_id, section_key, title, description, display_order, is_active)
  select result.id, section_key, title, description, display_order, is_active
  from public.consultation_template_sections where template_id = source.id;
  insert into public.consultation_template_questions
    (section_id, question_key, label, help_text, question_type, response_area,
     is_required, display_order, is_active, configuration, visibility_condition)
  select copied.id, q.question_key, q.label, q.help_text, q.question_type,
    q.response_area, q.is_required, q.display_order, q.is_active,
    q.configuration, q.visibility_condition
  from public.consultation_template_questions q
  join public.consultation_template_sections original on original.id = q.section_id
  join public.consultation_template_sections copied
    on copied.template_id = result.id and copied.section_key = original.section_key
  where original.template_id = source.id;
  return result;
end;
$$;

create function public.set_consultation_template_default(target_template uuid)
returns public.consultation_templates language plpgsql security invoker set search_path = '' as $$
declare selected public.consultation_templates;
begin
  select * into selected from public.consultation_templates
  where id = target_template and professional_id = (select auth.uid())
    and not is_system and is_active for update;
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
  update public.consultation_templates set is_default = false
  where professional_id = (select auth.uid())
    and consultation_type = selected.consultation_type and is_default;
  update public.consultation_templates set is_default = true
  where id = selected.id returning * into selected;
  return selected;
end;
$$;

create function public.save_consultation_template_details(
  target_template uuid,
  expected_updated_at timestamptz,
  template_data jsonb,
  section_data jsonb,
  question_data jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(template_data) <> 'object' then
    raise exception 'Invalid template metadata';
  end if;
  perform public.save_consultation_template(
    target_template, expected_updated_at, section_data, question_data
  );
  update public.consultation_templates
  set name = template_data->>'name',
      description = nullif(btrim(template_data->>'description'), ''),
      estimated_duration_minutes = nullif(template_data->>'estimated_duration_minutes', '')::integer,
      display_order = (template_data->>'display_order')::integer
  where id = target_template and professional_id = (select auth.uid()) and not is_system;
  if not found then raise insufficient_privilege using message = 'Template unavailable'; end if;
end;
$$;

revoke all on function public.set_consultation_template_default(uuid) from public, anon;
grant execute on function public.set_consultation_template_default(uuid) to authenticated;
revoke all on function public.save_consultation_template_details(uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_consultation_template_details(uuid,timestamptz,jsonb,jsonb,jsonb) to authenticated;
