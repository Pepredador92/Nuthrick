begin;

create table public.patient_clinical_progress_reviews (
  id uuid primary key,
  professional_id uuid not null,
  patient_id uuid not null,
  source_consultation_id uuid not null,
  source_revision integer not null,
  review_consultation_id uuid,
  review_consultation_date timestamptz,
  version integer not null check (version > 0),
  recorded_at timestamptz not null default clock_timestamp(),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  unique (professional_id, source_consultation_id, source_revision, version),
  foreign key (professional_id, source_consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete cascade,
  foreign key (professional_id, source_consultation_id, source_revision)
    references public.consultation_snapshots (professional_id, consultation_id, revision) on delete cascade,
  foreign key (professional_id, review_consultation_id, patient_id)
    references public.consultations (professional_id, id, patient_id) on delete set null (review_consultation_id)
);

create index patient_clinical_progress_patient_idx
  on public.patient_clinical_progress_reviews (professional_id, patient_id);
create index patient_clinical_progress_review_visit_idx
  on public.patient_clinical_progress_reviews (professional_id, review_consultation_id, patient_id)
  where review_consultation_id is not null;

alter table public.patient_clinical_progress_reviews enable row level security;
revoke all on public.patient_clinical_progress_reviews from public, anon, authenticated;
grant select on public.patient_clinical_progress_reviews to authenticated;
create policy patient_clinical_progress_read_own
  on public.patient_clinical_progress_reviews for select to authenticated
  using (professional_id = (select auth.uid())
    and (select private.my_read_feature('consultations')) and exists (
    select 1 from public.patients p
    where p.id = patient_id and p.professional_id = (select auth.uid()) and p.deleted_at is null
  ));

-- One current, completed revision per visit, plus older sources with saved reviews.
create function public.patient_clinical_progress_sources(p_patient uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visits as (
    select c.*, latest.revision as current_revision
    from public.consultations c
    join public.patients p on p.id = c.patient_id and p.professional_id = c.professional_id
    join lateral (
      select revision from public.consultation_snapshots
      where professional_id = c.professional_id and consultation_id = c.id
      order by revision desc limit 1
    ) latest on true
    where c.professional_id = (select auth.uid()) and c.patient_id = p_patient and p.deleted_at is null
  ), sources as (
    select v.id, v.consultation_date, v.display_name, v.consultation_type, v.sequence_number, s.revision,
      v.status = 'completed' and v.deleted_at is null and s.revision = v.current_revision as current,
      case when s.clinical_records->'objective'->>'approved_at' is not null
        and s.clinical_records->'objective'->>'pes_approved_at' = s.clinical_records->'pes'->>'approved_at'
        then s.clinical_records->'objective'->'smart_plan' end as objective,
      coalesce(instructions.items, '[]') as instructions,
      coalesce(strategies.items, '[]') as strategies,
      coalesce(legacy.items, '[]') as legacy_objectives,
      case when r.id is not null then to_jsonb(r) || jsonb_build_object('latest_linked_visit_date', links.latest_date) end as latest_review
    from visits v
    join public.consultation_snapshots s on s.consultation_id = v.id and s.professional_id = v.professional_id
    left join lateral (
      select id, version, recorded_at, review_consultation_id, review_consultation_date, document
      from public.patient_clinical_progress_reviews r
      where r.professional_id = v.professional_id and r.source_consultation_id = v.id and r.source_revision = s.revision
      order by version desc limit 1
    ) r on true
    left join lateral (
      select max(review_consultation_date) as latest_date from public.patient_clinical_progress_reviews
      where professional_id = v.professional_id and source_consultation_id = v.id and source_revision = s.revision
    ) links on r.id is not null
    left join lateral (
      select jsonb_agg(jsonb_build_object('key', a.question_key, 'value', a.value)
        order by array_position(array['first_actions','patient_instructions','recommendations'], a.question_key)) as items
      from public.consultation_answers a
      where a.professional_id = v.professional_id and a.consultation_id = v.id and a.revision = s.revision
        and a.question_key in ('first_actions', 'patient_instructions', 'recommendations')
        and jsonb_typeof(a.value) in ('string', 'number', 'boolean') and btrim(a.value #>> '{}') <> ''
    ) instructions on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', i.id, 'strategy', i.approved->'document'->'strategy')
        order by (i.approved->'document'->'strategy'->>'priority')::integer, i.id) as items
      from public.consultation_interventions i
      where i.professional_id = v.professional_id and i.snapshot_id = s.id
        and i.state in ('approved','executing','completed') and i.approved is not null
        and i.approved->'document'->>'objectiveApprovedAt' = s.clinical_records->'objective'->>'approved_at'
        and i.approved->'document'->>'pesApprovedAt' = s.clinical_records->'pes'->>'approved_at'
    ) strategies on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('key', a.question_key, 'value', a.value, 'question', q.value) order by a.question_key) as items
      from public.consultation_answers a
      left join lateral (
        select question.value
        from jsonb_array_elements(s.structure->'sections') section
        cross join lateral jsonb_array_elements(section.value->'questions') question
        where question.value->>'question_key' = a.question_key limit 1
      ) q on true
      where a.professional_id = v.professional_id and a.consultation_id = v.id and a.revision = s.revision
        and a.question_key in ('objectives','treatment_objective','next_objectives')
        and a.question_key is distinct from s.clinical_records->'objective'->>'question_key'
        and not coalesce(s.clinical_records->'objective_plans' ? a.question_key, false)
    ) legacy on true
    where (v.status = 'completed' and v.deleted_at is null and s.revision = v.current_revision) or r.id is not null
  )
  select coalesce(jsonb_agg(to_jsonb(sources) order by consultation_date desc, id, revision desc), '[]')
  from sources;
$$;

revoke all on function public.patient_clinical_progress_sources(uuid) from public, anon, authenticated;
grant execute on function public.patient_clinical_progress_sources(uuid) to authenticated;

-- Append-only writes with a retry key and an expected version. The source lock
-- serializes saves and prevents a concurrent reopen from changing the source.
create function private.save_patient_clinical_progress(
  p_patient uuid, p_source uuid, p_revision integer, p_visit uuid,
  p_expected integer, p_request uuid, p_document jsonb
) returns public.patient_clinical_progress_reviews
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  source_visit public.consultations;
  followup_visit public.consultations;
  previous_version integer;
  saved public.patient_clinical_progress_reviews;
begin
  if owner_id is null or not exists (
    select 1 from public.patients where id = p_patient and professional_id = owner_id and deleted_at is null
  ) then raise exception 'progress_unavailable'; end if;

  select * into source_visit from public.consultations
    where id = p_source and patient_id = p_patient and professional_id = owner_id for update;
  if not found then raise exception 'progress_unavailable'; end if;

  select * into saved from public.patient_clinical_progress_reviews
    where id = p_request and professional_id = owner_id and patient_id = p_patient
      and source_consultation_id = p_source and source_revision = p_revision
      and review_consultation_id is not distinct from p_visit;
  if found then
    if saved.document is distinct from p_document then raise exception 'progress_conflict'; end if;
    return saved;
  end if;

  perform private.require_my_entitlement('consultations');
  perform private.require_retention_patient(owner_id, p_patient);

  if source_visit.status <> 'completed' or source_visit.deleted_at is not null or p_revision is null
    or p_revision is distinct from (select max(revision) from public.consultation_snapshots
      where professional_id = owner_id and consultation_id = p_source) then
    raise exception 'progress_unavailable';
  end if;

  if p_visit is not null then
    select * into followup_visit from public.consultations where id = p_visit and patient_id = p_patient
      and professional_id = owner_id and consultation_type = 'follow_up' and status in ('draft', 'completed')
      and deleted_at is null
      and (consultation_date, sequence_number, id) > (source_visit.consultation_date, source_visit.sequence_number, source_visit.id)
    for share;
    if not found then raise exception 'progress_unavailable'; end if;
    if exists (
      select 1 from public.patient_clinical_progress_reviews r
      where r.professional_id = owner_id and r.source_consultation_id = p_source and r.source_revision = p_revision
        and r.review_consultation_date > followup_visit.consultation_date
    ) then raise exception 'progress_later_review'; end if;
  end if;

  select max(version) into previous_version from public.patient_clinical_progress_reviews
    where professional_id = owner_id and source_consultation_id = p_source and source_revision = p_revision;
  if p_expected is distinct from coalesce(previous_version, 0) then raise exception 'progress_conflict'; end if;

  if p_request is null or jsonb_typeof(p_document) is distinct from 'object'
    or p_document - array['goals','strategies','instructions'] <> '{}'::jsonb
    or jsonb_typeof(p_document->'goals') is distinct from 'array'
    or jsonb_typeof(p_document->'strategies') is distinct from 'array'
    or jsonb_typeof(p_document->'instructions') is distinct from 'string' then raise exception 'progress_invalid'; end if;

  if octet_length(p_document::text) > 1000000 then raise exception 'progress_invalid'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_document->'goals') g
    where jsonb_typeof(g) <> 'object' or jsonb_typeof(g->'id') is distinct from 'string'
      or (g->>'id') !~ '[^[:space:]]'
      or jsonb_typeof(g->'text') is distinct from 'string' or (g->>'text') !~ '[^[:space:]]'
      or jsonb_typeof(g->'assessment') is distinct from 'object'
      or coalesce(g#>>'{assessment,status}', '') not in ('unreviewed','partial','achieved','no_progress')
      or jsonb_typeof(g#>'{assessment,result}') is distinct from 'string'
      or jsonb_typeof(g#>'{assessment,note}') is distinct from 'string'
  ) or exists (
    select 1 from jsonb_array_elements(p_document->'strategies') s
    where jsonb_typeof(s) <> 'object' or jsonb_typeof(s->'id') is distinct from 'string'
      or (s->>'id') !~ '[^[:space:]]'
      or jsonb_typeof(s->'text') is distinct from 'string' or (s->>'text') !~ '[^[:space:]]'
      or jsonb_typeof(s->'goalIds') is distinct from 'array'
      or jsonb_typeof(s->'assessment') is distinct from 'object'
      or coalesce(s#>>'{assessment,status}', '') not in ('unreviewed','partial','applied','not_applied')
  ) then raise exception 'progress_invalid'; end if;

  if exists (
    select 1 from (
      select item->>'id' as id from jsonb_array_elements(p_document->'goals') item
      union all
      select item->>'id' from jsonb_array_elements(p_document->'strategies') item
    ) ids group by id having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_document->'strategies') s
    cross join lateral jsonb_array_elements(s->'goalIds') link
    where jsonb_typeof(link) <> 'string' or not exists (
      select 1 from jsonb_array_elements(p_document->'goals') g where g->'id' = link
    )
  ) then raise exception 'progress_invalid'; end if;

  insert into public.patient_clinical_progress_reviews (
    id, professional_id, patient_id, source_consultation_id, source_revision,
    review_consultation_id, review_consultation_date, version, document
  ) values (p_request, owner_id, p_patient, p_source, p_revision, p_visit,
    followup_visit.consultation_date, coalesce(previous_version, 0) + 1, p_document)
  returning * into saved;
  return saved;
end;
$$;

revoke all on function private.save_patient_clinical_progress(uuid, uuid, integer, uuid, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.save_patient_clinical_progress(uuid, uuid, integer, uuid, integer, uuid, jsonb) to authenticated;

create function public.save_patient_clinical_progress(
  p_patient uuid, p_source uuid, p_revision integer, p_visit uuid,
  p_expected integer, p_request uuid, p_document jsonb
) returns public.patient_clinical_progress_reviews
language sql security invoker set search_path = '' as $$
  select private.save_patient_clinical_progress(p_patient, p_source, p_revision, p_visit, p_expected, p_request, p_document);
$$;

revoke all on function public.save_patient_clinical_progress(uuid, uuid, integer, uuid, integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_patient_clinical_progress(uuid, uuid, integer, uuid, integer, uuid, jsonb) to authenticated;

commit;
