begin;
set local lock_timeout='5s';

alter table public.consultation_snapshots
 add column answers_version bigint not null default 0,
 add column answer_save_receipt jsonb;

-- Old tabs have no expected version. Once this revision adopts the new
-- protocol, direct legacy writes must reload instead of overwriting it.
-- Clinical server RPCs run under their checked private definer and remain valid.
create function private.require_versioned_answer_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a public.consultation_answers;
begin
 if current_user='authenticated' then
  if TG_OP='DELETE' then a:=old;else a:=new;end if;
  if exists(select 1 from public.consultation_snapshots snapshot where snapshot.consultation_id=a.consultation_id and snapshot.professional_id=a.professional_id and snapshot.revision=a.revision and snapshot.answer_save_receipt is not null) then
   raise exception 'Reload the consultation to use the current save workflow.' using errcode='40001';
  end if;
 end if;
 if TG_OP='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function private.require_versioned_answer_write() from public,anon,authenticated,service_role;
create trigger require_versioned_answer_write before insert or update or delete on public.consultation_answers
 for each row execute function private.require_versioned_answer_write();

-- Track all writers, including the existing PES/SMART RPCs and older tabs.
create function private.bump_consultation_answers_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.consultation_answers;
begin
 if TG_OP='UPDATE' and row(new.value,new.section_key,new.response_area) is not distinct from row(old.value,old.section_key,old.response_area) then return new; end if;
 if TG_OP='DELETE' then a:=old; else a:=new; end if;
 update public.consultation_snapshots set answers_version=answers_version+1
 where consultation_id=a.consultation_id and professional_id=a.professional_id and revision=a.revision;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.bump_consultation_answers_version() from public,anon,authenticated,service_role;
create trigger bump_consultation_answers_version after insert or update or delete on public.consultation_answers
 for each row execute function private.bump_consultation_answers_version();

-- Preserve the established RPC for clinical integrations and old clients,
-- while eliminating writes (and row triggers) for identical answers.
create or replace function public.save_consultation_responses(target_consultation uuid,expected_revision integer,responses jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.consultations; snap public.consultation_snapshots;
begin
 select * into c from public.consultations where id=target_consultation and professional_id=(select auth.uid()) for update;
 if not found or c.status<>'draft' then raise insufficient_privilege using message='Only an owned draft can be saved'; end if;
 select * into snap from public.consultation_snapshots where consultation_id=c.id order by revision desc limit 1;
 if snap.id is null or snap.revision<>expected_revision then raise exception 'The questionnaire changed. Reload before saving.'; end if;
 if jsonb_typeof(responses)<>'object' then raise exception 'Responses must be an object'; end if;
 insert into public.consultation_answers as existing(professional_id,consultation_id,patient_id,revision,question_key,section_key,response_area,value)
 select (select auth.uid()),c.id,c.patient_id,snap.revision,q->>'question_key',s->>'section_key',q->>'response_area',responses->(q->>'question_key')
 from jsonb_array_elements(snap.structure->'sections') s cross join lateral jsonb_array_elements(s->'questions') q
 where responses ? (q->>'question_key')
 on conflict(professional_id,consultation_id,revision,question_key) do update
 set value=excluded.value,section_key=excluded.section_key,response_area=excluded.response_area
 where row(existing.value,existing.section_key,existing.response_area) is distinct from row(excluded.value,excluded.section_key,excluded.response_area);
end $$;

-- A private definer is needed to update server-owned snapshot metadata.
-- The public wrapper remains invoker; ownership, plan and patient write access
-- are checked explicitly before every mutation, including an empty fence.
create function private.sync_consultation_answers(p_consultation uuid,p_revision integer,p_version bigint default null,p_changes jsonb default null,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); c public.consultations; s public.consultation_snapshots; answers jsonb; payload_hash text; conflict boolean:=false;
begin
 if owner is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if not private.can_read_feature(owner,'consultations') then raise exception 'entitlement_required' using errcode='42501'; end if;
 if p_changes is null then
  -- One statement gives the version and answers from the same MVCC snapshot.
  select jsonb_build_object('version',snapshot.answers_version,'answers',coalesce(registered.values,'{}'::jsonb)) into answers
  from public.consultations visit join lateral(select * from public.consultation_snapshots candidate where candidate.consultation_id=visit.id and candidate.professional_id=owner order by revision desc limit 1)snapshot on snapshot.revision=p_revision
  left join lateral(select jsonb_object_agg(question_key,value) as values from public.consultation_answers a where a.consultation_id=visit.id and a.professional_id=owner and a.revision=snapshot.revision)registered on true
  where visit.id=p_consultation and visit.professional_id=owner and visit.deleted_at is null;
  if answers is null then raise exception 'consultation_revision_changed'; end if;
  return answers;
 end if;
 perform private.require_my_entitlement('consultations');
 select * into c from public.consultations where id=p_consultation and professional_id=owner and deleted_at is null for update;
 if not found or c.status<>'draft' then raise exception 'consultation_not_editable' using errcode='42501'; end if;
 perform private.require_retention_patient(owner,c.patient_id);
 select * into s from public.consultation_snapshots where consultation_id=c.id and professional_id=owner order by revision desc limit 1 for update;
 if s.id is null or s.revision<>p_revision then raise exception 'consultation_revision_changed'; end if;
 if p_version is null or p_version<0 or p_request is null or jsonb_typeof(p_changes) is distinct from 'object' or octet_length(p_changes::text)>1000000 then raise exception 'invalid_request'; end if;
 if exists(select 1 from jsonb_object_keys(p_changes) k where not exists(select 1 from jsonb_array_elements(s.structure->'sections') section cross join lateral jsonb_array_elements(section->'questions') q where q->>'question_key'=k)) then raise exception 'invalid_question'; end if;
 payload_hash:=md5(p_version::text||':'||p_changes::text);
 if s.answer_save_receipt->>'id'=p_request::text then
  if s.answer_save_receipt->>'hash'<>payload_hash then raise exception 'save_request_reused'; end if;
  conflict:=(s.answer_save_receipt->>'version')::bigint<>s.answers_version;
 elsif p_version<>s.answers_version then conflict:=true;
 else
  perform public.save_consultation_responses(c.id,p_revision,p_changes);
  -- Even an empty recovery write fences a delayed request with an old version.
  update public.consultation_snapshots set answers_version=answers_version+1,
   answer_save_receipt=jsonb_build_object('id',p_request,'hash',payload_hash,'version',answers_version+1)
  where id=s.id returning * into s;
 end if;
 select coalesce(jsonb_object_agg(question_key,value),'{}') into answers from public.consultation_answers where consultation_id=c.id and professional_id=owner and revision=s.revision;
 return jsonb_build_object('version',s.answers_version,'answers',answers,'conflict',conflict);
end $$;
revoke all on function private.sync_consultation_answers(uuid,integer,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function private.sync_consultation_answers(uuid,integer,bigint,jsonb,uuid) to authenticated;
create function public.sync_consultation_answers(p_consultation uuid,p_revision integer,p_version bigint default null,p_changes jsonb default null,p_request uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.sync_consultation_answers(p_consultation,p_revision,p_version,p_changes,p_request)$$;
revoke all on function public.sync_consultation_answers(uuid,integer,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.sync_consultation_answers(uuid,integer,bigint,jsonb,uuid) to authenticated;

commit;
