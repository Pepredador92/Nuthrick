begin;
-- A previously shared invitation must not remain valid if the appointment
-- is reassigned to another patient from the existing linking UI.
create function private.appointment_patient_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.patient_id is distinct from old.patient_id then
  delete from private.appointment_links where entry_id=new.id;
  if old.patient_id is not null then new.patient_confirmed_at:=null; end if;
 end if;
 return new;
end $$;
create trigger appointment_patient_changed before update of patient_id on public.agenda_entries
 for each row execute function private.appointment_patient_changed();
revoke all on function private.appointment_patient_changed() from public,anon,authenticated;
grant execute on function private.appointment_patient_changed() to service_role;

-- Manual appointments without email remain cancellable without queuing
-- a message to a missing recipient. Calendar cancellation is unchanged.
do $$ declare original text; amended text; begin
 original:=pg_get_functiondef('public.agenda_manage(uuid,uuid,jsonb,uuid)'::regprocedure);
 amended:=replace(original,
 'insert into private.agenda_outbox(professional_id,subject_id,kind) values(p_actor,e.id,''cancellation'') on conflict do nothing;',
 'if nullif(btrim(e.contact_email),'''') is not null then
 insert into private.agenda_outbox(professional_id,subject_id,kind) values(p_actor,e.id,''cancellation'') on conflict do nothing; end if;');
 if amended=original then raise exception 'cancellation_patch_missing'; end if;
 execute amended;
end $$;
commit;
