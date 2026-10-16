-- Explicitly discard only an owned, never-closed consultation draft.
-- Historical/published visits keep using the existing archive workflow.
alter table public.consultations add column draft_discard_protected boolean not null default false;

create function private.protect_completed_consultation_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.draft_discard_protected := old.draft_discard_protected
      or old.status = 'completed' or old.completed_at is not null
      or old.summary is not null or new.draft_discard_protected;
  end if;
  new.draft_discard_protected := new.draft_discard_protected
    or new.status = 'completed' or new.completed_at is not null;
  return new;
end;
$$;
revoke all on function private.protect_completed_consultation_history() from public, anon, authenticated;
create trigger consultations_protect_completed_history before insert or update on public.consultations
for each row execute function private.protect_completed_consultation_history();

create function private.discard_consultation_draft(p_consultation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.consultations;
begin
  if (select auth.uid()) is null then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  perform private.require_my_entitlement('consultations');
  select * into c from public.consultations
    where id = p_consultation and professional_id = (select auth.uid()) for update;
  -- Idempotent and does not reveal whether a different owner has this ID.
  if not found then return; end if;
  if c.status <> 'draft' or c.deleted_at is not null or c.completed_at is not null
    or c.summary is not null or c.draft_discard_protected
    -- Before the durable flag existed, reopening copied the same template
    -- into another revision. Conservatively protect that older provenance.
    or exists (select 1 from public.consultation_snapshots where consultation_id = c.id
      group by template_id, template_version having count(*) > 1)
    or exists (select 1 from public.consultation_notes where consultation_id = c.id)
    or exists (select 1 from public.patient_notes where consultation_id = c.id)
    or exists (select 1 from public.patient_measurements where consultation_id = c.id)
    or exists (select 1 from public.questionnaire_submissions where consultation_id = c.id) then
    raise exception 'consultation_history_protected' using errcode = '23514';
  end if;
  if exists (select 1 from public.nutrition_plans where consultation_id = c.id)
    or exists (select 1 from public.nutrition_plan_versions where consultation_id = c.id) then
    raise exception 'consultation_plan_linked' using errcode = '23514';
  end if;
  -- These validation triggers need the draft and report parents to still exist.
  -- All operations are part of this transaction; any failure rolls them back.
  delete from public.laboratory_results where consultation_id = c.id and professional_id = c.professional_id;
  delete from public.laboratory_reports where consultation_id = c.id and professional_id = c.professional_id;
  -- Existing composite CASCADE FKs remove answers, snapshots, captured measurements,
  -- calculation results, anthropometry and device sessions of this draft only.
  delete from public.consultations where id = c.id and professional_id = c.professional_id;
end;
$$;
revoke all on function private.discard_consultation_draft(uuid) from public, anon;
grant execute on function private.discard_consultation_draft(uuid) to authenticated;

create function public.discard_consultation_draft(p_consultation uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.discard_consultation_draft(p_consultation);
$$;
revoke all on function public.discard_consultation_draft(uuid) from public, anon;
grant execute on function public.discard_consultation_draft(uuid) to authenticated;
