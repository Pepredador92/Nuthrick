begin;
create table private.support_chat_settings (
 singleton boolean primary key default true check(singleton),
 starts_at text not null default '09:00',ends_at text not null default '17:00',
 timezone text not null default 'America/Mexico_City',revision integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into private.support_chat_settings(singleton) values(true);
create table private.support_answers (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('faq','macro')),
 topic text not null check(topic in ('agenda','patients','diet','billing','account','technical','other')),
 title text not null check(length(btrim(title)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 8000),
 active boolean not null default true,position integer not null default 0 check(position between 0 and 999),
 revision integer not null default 1,updated_at timestamptz not null default now()
);
alter table private.support_chat_settings enable row level security;
alter table private.support_answers enable row level security;
create policy support_rpc_only on private.support_chat_settings to authenticated using(false);
create policy support_rpc_only on private.support_answers to authenticated using(false);
revoke all on private.support_chat_settings,private.support_answers from public,anon,authenticated;
insert into private.support_answers(kind,topic,title,body,position) values
 ('faq','agenda','¿Dónde puedo agendar una cita?','En Agenda o en la ficha del paciente, pulsa Agendar cita. Busca al paciente, elige fecha y horario, revisa los datos y guarda la cita.',10),
 ('faq','patients','¿Cómo comparto el Super Link?','Abre la ficha del paciente y entra a Super Link. Desde ahí puedes generar el enlace o mostrar su código QR. El paciente verá únicamente la información que hayas publicado para él.',20),
 ('faq','billing','Tengo una duda sobre mi pago','Revisa el estado de tu suscripción en Mi plan. Si necesitas ayuda con un pago, escríbenos aquí con la fecha y el concepto para que administración lo revise.',30),
 ('faq','technical','¿Qué información ayuda a revisar un error?','Cuéntanos qué intentabas hacer, en qué sección ocurrió y qué mensaje apareció. Así podremos revisar el problema contigo.',40),
 ('macro','other','Primera respuesta','Hola, gracias por escribirnos. Vamos a revisar tu consulta contigo. ¿Puedes contarnos qué intentabas hacer y qué ocurrió?',10),
 ('macro','technical','Pedir detalles del error','Para revisar el error, indícanos la sección donde ocurrió, los pasos que seguiste y el mensaje que apareció.',20),
 ('macro','other','Comprobar solución','Ya realizamos el ajuste. ¿Puedes intentar nuevamente y confirmarnos si ahora funciona como esperabas?',30);
create function private.support_content(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); admin_mode boolean:=coalesce((p_data->>'admin')::boolean,false);
 settings private.support_chat_settings; answer private.support_answers; answer_id uuid:=(p_data->>'id')::uuid;
begin
 if actor is null then raise exception 'unauthorized'; end if;
 if admin_mode then
  if not private.is_platform_admin() then raise exception 'admin_required'; end if;
 elsif not exists(select 1 from public.professional_profiles where id=actor) then raise exception 'professional_required'; end if;
 if octet_length(p_data::text)>40000 then raise exception 'invalid_input'; end if;
 if p_action='get' then
  return jsonb_build_object('settings',(select to_jsonb(s)-'singleton' from private.support_chat_settings s),'answers',(select coalesce(jsonb_agg(a order by position,title,id),'[]') from private.support_answers a where admin_mode or (active and kind='faq')));
 end if;
 if not admin_mode then raise exception 'admin_required'; end if;
 if p_action='save_settings' then
  if coalesce(p_data->>'starts_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_data->>'ends_at','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (p_data->>'starts_at')>=(p_data->>'ends_at') or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then raise exception 'invalid_schedule'; end if;
  select * into settings from private.support_chat_settings for update;
  if settings.revision is distinct from (p_data->>'revision')::integer then raise exception 'stale_content'; end if;
  update private.support_chat_settings set starts_at=p_data->>'starts_at',ends_at=p_data->>'ends_at',timezone=p_data->>'timezone',revision=revision+1,updated_at=now() returning * into settings;
  return to_jsonb(settings);
 elsif p_action='save_answer' then
  if coalesce(p_data->>'kind','') not in ('faq','macro') or coalesce(p_data->>'topic','') not in ('agenda','patients','diet','billing','account','technical','other')
    or length(btrim(coalesce(p_data->>'title',''))) not between 1 and 160 or length(btrim(coalesce(p_data->>'body',''))) not between 1 and 8000
    or coalesce((p_data->>'position')::integer,-1) not between 0 and 999 or p_data->>'active' is null then raise exception 'invalid_answer'; end if;
  if answer_id is null then
   perform pg_advisory_xact_lock(453,1);
   if (select count(*) from private.support_answers)>=100 then raise exception 'answer_limit'; end if;
   insert into private.support_answers(kind,topic,title,body,active,position) values(p_data->>'kind',p_data->>'topic',btrim(p_data->>'title'),btrim(p_data->>'body'),(p_data->>'active')::boolean,(p_data->>'position')::integer) returning * into answer;
  else
   select * into answer from private.support_answers where id=answer_id for update;
   if not found then raise exception 'not_found'; end if;
   if answer.revision is distinct from (p_data->>'revision')::integer then raise exception 'stale_content'; end if;
   update private.support_answers set kind=p_data->>'kind',topic=p_data->>'topic',title=btrim(p_data->>'title'),body=btrim(p_data->>'body'),active=(p_data->>'active')::boolean,position=(p_data->>'position')::integer,revision=revision+1,updated_at=now() where id=answer_id returning * into answer;
  end if;
  return to_jsonb(answer);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function private.support_content(text,jsonb) from public,anon;
grant execute on function private.support_content(text,jsonb) to authenticated;
create function public.support_content(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.support_content(p_action,p_data)$$;
revoke all on function public.support_content(text,jsonb) from public,anon;
grant execute on function public.support_content(text,jsonb) to authenticated;
commit;
