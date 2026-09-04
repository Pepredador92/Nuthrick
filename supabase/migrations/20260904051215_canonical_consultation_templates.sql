-- Nuthrick ships only two official consultation bases. Professionals can copy
-- either base and edit their own private templates from there.
update public.consultation_templates
set is_active = false,
    is_default = false
where is_system
  and template_key in ('system_initial_v1', 'system_initial_brief_v1', 'system_follow_up_brief_v1');

update public.consultation_templates
set is_active = true,
    is_default = false,
    display_order = case template_key
      when 'system_initial_v2' then 0
      when 'system_follow_up_v1' then 1
      else display_order
    end,
    name = case template_key
      when 'system_initial_v2' then 'Consulta de inicio'
      when 'system_follow_up_v1' then 'Consulta de seguimiento'
      else name
    end
where is_system
  and template_key in ('system_initial_v2', 'system_follow_up_v1');

update public.consultation_templates personal
set is_default = false,
    is_active = false
where not personal.is_system
  and (
    personal.source_template_id in (
      select id
      from public.consultation_templates
      where template_key in ('system_initial_brief_v1', 'system_follow_up_brief_v1')
    )
    or (
      personal.template_key like 'personal-initial-%'
      and not exists (
        select 1
        from public.consultation_snapshots snapshots
        where snapshots.template_id = personal.id
      )
    )
  );
