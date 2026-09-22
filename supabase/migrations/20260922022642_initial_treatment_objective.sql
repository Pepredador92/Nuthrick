-- Only the official template changes. Existing snapshots/answers, including
-- closed histories and customized templates, remain untouched.
do $template$
declare tid uuid; sid uuid; next_order integer;
begin
  select id into strict tid from public.consultation_templates
    where template_key='system_initial_v2' and is_system;
  if not exists (select 1 from public.consultation_template_sections
    where template_id=tid and section_key='treatment_objective') then
    select coalesce(max(display_order),-1)+1 into next_order
      from public.consultation_template_sections where template_id=tid;
    insert into public.consultation_template_sections(template_id,section_key,title,description,display_order)
      values(tid,'treatment_objective','Objetivo del tratamiento nutricional',null,next_order)
      returning id into sid;
    insert into public.consultation_template_questions(section_id,question_key,label,help_text,question_type,response_area,is_required,display_order,configuration)
      values(sid,'treatment_objective','Objetivo acordado con el paciente',
        'Define en una frase clara el objetivo acordado con el paciente.',
        'long_text','professional_assessment',false,0,'{"max_length":2000}');
    update public.consultation_templates set version=version+1 where id=tid;
  end if;
end;
$template$;

-- One source per consultation. Legacy initial objectives remain readable only
-- for snapshots that predate the new question. A blank new field never falls
-- back to an unrelated answer. Publication still requires patient_portal.publish.
create or replace function private.portal_goals(pid uuid,owner_id uuid)
returns table("consultationId" uuid,date timestamptz,revision integer,"questionKey" text,content text)
language sql stable security invoker set search_path='' as $goal$
  select c.id,c.consultation_date::timestamptz,s.revision,a.question_key,rendered.content
  from public.consultations c
  join public.consultation_snapshots s on s.consultation_id=c.id and s.patient_id=c.patient_id and s.professional_id=c.professional_id
  join public.consultation_answers a on a.consultation_id=c.id and a.patient_id=c.patient_id and a.professional_id=c.professional_id and a.revision=s.revision
  cross join lateral (
    select case when jsonb_typeof(a.value)='string' then btrim(a.value#>>'{}')
      when a.question_key<>'treatment_objective' and jsonb_typeof(a.value)='array' then
        (select string_agg(btrim(e->>'objetivo'),E'\n' order by ord)
         from jsonb_array_elements(a.value) with ordinality t(e,ord)
         where jsonb_typeof(e->'objetivo')='string' and btrim(e->>'objetivo')<>'')
      else null end as content
  ) rendered
  where c.patient_id=pid and c.professional_id=owner_id and c.deleted_at is null and c.status='completed'
    and s.revision=(select max(revision) from public.consultation_snapshots where consultation_id=c.id)
    and a.question_key=case when c.consultation_type='follow_up' then 'next_objectives'
      when exists(select 1 from jsonb_array_elements(s.structure->'sections') section,
        jsonb_array_elements(section->'questions') question where question->>'question_key'='treatment_objective')
        then 'treatment_objective' else 'objectives' end
    and a.response_area='professional_assessment' and length(rendered.content) between 1 and 12000
    and exists(select 1 from jsonb_array_elements(s.structure->'sections') section,
      jsonb_array_elements(section->'questions') question
      where question->>'question_key'=a.question_key and question->>'response_area'='professional_assessment')
  order by c.consultation_date desc,c.id desc;
$goal$;
revoke all on function private.portal_goals(uuid,uuid) from public,anon,authenticated;
grant execute on function private.portal_goals(uuid,uuid) to service_role;
