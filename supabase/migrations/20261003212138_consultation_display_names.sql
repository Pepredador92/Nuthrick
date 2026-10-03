begin;

alter table public.consultations add column display_name text
  constraint consultation_display_name_length check (
    display_name is null or (char_length(display_name) between 1 and 120 and display_name = btrim(display_name))
  );

-- Completed clinical content stays read-only. This narrowly scoped operation
-- changes only the presentation name, without reopening or revising a visit.
create function private.rename_consultation(target_consultation uuid, requested_name text, expected_name text)
returns public.consultations language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result public.consultations;
  normalized_name text := nullif(btrim(requested_name), '');
begin
  if actor is null then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  if char_length(normalized_name) > 120 then raise exception 'consultation_name_too_long' using errcode = '22023'; end if;
  select c.* into result from public.consultations c
    where c.id = target_consultation and c.professional_id = actor and c.deleted_at is null
      and exists (select 1 from public.patients p where p.id = c.patient_id and p.professional_id = actor and p.deleted_at is null)
    for update;
  if not found then raise insufficient_privilege using message = 'Consultation unavailable'; end if;
  perform private.require_entitlement(actor, 'consultations');
  if result.display_name is distinct from expected_name then raise exception 'consultation_name_conflict' using errcode = '40001'; end if;
  update public.consultations set display_name = normalized_name
    where id = target_consultation and professional_id = actor returning * into result;
  return result;
end;
$$;

create function public.rename_consultation(target_consultation uuid, requested_name text, expected_name text default null)
returns public.consultations language sql security invoker set search_path = '' as $$
  select private.rename_consultation(target_consultation, requested_name, expected_name);
$$;

revoke all on function private.rename_consultation(uuid, text, text) from public, anon;
revoke all on function public.rename_consultation(uuid, text, text) from public, anon;
grant execute on function private.rename_consultation(uuid, text, text) to authenticated;
grant execute on function public.rename_consultation(uuid, text, text) to authenticated;

commit;
