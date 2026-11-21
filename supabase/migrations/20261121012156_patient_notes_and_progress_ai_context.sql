begin;
set local lock_timeout = '5s';

-- The source RPC also reads laboratory reports in its existing context loader.
grant select on public.patient_notes, public.patient_clinical_progress_reviews, public.laboratory_reports to service_role;

-- Add dated observations after the base loader has authorized the patient and
-- revision. New observations change the stamp used to bind and review drafts.
create function private.ai_with_patient_observations(p_context jsonb,p_owner uuid,p_patient uuid,p_consultation uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visit as (
    select c.id,c.consultation_date,c.sequence_number,p.timezone
    from public.consultations c join public.patients p
      on p.id=c.patient_id and p.professional_id=c.professional_id
    where c.id=p_consultation and c.professional_id=p_owner and c.patient_id=p_patient
      and c.deleted_at is null and p.deleted_at is null
  ), notes as (
    select n.id,n.content,n.updated_at,n.consultation_id=v.id as is_current,
      (coalesce(c.consultation_date,n.created_at) at time zone v.timezone)::date as observed_date
    from visit v
    join public.patient_notes n on n.professional_id=p_owner and n.patient_id=p_patient and n.deleted_at is null
    left join public.consultations c on c.id=n.consultation_id and c.professional_id=p_owner and c.patient_id=p_patient
    where n.consultation_id=v.id
      or (c.status='completed' and c.deleted_at is null
        and (c.consultation_date,c.sequence_number,c.id)<(v.consultation_date,v.sequence_number,v.id))
      or (n.consultation_id is null and (n.created_at at time zone v.timezone)::date<=(v.consultation_date at time zone v.timezone)::date)
  ), ranked_notes as (
    select *,row_number() over(partition by coalesce(is_current,false)
      order by observed_date desc,updated_at desc,id) as position
    from notes
  ), most_recent_reviews as (
    select distinct on (r.source_consultation_id) r.document,r.id,
      (coalesce(r.review_consultation_date,r.recorded_at) at time zone v.timezone)::date as observed_date
    from visit v
    join public.patient_clinical_progress_reviews r on r.professional_id=p_owner and r.patient_id=p_patient
    join public.consultations c on c.id=r.source_consultation_id and c.professional_id=p_owner and c.patient_id=p_patient
    left join public.consultations rv on rv.id=r.review_consultation_id and rv.professional_id=p_owner and rv.patient_id=p_patient
    where c.status='completed' and c.deleted_at is null
      and (c.consultation_date,c.sequence_number,c.id)<(v.consultation_date,v.sequence_number,v.id)
      and (rv.id=v.id or (rv.status='completed' and rv.deleted_at is null
        and (rv.consultation_date,rv.sequence_number,rv.id)<(v.consultation_date,v.sequence_number,v.id))
        or (rv.id is null and (coalesce(r.review_consultation_date,r.recorded_at) at time zone v.timezone)::date
           <=(v.consultation_date at time zone v.timezone)::date))
    order by r.source_consultation_id,r.recorded_at desc,r.version desc,r.id
  ), recent_reviews as (
    select * from most_recent_reviews order by observed_date desc,id limit 4
  ), observations as (
    select case when is_current then 0 else 2 end as priority,observed_date,id,position,
      case when is_current then 'Nota de la consulta' else 'Nota previa' end as label,content as finding
    from ranked_notes where is_current or position<=4
    union all
    select 1,r.observed_date,r.id,item.position,item.label,item.finding
    from recent_reviews r
    cross join lateral (
      (select g.position,'Avance de objetivo' as label,concat_ws(E'\n',
        nullif(btrim(g.value->>'text'),''),
        case g.value#>>'{assessment,status}' when 'partial' then 'Avance parcial'
          when 'achieved' then 'Alcanzado' when 'no_progress' then 'Sin avance' end,
        nullif(btrim(g.value#>>'{assessment,result}'),''),
        nullif(btrim(g.value#>>'{assessment,note}'),'')) as finding
       from jsonb_array_elements(r.document->'goals') with ordinality g(value,position)
       where g.value#>>'{assessment,status}' in ('partial','achieved','no_progress')
       order by g.position limit 5)
      union all
      (select s.position,'Avance de estrategia',concat_ws(E'\n',
        nullif(btrim(s.value->>'text'),''),
        case s.value#>>'{assessment,status}' when 'partial' then 'Aplicada en parte'
          when 'applied' then 'Aplicada' when 'not_applied' then 'Todavía no aplicada' end)
       from jsonb_array_elements(r.document->'strategies') with ordinality s(value,position)
       where s.value#>>'{assessment,status}' in ('partial','applied','not_applied')
       order by s.position limit 5)
    ) item
  ), facts as (
    select jsonb_agg(jsonb_build_object(
      'source',label||' · '||observed_date::text,
      'finding',finding,
      'consultation_date',observed_date
    ) order by priority,observed_date desc,position,id,label) as items
    from observations
  )
  select case when items is null then p_context else p_context||jsonb_build_object(
    'facts',coalesce(p_context->'facts','[]'::jsonb)||items,
    'stamp',md5((p_context->>'stamp')||items::text)
  ) end from facts
$$;
revoke all on function private.ai_with_patient_observations(jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.ai_with_patient_observations(jsonb,uuid,uuid,uuid) to service_role;

alter function public.ai_clinical_source(uuid,uuid,uuid,integer) rename to ai_clinical_source_before_patient_observations;
alter function public.ai_clinical_source_before_patient_observations(uuid,uuid,uuid,integer) set schema private;

create function public.ai_clinical_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.ai_with_patient_observations(
    private.ai_clinical_source_before_patient_observations(p_owner,p_patient,p_consultation,p_revision),
    p_owner,p_patient,p_consultation
  )
$$;
revoke all on function public.ai_clinical_source(uuid,uuid,uuid,integer),
  private.ai_clinical_source_before_patient_observations(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_clinical_source(uuid,uuid,uuid,integer),
  private.ai_clinical_source_before_patient_observations(uuid,uuid,uuid,integer) to service_role;

-- Instructions generated from the patient's history may target a completed
-- visit. The draft branch already calls ai_clinical_source and needs no extra read.
create or replace function public.ai_patient_instructions_source(p_owner uuid,p_patient uuid,p_consultation uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; snapshot uuid; stamp text;
begin
  if exists(select 1 from public.consultations where id=p_consultation and patient_id=p_patient and professional_id=p_owner
    and status='draft' and deleted_at is null) then
    return public.ai_clinical_source(p_owner,p_patient,p_consultation,p_revision);
  end if;
  result:=private.ai_patient_instructions_before_interventions(p_owner,p_patient,p_consultation,p_revision);
  select id into snapshot from public.consultation_snapshots where consultation_id=p_consultation
    and professional_id=p_owner and revision=p_revision;
  select coalesce(string_agg(id::text||updated_at::text,',' order by id),'') into stamp
    from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner;
  result:=result||jsonb_build_object(
    'approvedStrategies',private.approved_interventions(p_owner,p_consultation,p_revision),
    'strategyRequired',exists(select 1 from public.consultation_interventions where snapshot_id=snapshot and professional_id=p_owner),
    'stamp',md5((result->>'stamp')||stamp));
  return private.ai_with_patient_observations(result,p_owner,p_patient,p_consultation);
end $$;

commit;
