-- Remove consultations from the working history without destroying clinical provenance.
begin;
alter table public.consultations add column if not exists deleted_at timestamptz;
alter table public.consultations add constraint consultations_archived_not_draft
  check (deleted_at is null or status <> 'draft');

create or replace function public.delete_consultation_record(target_consultation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.consultations;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Consultation unavailable';
  end if;
  select * into c from public.consultations
    where id = target_consultation and professional_id = (select auth.uid()) for update;
  if not found then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  if c.deleted_at is not null then return; end if;
  update public.consultations
    set deleted_at = now(), status = case when status = 'draft' then 'cancelled' else status end
    where id = c.id and professional_id = (select auth.uid());
end;
$$;
revoke all on function public.delete_consultation_record(uuid) from public, anon;
grant execute on function public.delete_consultation_record(uuid) to authenticated;

create or replace function public.reopen_consultation_for_edit(target_consultation uuid)
returns public.consultations language plpgsql security definer set search_path = '' as $$
declare c public.consultations; previous public.consultation_snapshots; copied public.consultation_snapshots;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Consultation unavailable';
  end if;
  select * into c from public.consultations
    where id = target_consultation and professional_id = (select auth.uid()) and deleted_at is null for update;
  if not found then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  if c.status = 'draft' then return c; end if;
  select * into previous from public.consultation_snapshots
    where consultation_id = c.id and professional_id = (select auth.uid())
    order by revision desc limit 1;
  if previous.id is not null then
    insert into public.consultation_snapshots (
      professional_id, consultation_id, patient_id, template_id, template_name,
      template_version, structure, revision
    ) values (
      previous.professional_id, previous.consultation_id, previous.patient_id,
      previous.template_id, previous.template_name, previous.template_version,
      previous.structure, previous.revision + 1
    ) returning * into copied;
    insert into public.consultation_answers (
      professional_id, consultation_id, patient_id, revision, question_key,
      section_key, response_area, value
    ) select professional_id, consultation_id, patient_id, copied.revision,
      question_key, section_key, response_area, value
      from public.consultation_answers
      where consultation_id = c.id and professional_id = (select auth.uid())
        and revision = previous.revision;
  end if;
  update public.consultations set status = 'draft', completed_at = null
    where id = c.id returning * into c;
  return c;
end;
$$;
revoke all on function public.reopen_consultation_for_edit(uuid) from public, anon;
grant execute on function public.reopen_consultation_for_edit(uuid) to authenticated;
commit;
