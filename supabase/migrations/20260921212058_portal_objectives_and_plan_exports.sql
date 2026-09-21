begin;
-- The clinical objective remains in consultation_answers; only its approved
-- patient-facing snapshot/reference uses the existing portal shared JSON.
grant select on public.consultation_answers,public.consultation_snapshots,public.professional_businesses,public.professional_contacts,public.professional_locations to service_role;
create or replace function private.portal_goals(pid uuid,owner_id uuid)
returns table("consultationId" uuid,date timestamptz,revision integer,"questionKey" text,content text)
language sql stable security invoker set search_path='' as $goal$
  select c.id,c.consultation_date::timestamptz,s.revision,a.question_key,rendered.content
  from public.consultations c
  join public.consultation_snapshots s on s.consultation_id=c.id and s.patient_id=c.patient_id and s.professional_id=c.professional_id
  join public.consultation_answers a on a.consultation_id=c.id and a.patient_id=c.patient_id and a.professional_id=c.professional_id and a.revision=s.revision
  cross join lateral (
    select case when jsonb_typeof(a.value)='string' then btrim(a.value#>>'{}')
      when jsonb_typeof(a.value)='array' then (select string_agg(btrim(e->>'objetivo'),E'\n' order by ord) from jsonb_array_elements(a.value) with ordinality t(e,ord) where jsonb_typeof(e->'objetivo')='string' and btrim(e->>'objetivo')<>'')
      else null end as content
  ) rendered
  where c.patient_id=pid and c.professional_id=owner_id and c.deleted_at is null and c.status='completed'
    and s.revision=(select max(revision) from public.consultation_snapshots where consultation_id=c.id)
    and a.question_key in ('objectives','next_objectives')
    and a.response_area='professional_assessment' and length(rendered.content) between 1 and 12000
    and exists(select 1 from jsonb_array_elements(s.structure->'sections') section, jsonb_array_elements(section->'questions') question where question->>'question_key'=a.question_key and question->>'response_area'='professional_assessment');
$goal$;
revoke all on function private.portal_goals(uuid,uuid) from public,anon,authenticated;
grant execute on function private.portal_goals(uuid,uuid) to service_role;
create or replace function public.patient_portal(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  pid uuid; p public.patients; space private.patient_portals;
  challenge private.portal_challenges; sess private.portal_sessions;
  actor text; item jsonb; point jsonb; stamp timestamptz;
  rows jsonb; next_cursor jsonb; mid uuid; old_body text; count_notes integer;
begin
  if octet_length(p_data::text)>120000 then raise exception 'invalid_input'; end if;
  if p_action='inbox' and p_data->>'owner' is not null then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (
      select client.id,client.full_name,
        (select count(*) from private.portal_messages m where m.patient_id=client.id and m.sender='patient' and m.created_at>coalesce(s.professional_read_at,'-infinity'::timestamptz)) unread,
        (select max(created_at) from private.portal_messages m where m.patient_id=client.id) last_message_at
      from private.patient_portals s join public.patients client on client.id=s.patient_id
      where client.professional_id=(p_data->>'owner')::uuid and client.deleted_at is null and client.status<>'archived'
        and (p_data->>'search' is null or position(lower(p_data->>'search') in lower(client.full_name))>0)
      order by unread desc,last_message_at desc nulls last,client.id
      limit 50 offset least(greatest(coalesce((p_data->>'offset')::integer,0),0),10000)
    ) t;
    return jsonb_build_object('patients',rows);
  end if;
  if p_data->>'owner' is not null then
    pid:=(p_data->>'patientId')::uuid;
    actor:='professional';
  elsif p_action='challenge' then
    select patient_id into pid from private.patient_portals where link_hash=p_data->>'linkHash';
    actor:='challenge';
  elsif p_action='verify_professional' then
    select patient_id into pid from private.patient_portals where link_hash=p_data->>'linkHash';
    actor:='verify';
  elsif p_action='verify' then
    select * into challenge from private.portal_challenges where id=(p_data->>'id')::uuid;
    pid:=challenge.patient_id; actor:='verify';
  else
    select * into sess from private.portal_sessions where token_hash=p_data->>'sessionHash' and expires_at>now();
    pid:=sess.patient_id; actor:='patient';
  end if;
  -- Consistent patient -> space locking serializes publication, revocation and
  -- use of codes, including simultaneous correct-code requests.
  select * into p from public.patients where id=pid for update;
  if not found or p.deleted_at is not null or p.status='archived' then return '{"error":"portal_unavailable"}'; end if;
  if actor='professional' and p.professional_id<>(p_data->>'owner')::uuid then return '{"error":"portal_unavailable"}'; end if;
  if actor='professional' then
    insert into private.patient_portals(patient_id) values(pid) on conflict do nothing;
  end if;
  select * into space from private.patient_portals where patient_id=pid for update;
  if actor<>'professional' then
    if not p.portal_access_enabled or space.link_hash is null or space.link_expires_at<=now()
      or nullif(lower(btrim(p.email)),'') is distinct from space.recipient_email then return '{"error":"portal_unavailable"}'; end if;
    if actor='patient' and (sess.link_hash is distinct from space.link_hash or sess.email is distinct from space.recipient_email) then return '{"error":"portal_unavailable"}'; end if;
  end if;

  if p_action='goal_candidates' and actor='professional' then
    select coalesce(jsonb_agg(to_jsonb(g)),'[]') into rows from (select * from private.portal_goals(pid,p.professional_id) order by date desc, "consultationId" desc limit 50) g;
    return jsonb_build_object('goals',rows);
  elsif p_action in ('plan_history','plan_version','export_plan') then
    if actor<>'professional' and p_action<>'export_plan' then return '{"error":"invalid_action"}'; end if;
    if actor<>'professional' and (p_data->>'format' is distinct from 'pdf' or p_data ? 'versionId' or p_data ? 'planId') then return '{"error":"invalid_action"}'; end if;
    if p_action='plan_history' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (
        select v.id, v.snapshot->'plan'->>'title' title,v.version_number,v.published_at
        from public.nutrition_plan_versions v join public.nutrition_plans np on np.id=v.plan_id
        where v.patient_id=pid and np.patient_id=pid and v.professional_id=p.professional_id and np.professional_id=p.professional_id
        order by v.published_at desc,v.id desc limit 50 offset least(greatest(coalesce((p_data->>'offset')::integer,0),0),10000)
      ) t;
      return jsonb_build_object('versions',rows);
    end if;
    select jsonb_build_object('snapshot',v.snapshot,'versionNumber',v.version_number,'publishedAt',v.published_at) into item
    from public.nutrition_plan_versions v join public.nutrition_plans np on np.id=v.plan_id
    where v.patient_id=pid and np.patient_id=pid and v.professional_id=p.professional_id and np.professional_id=p.professional_id
      and case when actor='professional' then v.id=(p_data->>'versionId')::uuid
        else np.id=space.shared_plan_id and np.status<>'archived' and v.id=np.current_version_id end;
    if item is null then return '{"error":"invalid_plan"}'; end if;
    if p_action='plan_version' then return jsonb_build_object('plan',item); end if;
    select jsonb_build_object('fullName',pr.full_name,'professionalTitle',pr.professional_title,'licenseNumber',pr.license_number,
      'businessName',b.establishment_name,'businessAddress',coalesce(b.address,(select address from public.professional_locations where professional_id=p.professional_id and is_active order by display_order,id limit 1)),
      'contactLines',coalesce((select jsonb_agg(concat_ws(' ',nullif(label,'')||':',country_code,contact_value) order by display_order,id) from public.professional_contacts where professional_id=p.professional_id),'[]'::jsonb),
      'logoPath',case when b.logo_path like pr.storage_key::text||'/logo/%' then b.logo_path end)
      into rows from public.professional_profiles pr left join public.professional_businesses b on b.professional_id=pr.id where pr.id=p.professional_id;
    return jsonb_build_object('plan',item,'professional',rows);
  elsif p_action in ('plan','plan_options','plan_preview','share_plan') then
    if p_action<>'plan' and actor<>'professional' then return '{"error":"invalid_action"}'; end if;
    if p_action='plan_options' then
      select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows from (
        select np.id,v.snapshot->'plan'->>'title' title,v.version_number,v.published_at
        from public.nutrition_plans np join public.nutrition_plan_versions v on v.id=np.current_version_id and v.plan_id=np.id
        where np.patient_id=pid and np.professional_id=p.professional_id and np.status<>'archived'
          and v.patient_id=pid and v.professional_id=p.professional_id
        order by v.published_at desc,np.id
      ) t;
      return jsonb_build_object('plans',rows,'selectedPlanId',space.shared_plan_id);
    end if;
    if p_action='share_plan' and p_data->>'planId' is null then
      update private.patient_portals set shared_plan_id=null where patient_id=pid;
      return '{"ok":true}';
    end if;
    select jsonb_build_object('snapshot',v.snapshot,'versionNumber',v.version_number,'publishedAt',v.published_at) into item
    from public.nutrition_plans np join public.nutrition_plan_versions v on v.id=np.current_version_id and v.plan_id=np.id
    where np.id=case when p_action='plan' then space.shared_plan_id else (p_data->>'planId')::uuid end
      and np.patient_id=pid and np.professional_id=p.professional_id and np.status<>'archived'
      and v.patient_id=pid and v.professional_id=p.professional_id;
    if item is null then
      if p_action='plan' then return '{"plan":null}'; end if;
      return '{"error":"invalid_plan"}';
    end if;
    if p_action='share_plan' then
      update private.patient_portals set shared_plan_id=(p_data->>'planId')::uuid where patient_id=pid;
      return '{"ok":true}';
    end if;
    return jsonb_build_object('plan',item);
  elsif p_action='issue_code' and actor='professional' then
    if not p.portal_access_enabled or space.link_hash is null or space.link_expires_at<=now()
      or nullif(lower(btrim(p.email)),'') is distinct from space.recipient_email
      or p_data->>'linkHash' is distinct from space.link_hash then return '{"error":"portal_unavailable"}'; end if;
    if p_data->>'identityConfirmed' is distinct from 'true' then return '{"error":"identity_confirmation_required"}'; end if;
    update private.portal_challenges set used=true where patient_id=pid and channel='professional';
    insert into private.portal_challenges(id,patient_id,link_hash,email,code_hash,channel)
    values((p_data->>'id')::uuid,pid,space.link_hash,space.recipient_email,p_data->>'codeHash','professional');
    return jsonb_build_object('expiresAt',now()+interval '10 minutes');
  elsif p_action='challenge' and actor='challenge' then
    if space.recipient_email is null or space.link_hash is distinct from p_data->>'linkHash' or space.recipient_email is distinct from p_data->>'email' then return '{"error":"portal_unavailable"}'; end if;
    delete from private.portal_challenges where patient_id=pid and (expires_at<now() or used);
    -- Sending a new code invalidates previous codes for this patient.
    update private.portal_challenges set used=true where patient_id=pid and channel='email';
    insert into private.portal_challenges(id,patient_id,link_hash,email,code_hash)
    values((p_data->>'id')::uuid,pid,space.link_hash,space.recipient_email,p_data->>'codeHash');
    return jsonb_build_object('email',space.recipient_email);
  elsif p_action in ('verify','verify_professional') and actor='verify' then
    if p_action='verify_professional' then
      select * into challenge from private.portal_challenges where patient_id=pid and channel='professional' and not used for update;
    else
      select * into challenge from private.portal_challenges where id=(p_data->>'id')::uuid and channel='email' for update;
    end if;
    if not found then return '{"error":"invalid_code"}'; end if;
    if challenge.used or challenge.expires_at<=now() or challenge.attempts>=5 or challenge.link_hash is distinct from space.link_hash
      or challenge.link_hash is distinct from p_data->>'linkHash' or challenge.email is distinct from space.recipient_email then return '{"error":"invalid_code"}'; end if;
    update private.portal_challenges set attempts=attempts+1 where id=challenge.id;
    if challenge.code_hash is distinct from p_data->>'codeHash' then return '{"error":"invalid_code"}'; end if;
    update private.portal_challenges set used=true where id=challenge.id;
    delete from private.portal_sessions where patient_id=pid and expires_at<now();
    insert into private.portal_sessions(token_hash,patient_id,link_hash,email)
    values(p_data->>'newSessionHash',pid,space.link_hash,space.recipient_email);
    return '{"verified":true}';
  elsif p_action='link' and actor='professional' then
    update public.patients set portal_access_enabled=true where id=pid;
    update private.patient_portals set link_hash=p_data->>'linkHash',encrypted_link=p_data->>'encryptedLink',
      recipient_email=nullif(lower(btrim(p.email)),''),link_expires_at=now()+interval '90 days' where patient_id=pid;
    delete from private.portal_sessions where patient_id=pid;
    update private.portal_challenges set used=true where patient_id=pid;
    return '{"ok":true}';
  elsif p_action='revoke' and actor='professional' then
    update public.patients set portal_access_enabled=false where id=pid;
    update private.patient_portals set link_hash=null,encrypted_link=null,link_expires_at=null where patient_id=pid;
    delete from private.portal_sessions where patient_id=pid;
    update private.portal_challenges set used=true where patient_id=pid;
    return '{"ok":true}';
  elsif p_action='publish' and actor='professional' then
    if (p_data->>'revision')::integer is distinct from space.revision then return '{"error":"stale_revision"}'; end if;
    if jsonb_typeof(p_data->'shared')<>'object' or jsonb_typeof(p_data->'shared'->'results')<>'array'
      or jsonb_typeof(p_data->'shared'->'consultations')<>'array' then raise exception 'invalid_input'; end if;
    -- Only completed, non-deleted consultations of this patient can be shared.
    for item in select value from jsonb_array_elements(p_data->'shared'->'consultations') loop
      if not exists(select 1 from public.consultations c where c.id=(item->>'id')::uuid and c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null) then raise exception 'invalid_consultation'; end if;
    end loop;
    for item in select value from jsonb_array_elements(p_data->'shared'->'results') loop
      for point in select value from jsonb_array_elements(item->'points') loop
        if not exists(select 1 from public.consultations c where c.id=(point->>'consultationId')::uuid and c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null) then raise exception 'invalid_consultation'; end if;
      end loop;
    end loop;
    if p_data->'shared'->'goalSource' is not null and p_data->'shared'->'goalSource'<>'null'::jsonb then
      if not exists(select 1 from private.portal_goals(pid,p.professional_id) g where g."consultationId"=(p_data#>>'{shared,goalSource,consultationId}')::uuid and g.revision=(p_data#>>'{shared,goalSource,revision}')::integer and g."questionKey"=p_data#>>'{shared,goalSource,questionKey}' and g.content=p_data#>>'{shared,goal}') then return '{"error":"invalid_goal"}'; end if;
    end if;
    update private.patient_portals set shared=p_data->'shared',revision=revision+1,published_at=now() where patient_id=pid;
    return jsonb_build_object('revision',space.revision+1);
  elsif p_action='logout' and actor='patient' then
    delete from private.portal_sessions where token_hash=p_data->>'sessionHash'; return '{"ok":true}';
  elsif p_action='message' and actor in ('patient','professional') then
    if not p.portal_access_enabled or space.link_hash is null or space.link_expires_at<=now() or nullif(lower(btrim(p.email)),'') is distinct from space.recipient_email then return '{"error":"portal_unavailable"}'; end if;
    if length(btrim(p_data->>'body')) not between 1 and 4000 then raise exception 'invalid_input'; end if;
    select id,body into mid,old_body from private.portal_messages where patient_id=pid and sender=actor and client_id=(p_data->>'clientId')::uuid;
    if mid is not null then
      if old_body is distinct from btrim(p_data->>'body') then return '{"error":"idempotency_mismatch"}'; end if;
      return jsonb_build_object('id',mid);
    end if;
    insert into private.portal_messages(patient_id,sender,client_id,body) values(pid,actor,(p_data->>'clientId')::uuid,btrim(p_data->>'body')) returning id into mid;
    return jsonb_build_object('id',mid);
  elsif p_action='messages' and actor in ('patient','professional') then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') into rows from (
      select id,sender,body,created_at from private.portal_messages m where patient_id=pid
      and (p_data->>'before' is null or (m.created_at,m.id)<((p_data->'before'->>'at')::timestamptz,(p_data->'before'->>'id')::uuid))
      and (p_data->>'after' is null or (m.created_at,m.id)>((p_data->'after'->>'at')::timestamptz,(p_data->'after'->>'id')::uuid))
      order by case when p_data->>'after' is not null then m.created_at end asc,
        case when p_data->>'after' is not null then m.id end asc,
        m.created_at desc,m.id desc limit 50
    ) m;
    if jsonb_array_length(rows)=50 then next_cursor:=jsonb_build_object('at',rows->0->>'created_at','id',rows->0->>'id'); end if;
    return jsonb_build_object('messages',rows,'before',next_cursor);
  elsif p_action='read' and actor in ('patient','professional') then
    select created_at into stamp from private.portal_messages where patient_id=pid and id=(p_data->>'id')::uuid;
    if stamp is not null then
      if actor='patient' then update private.patient_portals set patient_read_at=greatest(patient_read_at,stamp) where patient_id=pid;
      else update private.patient_portals set professional_read_at=greatest(professional_read_at,stamp) where patient_id=pid; end if;
    end if;
    return '{"ok":true}';
  elsif p_action='note' and actor='patient' then
    select count(*) into count_notes from private.portal_notes where patient_id=pid;
    if count_notes>=100 and not exists(select 1 from private.portal_notes where patient_id=pid and id=(p_data->>'id')::uuid) then return '{"error":"note_limit"}'; end if;
    if exists(select 1 from private.portal_notes where id=(p_data->>'id')::uuid and patient_id<>pid) then return '{"error":"portal_unavailable"}'; end if;
    insert into private.portal_notes(id,patient_id,body,done) values((p_data->>'id')::uuid,pid,btrim(p_data->>'body'),coalesce((p_data->>'done')::boolean,false))
    on conflict(id) do update set body=excluded.body,done=excluded.done,updated_at=now() where private.portal_notes.patient_id=pid;
    return '{"ok":true}';
  elsif p_action='delete_note' and actor='patient' then
    delete from private.portal_notes where id=(p_data->>'id')::uuid and patient_id=pid; return '{"ok":true}';
  elsif p_action='notes' and actor='patient' then
    select coalesce(jsonb_agg(to_jsonb(n) order by n.done,n.updated_at desc),'[]') into rows from
      (select id,body,done,updated_at from private.portal_notes where patient_id=pid) n;
    return jsonb_build_object('notes',rows);
  elsif p_action='view' and actor in ('patient','professional') then
    if actor='patient' then
      if space.shared->'goalSource' is not null and space.shared->'goalSource'<>'null'::jsonb and not exists(
        select 1 from public.consultations c join public.consultation_snapshots s on s.consultation_id=c.id and s.professional_id=p.professional_id and s.patient_id=pid
        where c.id=(space.shared#>>'{goalSource,consultationId}')::uuid and c.patient_id=pid and c.professional_id=p.professional_id and c.status='completed' and c.deleted_at is null
          and s.revision=(space.shared#>>'{goalSource,revision}')::integer
          and s.revision=(select max(revision) from public.consultation_snapshots where consultation_id=c.id)
      ) then space.shared:=jsonb_set(space.shared,'{goal}','""'); end if;
      space.shared:=space.shared-'goalSource';
      -- Retraction follows deletion/cancellation immediately, even if a
      -- previously published snapshot remains available to its owner.
      select coalesce(jsonb_agg(value),'[]') into rows from jsonb_array_elements(space.shared->'consultations')
      where exists(select 1 from public.consultations c where c.id=(value->>'id')::uuid and c.patient_id=pid and c.status='completed' and c.deleted_at is null);
      space.shared:=jsonb_set(space.shared,'{consultations}',rows);
      rows:='[]';
      for item in select value from jsonb_array_elements(space.shared->'results') loop
        select coalesce(jsonb_agg(value),'[]') into point from jsonb_array_elements(item->'points')
        where exists(select 1 from public.consultations c where c.id=(value->>'consultationId')::uuid and c.patient_id=pid and c.status='completed' and c.deleted_at is null);
        if jsonb_array_length(point)>0 then rows:=rows||jsonb_build_array(jsonb_set(item,'{points}',point)); end if;
      end loop;
      space.shared:=jsonb_set(space.shared,'{results}',rows);
    end if;
    -- Whitelisted profile fields only; no birth date, identifiers or contacts.
    select jsonb_build_object('name',full_name,'title',professional_title) into item from public.professional_profiles where id=p.professional_id;
    rows:=jsonb_build_object('patientName',p.full_name,'professional',item,'shared',space.shared,'revision',space.revision,'publishedAt',space.published_at,
      'unread',(select count(*) from private.portal_messages where patient_id=pid and sender<>actor and created_at>coalesce(case when actor='patient' then space.patient_read_at else space.professional_read_at end,'-infinity'::timestamptz)));
    if actor='professional' then rows:=rows||jsonb_build_object('encryptedLink',space.encrypted_link,'expiresAt',space.link_expires_at,
      'enabled',p.portal_access_enabled and space.link_hash is not null and space.link_expires_at>now() and nullif(lower(btrim(p.email)),'') is not distinct from space.recipient_email); end if;
    return rows;
  end if;
  return '{"error":"invalid_action"}';
end $$;
revoke all on function public.patient_portal(text,jsonb) from public,anon,authenticated;
grant execute on function public.patient_portal(text,jsonb) to service_role;
commit;
