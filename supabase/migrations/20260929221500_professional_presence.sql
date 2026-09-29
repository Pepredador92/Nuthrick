begin;

-- Presence is a Realtime concern, but the patient must receive a topic that
-- is bound to their own professional. The topic itself contains no patient
-- data and is only returned after the existing owner/session checks.
create or replace function public.portal_presence_topic(
  p_owner uuid default null,
  p_patient_id uuid default null,
  p_session_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare professional uuid;
begin
  if p_owner is not null then
    select p.professional_id into professional
      from public.patients p
     where p.id = p_patient_id
       and p.professional_id = p_owner
       and p.deleted_at is null
       and p.status <> 'archived';
  elsif p_session_hash is not null then
    select p.professional_id into professional
      from private.portal_sessions s
      join public.patients p on p.id = s.patient_id
     where s.token_hash = p_session_hash
       and s.expires_at > now()
       and p.deleted_at is null
       and p.status <> 'archived'
       and p.portal_access_enabled;
  end if;

  if professional is null then
    return jsonb_build_object('error', 'portal_unavailable');
  end if;
  return jsonb_build_object('topic', 'professional-presence:' || professional::text);
end;
$$;

revoke all on function public.portal_presence_topic(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.portal_presence_topic(uuid,uuid,text) to service_role;

commit;
