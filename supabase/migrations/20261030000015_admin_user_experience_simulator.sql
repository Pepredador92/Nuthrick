-- Isolated professional tenants for administrator-led product walkthroughs.
-- The permanent Auth app_metadata marker is set ONLY by the service role.
create table private.user_simulations (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references auth.users(id),
 professional_id uuid not null unique references public.professional_profiles(id),
 plan_id uuid not null references private.plans(id),
 scenario text not null check(scenario in ('empty','examples')),
 state text not null default 'active' check(state in ('active','ended')),
 purchased boolean not null default false,
 billing_interval text not null default 'monthly' check(billing_interval in ('monthly','annual')),
 subscription_state text not null default 'active' check(subscription_state in ('active','cancelled')),
 seeded boolean not null default false,
 credit_purchases jsonb not null default '[]',
 calendar_connected boolean not null default false,
 included_credits numeric not null default 0,
 additional_credits numeric not null default 0,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 ended_at timestamptz
);
create index user_simulations_admin on private.user_simulations(admin_id,created_at desc);
create index user_simulations_plan on private.user_simulations(plan_id);
alter table private.user_simulations enable row level security;
revoke all on private.user_simulations from public,anon,authenticated,service_role;
create policy rpc_only on private.user_simulations to authenticated using(false);

create function private.is_simulation(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_owner and raw_app_meta_data->>'nuthrick_simulation'='true')
$$;
revoke all on function private.is_simulation(uuid) from public,anon,authenticated,service_role;

-- Public profile previews remain visible to the simulation owner; demo pages
-- are not discoverable by anonymous visitors or ordinary professionals.
create function private.simulation_page_visible(p_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select not private.is_simulation(id) or id=auth.uid() from public.professional_profiles where storage_key=p_key),true)
$$;
revoke all on function private.simulation_page_visible(uuid) from public,anon,authenticated,service_role;
grant execute on function private.simulation_page_visible(uuid) to anon,authenticated;
create policy simulation_page_visibility on public.public_professional_pages as restrictive
 for select to anon,authenticated using(private.simulation_page_visible(profile_key));

create function public.simulation_delivery_check(p_challenge uuid default null,p_owner uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_simulation(coalesce(p_owner,(select p.professional_id from private.portal_challenges c join public.patients p on p.id=c.patient_id where c.id=p_challenge)))
$$;
revoke all on function public.simulation_delivery_check(uuid,uuid) from public,anon,authenticated;
grant execute on function public.simulation_delivery_check(uuid,uuid) to service_role;

-- Suppression is permanent, including after exit/expiration and if a tab loses
-- its UI marker. Workers never dispatch demo email or Calendar jobs.
create function private.suppress_simulation_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.is_simulation(new.professional_id) then return null; end if;
 return new;
end $$;
revoke all on function private.suppress_simulation_delivery() from public,anon,authenticated,service_role;
create trigger suppress_simulation_delivery before insert on private.agenda_outbox
 for each row execute function private.suppress_simulation_delivery();
create trigger suppress_simulation_delivery before insert on private.transactional_email_outbox
 for each row execute function private.suppress_simulation_delivery();

create function private.seed_user_simulation(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r private.user_simulations; access jsonb; pid uuid; c public.consultations;
 previous_sub text:=current_setting('request.jwt.claim.sub',true); answer record;
begin
 select * into r from private.user_simulations where professional_id=p_owner for update;
 if r.id is null or r.seeded or r.scenario<>'examples' or not r.purchased then return;end if;
 access:=private.resolve_effective_entitlements(p_owner);
 perform set_config('request.jwt.claim.sub',p_owner::text,true);
 if coalesce((access->'values'->>'patients')::boolean,false) then
  insert into public.patients(professional_id,full_name,email,birth_date,weight_kg,height_cm)
  values(p_owner,'Ana Ejemplo · paciente ficticia','ana.'||r.id::text||'@example.invalid','1990-05-12',70,165) returning id into pid;
  if coalesce((access->'values'->>'consultations')::boolean,false) then
   c:=public.start_consultation_draft(pid,'initial');
   update public.consultation_snapshots set working_drafts=working_drafts||jsonb_build_object('pes-clinical-context',
    'CASO FICTICIO PARA SIMULACIÓN. Refiere omitir el desayuno por iniciar temprano el trabajo, comer rápido y llegar con mucha hambre a la comida. Tiene alimentos disponibles y desea organizar una opción sencilla la noche anterior. Desea registrar sus horarios de comida. Estos datos sirven únicamente para explorar el recorrido de la plataforma.')
    where consultation_id=c.id and revision=1;
   -- Seed only real text questions present in the selected immutable snapshot.
   for answer in select q.question_key,s.section_key,q.response_area
     from public.consultation_snapshots snapshot
     join public.consultation_template_sections s on s.template_id=snapshot.template_id
     join public.consultation_template_questions q on q.section_id=s.id
     where snapshot.consultation_id=c.id and snapshot.revision=1 and q.is_active
       and q.question_type in ('short_text','long_text','text','textarea')
       and q.question_key in ('main_reason','professional_notes') loop
    insert into public.consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,section_key,response_area,value)
    values(p_owner,c.id,pid,1,answer.question_key,answer.section_key,answer.response_area,to_jsonb(
      case when answer.question_key='main_reason' then 'Ejemplo ficticio: quiero organizar mejor mis comidas.'
      else 'CASO FICTICIO PARA SIMULACIÓN. Refiere omitir el desayuno por iniciar temprano su trabajo, comer rápido y llegar con mucha hambre a la comida. Tiene alimentos disponibles y desea planear una opción sencilla la noche anterior. No se ha acordado ninguna indicación clínica real.' end));
   end loop;
   insert into public.patient_notes(professional_id,patient_id,consultation_id,content)
    values(p_owner,pid,c.id,'Nota de ejemplo. Todos los datos de este expediente son ficticios.');
  end if;
  if coalesce((access->'values'->>'agenda')::boolean,false) then
   insert into public.agenda_entries(professional_id,patient_id,kind,status,starts_at,ends_at,timezone,modality,contact_name,contact_email,source,notification_status)
   values(p_owner,pid,'appointment','confirmed',date_trunc('day',now())+interval '2 days 16 hours',date_trunc('day',now())+interval '2 days 17 hours','America/Mexico_City','online','Ana Ejemplo · paciente ficticia','ana.'||r.id::text||'@example.invalid','professional','pending');
  end if;
  if coalesce((access->'values'->>'diet_workshop')::boolean,false) then
   insert into public.nutrition_plans(professional_id,patient_id,title,status,target_calories)
    values(p_owner,pid,'Plan de ejemplo · borrador ficticio','draft',2000);
  end if;
 end if;
 update private.user_simulations set seeded=true where id=r.id;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $$;
revoke all on function private.seed_user_simulation(uuid) from public,anon,authenticated,service_role;

-- Service-only command boundary. Neither actor nor professional IDs are trusted
-- from browser input; the Edge function supplies the validated Auth user ID.
create function public.simulator_server(p_action text,p_actor uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.user_simulations; plan private.plans; owner uuid; credits numeric; package private.ai_credit_packages; purchase jsonb;
begin
 if p_actor is null then raise exception 'unauthorized' using errcode='42501';end if;
 if p_action in ('authorize','create','list','end_admin') then
  if not exists(select 1 from private.platform_admins where user_id=p_actor and enabled) then raise exception 'admin_required' using errcode='42501';end if;
  if p_action='authorize' then return jsonb_build_object('authorized',true);end if;
  if p_action='list' then
   return coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('plan_name',p.name) order by s.created_at desc)
    from (select * from private.user_simulations where admin_id=p_actor order by created_at desc limit 20)s join private.plans p on p.id=s.plan_id),'[]');
  end if;
  if p_action='end_admin' then
   select * into r from private.user_simulations where id=(p_data->>'id')::uuid and admin_id=p_actor for update;
   if not found then raise exception 'simulation_unavailable';end if;
  else
   owner:=(p_data->>'professional_id')::uuid;
   if not private.is_simulation(owner) or exists(select 1 from private.platform_admins where user_id=owner) then raise exception 'simulation_unavailable';end if;
   select * into plan from private.plans where id=(p_data->>'plan_id')::uuid and active and not internal_only;
   if not found or p_data->>'scenario' not in ('empty','examples') then raise exception 'invalid_request';end if;
   -- One active run per administrator. Restart always receives a fresh tenant.
   update private.professional_access a set status='suspended' from private.user_simulations s where s.professional_id=a.professional_id and s.admin_id=p_actor and s.state='active';
   update private.user_simulations set state='ended',ended_at=now() where admin_id=p_actor and state='active';
   insert into private.user_simulations(admin_id,professional_id,plan_id,scenario) values(p_actor,owner,plan.id,p_data->>'scenario') returning * into r;
   insert into private.professional_access(professional_id,plan_id,status,source,ends_at) values(owner,plan.id,'suspended','manual',r.expires_at)
    on conflict(professional_id) do update set plan_id=excluded.plan_id,status='suspended',source='manual',ends_at=excluded.ends_at;
   insert into private.ai_accounts(professional_id) values(owner) on conflict do nothing;
   return to_jsonb(r)||jsonb_build_object('plan_name',plan.name);
  end if;
 else
  select * into r from private.user_simulations where professional_id=p_actor for update;
  if r.id is null or not private.is_simulation(p_actor) then raise exception 'simulation_required' using errcode='42501';end if;
 end if;
 if p_action in ('end','end_admin') then
  update private.user_simulations set state='ended',ended_at=coalesce(ended_at,now()) where id=r.id;
  update private.professional_access set status='suspended' where professional_id=r.professional_id;
  return jsonb_build_object('ok',true);
 end if;
 if r.state<>'active' or r.expires_at<=now() then raise exception 'simulation_expired' using errcode='42501';end if;
 if p_action in ('credit_preview','credit_checkout','credit_expire') then
  if not r.purchased then raise exception 'entitlement_required';end if;
  if p_action='credit_expire' then return jsonb_build_object('ok',true);end if;
  if coalesce(p_data->>'code','')<>'' then raise exception 'simulation_promotion_unavailable';end if;
  if not exists(select 1 from private.plan_entitlements where plan_id=r.plan_id and entitlement_key like 'ai.%' and value='true'::jsonb) then raise exception 'entitlement_required';end if;
  select * into package from private.ai_credit_packages where id=(p_data->>'package_id')::uuid and active and not internal_only;
  if not found then raise exception 'invalid_request';end if;
  if p_action='credit_checkout' then
   if (p_data->>'operation_key')::uuid is null then raise exception 'invalid_request';end if;
   if not exists(select 1 from jsonb_array_elements(r.credit_purchases) p where p->>'operation_key'=p_data->>'operation_key') then
    purchase:=jsonb_build_object('id',gen_random_uuid(),'package_name',package.name,'credits_purchased',package.credits,'bonus_credits',package.bonus_credits,'amount_paid',0,'expected_amount',package.price_amount*100,'currency',package.currency,'status','paid','created_at',now(),'credited_at',now(),'refunded_amount',0,'reversed_credits',0,'operation_key',p_data->>'operation_key');
    update private.user_simulations set credit_purchases=credit_purchases||jsonb_build_array(purchase),additional_credits=additional_credits+package.credits+package.bonus_credits where id=r.id;
   end if;
  end if;
  return jsonb_build_object('amount',package.price_amount*100,'currency',package.currency,'credits',package.credits,'bonus',package.bonus_credits,'campaign',null,'simulation',true);
 elsif p_action='checkout' then
  select * into plan from private.plans where id=(p_data->>'plan_id')::uuid and active and not internal_only;
  if not found or p_data->>'interval' not in ('monthly','annual') then raise exception 'invalid_request';end if;
  if coalesce(p_data->>'code','')<>'' then raise exception 'simulation_promotion_unavailable';end if;
  update private.user_simulations set purchased=true,plan_id=plan.id,billing_interval=p_data->>'interval',subscription_state='active' where id=r.id returning * into r;
  update private.professional_access set plan_id=plan.id,status='active',starts_at=r.created_at,ends_at=r.expires_at,billing_interval=r.billing_interval,source='manual' where professional_id=r.professional_id;
  credits:=coalesce((select (value#>>'{}')::numeric from private.plan_entitlements where plan_id=plan.id and entitlement_key='ai.monthly_credits' and jsonb_typeof(value)='number'),0);
  update private.user_simulations set included_credits=credits where id=r.id returning * into r;
  perform private.seed_user_simulation(r.professional_id);
 elsif p_action='connect_google' then
  if not r.purchased then raise exception 'entitlement_required';end if;
  update private.user_simulations set calendar_connected=true where id=r.id returning * into r;
 elsif p_action='cancel' then
  update private.user_simulations set subscription_state='cancelled' where id=r.id returning * into r;
 elsif p_action='resume' then
  update private.user_simulations set subscription_state='active' where id=r.id returning * into r;
 elsif p_action not in ('status','billing','preview','expire_checkout','portal') then raise exception 'invalid_action';
 end if;
 select * into plan from private.plans where id=r.plan_id;
 return to_jsonb(r)||jsonb_build_object('plan_name',plan.name,'access',private.resolve_effective_entitlements(r.professional_id));
end $$;
revoke all on function public.simulator_server(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.simulator_server(text,uuid,jsonb) to service_role;

-- The standard billing view remains the same shape, backed by a simulated
-- subscription stored outside all Stripe subscriptions/payments/revenue tables.
alter function private.my_billing() rename to my_billing_before_simulator;
create function private.my_billing() returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.user_simulations; p private.plans;
begin
 if not private.is_simulation(auth.uid()) then return private.my_billing_before_simulator();end if;
 select * into r from private.user_simulations where professional_id=auth.uid();
 if r.id is null or r.state<>'active' or r.expires_at<=now() then raise exception 'simulation_expired';end if;
 select * into p from private.plans where id=r.plan_id;
 return jsonb_build_object('simulation',true,'mode','test','enabled',true,'test_eligible',true,'checkout_eligible',true,
  'welcome_trial',jsonb_build_object('days',30,'eligible',false),'access',private.resolve_effective_entitlements(r.professional_id),
  'credits',jsonb_build_object('included',r.included_credits,'additional',r.additional_credits,'available',r.included_credits+r.additional_credits,'period_end',r.expires_at),'payments','[]'::jsonb,
  'subscription',case when r.purchased then jsonb_build_object('id',r.id,'professional_id',r.professional_id,'plan_name',p.name,'plan_id',p.id,'interval',r.billing_interval,
   'amount',100*case when r.billing_interval='annual' then p.annual_price else p.monthly_price end,'currency',p.currency,'state',r.subscription_state,
   'period_start',r.created_at,'period_end',r.expires_at,'paid_through',r.expires_at,'cancel_at_period_end',r.subscription_state='cancelled','manual_hold',false,
   'pending_plan_id',null,'pending_interval',null,'provider','simulation','campaign_id',null,'campaign_snapshot',null,'provider_subscription_id','simulation-'||r.id::text) else null end);
end $$;
revoke all on function private.my_billing() from public,anon,service_role;
grant execute on function private.my_billing() to authenticated;

alter function private.my_ai_credits() rename to my_ai_credits_before_simulator;
create function private.my_ai_credits() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.user_simulations;eligible boolean;
begin
 if not private.is_simulation(auth.uid()) then return private.my_ai_credits_before_simulator();end if;
 select * into r from private.user_simulations where professional_id=auth.uid();
 if r.id is null or r.state<>'active' or r.expires_at<=now() then raise exception 'simulation_expired';end if;
 eligible:=r.purchased and exists(select 1 from private.plan_entitlements where plan_id=r.plan_id and entitlement_key like 'ai.%' and value='true'::jsonb);
 return jsonb_build_object('mode','test','simulation',true,'enabled',true,'eligible',eligible,'test_eligible',true,
  'balances',jsonb_build_object('included',r.included_credits,'additional',r.additional_credits,'available',r.included_credits+r.additional_credits,'debt',0,'in_review',false,'period_end',r.expires_at),
  'packages',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_order,p.name) from private.ai_credit_packages p where active and not internal_only),'[]'),
  'purchases',r.credit_purchases,'pending',null,'history','[]'::jsonb);
end $$;
revoke all on function private.my_ai_credits() from public,anon,service_role;
grant execute on function private.my_ai_credits() to authenticated;

alter function public.ai_balance() rename to ai_balance_before_simulator;
create function private.simulator_ai_balance() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.user_simulations;
begin
 if not private.is_simulation(auth.uid()) then return public.ai_balance_before_simulator();end if;
 select * into r from private.user_simulations where professional_id=auth.uid() and state='active' and expires_at>now();
 if r.id is null then raise exception 'simulation_expired';end if;
 return jsonb_build_object('available_credits',r.included_credits+r.additional_credits,'reserved_credits',0);
end $$;
revoke all on function private.simulator_ai_balance() from public,anon,service_role;
grant execute on function private.simulator_ai_balance() to authenticated;
create function public.ai_balance() returns jsonb language sql stable security invoker set search_path='' as $$select private.simulator_ai_balance()$$;
revoke all on function public.ai_balance() from public,anon,service_role;
grant execute on function public.ai_balance() to authenticated;

-- An unforgeable server-side check fences every real billing command, even if
-- the simulator tab flag is removed or a request is made outside the UI.
alter function private.billing_server(text,jsonb) rename to billing_server_before_simulator;
create function private.billing_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if private.is_simulation((p_data->>'owner')::uuid) or private.is_simulation((p_data->>'actor')::uuid) then raise exception 'simulation_only' using errcode='42501';end if;
 return private.billing_server_before_simulator(p_action,p_data);
end $$;
revoke all on function private.billing_server(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_server(text,jsonb) to service_role;

-- Zero-cost examples retain the real generation context, idempotency, output
-- validation and clinical approval flow. They never reserve spendable credits.
alter function public.ai_server(text,uuid,jsonb) rename to ai_server_before_simulator;
create function public.ai_server(p_action text,p_owner uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.user_simulations; c private.ai_feature_config; g private.ai_generations; expected jsonb; feature_key text;
begin
 if not private.is_simulation(p_owner) then return public.ai_server_before_simulator(p_action,p_owner,p_data);end if;
 select * into r from private.user_simulations where professional_id=p_owner for share;
 if r.id is null or r.state<>'active' or r.expires_at<=now() or not r.purchased then raise exception 'simulation_expired';end if;
 if p_action in ('config','reserve') then
  feature_key:=case p_data->>'feature' when 'recall_24h' then 'ai.recall_24h' when 'pes_diagnosis' then 'ai.pes' when 'diet_draft' then 'ai.diet_draft' when 'consultation_support' then 'ai.consultation_support' when 'intervention_strategy' then 'ai.consultation_support' when 'patient_instructions' then 'ai.patient_instructions' else 'ai.unsupported' end;
  perform private.require_entitlement(p_owner,feature_key);
  select * into c from private.ai_feature_config where feature=p_data->>'feature';
  if not found then raise exception 'feature_disabled';end if;
  expected:=to_jsonb(c)||jsonb_build_object('execution_mode','simulated','token_policy','fixed','enabled',true,'max_provider_attempts',1);
  if p_action='config' then return expected;end if;
  if p_data->'config' is distinct from expected or nullif(p_data->>'request_hash','') is null or (p_data->>'idempotency_key')::uuid is null then raise exception 'invalid_request';end if;
  perform 1 from private.ai_accounts where professional_id=p_owner for update;
  select * into g from private.ai_generations where professional_id=p_owner and idempotency_key=(p_data->>'idempotency_key')::uuid;
  if found then
   if g.request_hash<>p_data->>'request_hash' then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('generation',to_jsonb(g),'created',false);
  end if;
  if p_data->>'patient_id' is not null and not exists(select 1 from public.patients where id=(p_data->>'patient_id')::uuid and professional_id=p_owner and deleted_at is null) then raise exception 'context_unavailable';end if;
  if p_data->>'consultation_id' is not null and not exists(select 1 from public.consultations where id=(p_data->>'consultation_id')::uuid and professional_id=p_owner and patient_id=(p_data->>'patient_id')::uuid and deleted_at is null) then raise exception 'context_unavailable';end if;
  if (select count(*) from private.ai_generations where professional_id=p_owner and started_at>now()-interval '1 minute')>=20 then raise exception 'rate_limited';end if;
  insert into private.ai_generations(professional_id,idempotency_key,request_hash,patient_id,consultation_id,feature,provider,model,prompt_version,config_snapshot,status,reserved_included,reserved_purchased,estimated_cost)
   values(p_owner,(p_data->>'idempotency_key')::uuid,p_data->>'request_hash',(p_data->>'patient_id')::uuid,(p_data->>'consultation_id')::uuid,c.feature,c.provider,c.model,c.prompt_version,expected||jsonb_build_object('simulation',true),'reserved',0,0,0) returning * into g;
  return jsonb_build_object('generation',to_jsonb(g),'created',true);
 end if;
 if p_action='claim' then
  update private.ai_generations set status='running' where id=(p_data->>'generation_id')::uuid and professional_id=p_owner and status='reserved' and config_snapshot->>'simulation'='true';
  return jsonb_build_object('claimed',found);
 end if;
 if p_action='settle' and (coalesce((p_data->>'input_tokens')::bigint,0)<>0 or coalesce((p_data->>'output_tokens')::bigint,0)<>0 or coalesce((p_data->>'cached_tokens')::bigint,0)<>0) then raise exception 'invalid_usage';end if;
 return public.ai_server_before_simulator(p_action,p_owner,p_data);
end $$;
revoke all on function public.ai_server(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_server(text,uuid,jsonb) to service_role;

-- Exclude demo tenants from the existing administrative professional lists,
-- overview and credit-account selector without copying its command branches.
do $$ declare definition text;original text;begin
 original:=pg_get_functiondef('private.admin_api(text,jsonb)'::regprocedure);
 definition:=replace(original,'from public.professional_profiles) x','from public.professional_profiles where not private.is_simulation(id)) x');
 definition:=replace(definition,'join auth.users u on u.id=p.id','join auth.users u on u.id=p.id and not private.is_simulation(p.id)');
 definition:=replace(definition,'from public.professional_profiles p),','from public.professional_profiles p where not private.is_simulation(p.id)),');
 if definition=original then raise exception 'admin_simulation_filter_missing';end if;
 execute definition;
end $$;
