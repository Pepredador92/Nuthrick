-- Cleanup for pre-release template experiments: official defaults are the two
-- Nuthrick bases. Existing consultation snapshots keep their copied structure.
update public.consultation_templates
set is_default = false
where not is_system;

update public.consultation_templates personal
set is_active = false,
    is_default = false
where not personal.is_system
  and personal.template_key like 'personal-%'
  and personal.source_template_id in (
    select id
    from public.consultation_templates
    where template_key in (
      'system_initial_v2',
      'system_follow_up_v1',
      'system_initial_brief_v1',
      'system_follow_up_brief_v1'
    )
  );
