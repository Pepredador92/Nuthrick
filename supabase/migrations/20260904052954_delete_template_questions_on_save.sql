create or replace function public.save_consultation_template(
  target_template uuid,
  expected_updated_at timestamptz,
  section_data jsonb,
  question_data jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.consultation_templates;
  item jsonb;
  parent uuid;
begin
  select * into t
  from public.consultation_templates
  where id = target_template
    and professional_id = (select auth.uid())
    and not is_system
  for update;
  if not found then
    raise insufficient_privilege using message = 'Private template unavailable';
  end if;
  if t.updated_at <> expected_updated_at then
    raise exception 'Template changed. Reload before saving.';
  end if;
  if jsonb_typeof(section_data) <> 'array'
     or jsonb_typeof(question_data) <> 'array' then
    raise exception 'Invalid template structure';
  end if;

  set constraints public.consultation_sections_order_unique,
    public.consultation_questions_order_unique deferred;

  for item in select * from jsonb_array_elements(section_data) loop
    if exists (
      select 1
      from public.consultation_template_sections
      where id = (item->>'id')::uuid
        and template_id <> t.id
    ) then
      raise insufficient_privilege using message = 'Section belongs to another template';
    end if;

    insert into public.consultation_template_sections (
      id, template_id, section_key, title, description, display_order, is_active
    )
    values (
      (item->>'id')::uuid,
      t.id,
      item->>'section_key',
      item->>'title',
      item->>'description',
      (item->>'display_order')::integer,
      (item->>'is_active')::boolean
    )
    on conflict (id) do update
    set title = excluded.title,
        description = excluded.description,
        display_order = excluded.display_order,
        is_active = excluded.is_active
    where public.consultation_template_sections.template_id = t.id;
  end loop;

  for item in select * from jsonb_array_elements(question_data) loop
    parent := (item->>'section_id')::uuid;
    if not exists (
      select 1
      from public.consultation_template_sections
      where id = parent
        and template_id = t.id
    ) then
      raise insufficient_privilege using message = 'Section unavailable';
    end if;
    if exists (
      select 1
      from public.consultation_template_questions
      where id = (item->>'id')::uuid
        and section_id <> parent
    ) then
      raise insufficient_privilege using message = 'Question belongs to another section';
    end if;

    insert into public.consultation_template_questions (
      id, section_id, question_key, label, help_text, question_type,
      response_area, is_required, display_order, is_active, configuration,
      visibility_condition
    )
    values (
      (item->>'id')::uuid,
      parent,
      item->>'question_key',
      item->>'label',
      item->>'help_text',
      item->>'question_type',
      item->>'response_area',
      (item->>'is_required')::boolean,
      (item->>'display_order')::integer,
      (item->>'is_active')::boolean,
      item->'configuration',
      nullif(item->'visibility_condition', 'null'::jsonb)
    )
    on conflict (id) do update
    set label = excluded.label,
        help_text = excluded.help_text,
        question_type = excluded.question_type,
        response_area = excluded.response_area,
        is_required = excluded.is_required,
        display_order = excluded.display_order,
        is_active = excluded.is_active,
        configuration = excluded.configuration,
        visibility_condition = excluded.visibility_condition
    where public.consultation_template_questions.section_id = parent;
  end loop;

  delete from public.consultation_template_questions q
  using public.consultation_template_sections s
  where q.section_id = s.id
    and s.template_id = t.id
    and not exists (
      select 1
      from jsonb_array_elements(question_data) submitted
      where (submitted->>'id')::uuid = q.id
    );

  if exists (
    select q.question_key
    from public.consultation_template_questions q
    join public.consultation_template_sections s on s.id = q.section_id
    where s.template_id = t.id
    group by q.question_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate question key';
  end if;

  update public.consultation_templates
  set version = version + 1
  where id = t.id;
end;
$$;
