alter table public.professional_profiles add column show_formula_guidance boolean not null default true;

create table public.consultation_anthropometry (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professional_profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  revision integer not null check (revision > 0),
  measured_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'schemaVersion' = '1' and jsonb_typeof(payload->'results') = 'array' and jsonb_typeof(payload->'input') = 'object'),
  created_at timestamptz not null default now(),
  unique (consultation_id, revision)
);
create index consultation_anthropometry_patient_idx on public.consultation_anthropometry(patient_id, measured_at desc);
create index consultation_anthropometry_owner_idx on public.consultation_anthropometry(professional_id);
alter table public.consultation_anthropometry enable row level security;
create policy anthropometry_select on public.consultation_anthropometry for select to authenticated
  using (professional_id = (select auth.uid()));
create policy anthropometry_insert on public.consultation_anthropometry for insert to authenticated
  with check (professional_id = (select auth.uid()) and exists (
    select 1 from public.consultations c where c.id = consultation_id and c.professional_id = (select auth.uid())
      and c.patient_id = consultation_anthropometry.patient_id and c.status = 'draft'
  ));
grant select, insert on public.consultation_anthropometry to authenticated;
revoke all on public.consultation_anthropometry from anon;

-- Append-only revisions preserve the exact methods, references, results and notes.
-- Locking the consultation serializes saves with closing/cancelling the consultation.
create function private.validate_anthropometry_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare c public.consultations; current_revision integer;
begin
  select * into c from public.consultations where id = new.consultation_id for update;
  if not found or c.professional_id <> (select auth.uid()) or new.professional_id <> c.professional_id
    or new.patient_id <> c.patient_id or c.status <> 'draft' then
    raise insufficient_privilege using message = 'Only an owned draft can be saved';
  end if;
  select coalesce(max(revision), 0) into current_revision from public.consultation_anthropometry where consultation_id = c.id;
  if new.revision <> current_revision + 1 then raise exception 'Revision changed. Reload before saving.'; end if;
  if octet_length(new.payload::text) > 524288 then raise exception 'Anthropometry record too large'; end if;
  if coalesce(new.payload->>'note','') <> '' and coalesce((new.payload->>'noteReviewed')::boolean,false) = false then
    raise exception 'Review the note before saving';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_anthropometry_revision() from public, anon;
grant execute on function private.validate_anthropometry_revision() to authenticated;
create trigger anthropometry_revision_guard before insert on public.consultation_anthropometry
  for each row execute function private.validate_anthropometry_revision();
