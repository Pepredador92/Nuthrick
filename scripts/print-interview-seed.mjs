// Print, do not apply, the data migration. Source of truth is the typed template.
// Run with Node >=22.13: node --experimental-strip-types scripts/print-interview-seed.mjs
import { initialInterview, interviewTemplateKey, interviewTemplateName, interviewTemplateVersion } from '../frontend/src/features/consultations/interviewTemplate.ts';

console.log(`-- Generated from frontend/src/features/consultations/interviewTemplate.ts.
-- New template only: no personal templates, consultations or answers are changed.
do $seed$
declare structure jsonb := $interview$${JSON.stringify(initialInterview, null, 2)}$interview$::jsonb;
  template_id uuid; section_id uuid; section_item jsonb; question_item jsonb;
  section_order integer := 0; question_order integer;
begin
  insert into public.consultation_templates (template_key, name, consultation_type, version, is_system, is_active)
    values ('${interviewTemplateKey}', '${interviewTemplateName}', 'initial', ${interviewTemplateVersion}, true, true)
    returning id into template_id;
  for section_item in select * from jsonb_array_elements(structure->'sections') loop
    insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
      values (template_id, section_item->>'section_key', section_item->>'title', section_item->>'description', section_order)
      returning id into section_id;
    question_order := 0;
    for question_item in select * from jsonb_array_elements(section_item->'questions') loop
      insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, configuration, visibility_condition)
        values (section_id, question_item->>'question_key', question_item->>'label', question_item->>'help_text', question_item->>'question_type',
          question_item->>'response_area', (question_item->>'is_required')::boolean, question_order,
          question_item->'configuration', question_item->'visibility_condition');
      question_order := question_order + 1;
    end loop;
    section_order := section_order + 1;
  end loop;
  update public.consultation_templates set is_active = false where template_key = 'system_initial_v1' and is_system;
end;
$seed$;
`);
