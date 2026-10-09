begin;
-- Operational settings are a manual provider reconciliation, never a credit ledger.
create table private.ai_operating_reserve (
 singleton boolean primary key default true check(singleton),
 balance_usd numeric(14,4) check(balance_usd>=0), balance_at timestamptz,
 coverage_days integer not null default 30 check(coverage_days between 7 and 90),
 buffer_percent integer not null default 25 check(buffer_percent between 0 and 200),
 extra_credits numeric(18,3) not null default 0 check(extra_credits between 0 and 100000000),
 updated_at timestamptz not null default now(),
 check((balance_usd is null)=(balance_at is null))
);
insert into private.ai_operating_reserve(singleton) values(true);
create table private.ai_admin_alerts (
 id uuid primary key default gen_random_uuid(), purchase_id uuid not null references private.ai_credit_purchases(id),
 status text not null, credited boolean not null, amount bigint not null, credits numeric(18,3) not null,
 created_at timestamptz not null default clock_timestamp()
);
create index ai_admin_alerts_recent on private.ai_admin_alerts(created_at desc);
create index ai_admin_alerts_purchase on private.ai_admin_alerts(purchase_id);
create table private.ai_admin_alert_reads (
 alert_id uuid not null references private.ai_admin_alerts(id) on delete cascade,
 admin_id uuid not null references private.platform_admins(user_id) on delete cascade,
 read_at timestamptz not null default now(), primary key(admin_id,alert_id)
);
create index ai_admin_alert_reads_alert on private.ai_admin_alert_reads(alert_id);
alter table private.ai_operating_reserve enable row level security;
alter table private.ai_admin_alerts enable row level security;
alter table private.ai_admin_alert_reads enable row level security;
revoke all on private.ai_operating_reserve,private.ai_admin_alerts,private.ai_admin_alert_reads from public,anon,authenticated,service_role;

create function private.notify_ai_purchase() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Tests remain in the purchase ledger but never appear as live sales alerts.
 if new.mode<>'live' or new.status not in ('paid','failed','in_review','refunded','partially_refunded') then return new; end if;
 if tg_op='UPDATE' and old.status is not distinct from new.status and (old.credited_at is null)=(new.credited_at is null) and old.refunded_amount=new.refunded_amount then return new; end if;
 insert into private.ai_admin_alerts(purchase_id,status,credited,amount,credits)
 values(new.id,new.status,new.credited_at is not null,new.amount_paid,new.credits_purchased+new.bonus_credits);
 return new;
end $$;
create trigger ai_purchase_admin_notification after insert or update of status,credited_at,refunded_amount on private.ai_credit_purchases
 for each row execute function private.notify_ai_purchase();
revoke all on function private.notify_ai_purchase() from public,anon,authenticated,service_role;

create function private.admin_ai_operations(p_action text default 'overview',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin(); settings private.ai_operating_reserve; result jsonb; counts jsonb; ids uuid[];
begin
 if p_action='save_settings' then
  select * into settings from private.ai_operating_reserve where singleton for update;
  if p_data ? 'balance_usd' then
   if jsonb_typeof(p_data->'balance_usd')<>'number' or (p_data->>'balance_usd')::numeric not between 0 and 100000000 then raise exception 'invalid_balance'; end if;
   settings.balance_usd:=(p_data->>'balance_usd')::numeric; settings.balance_at:=clock_timestamp();
  end if;
  update private.ai_operating_reserve set balance_usd=settings.balance_usd,balance_at=settings.balance_at,
   coverage_days=coalesce((p_data->>'coverage_days')::integer,coverage_days),
   buffer_percent=coalesce((p_data->>'buffer_percent')::integer,buffer_percent),
   extra_credits=coalesce((p_data->>'extra_credits')::numeric,extra_credits),updated_at=now() where singleton;
  insert into private.admin_audit(actor_admin,action,entity,reason,metadata)
   values(actor,'ai_reserve_settings','ai_operating_reserve','Conciliación y parámetros de reserva de IA',p_data);
  return jsonb_build_object('saved',true);
 elsif p_action='mark_read' then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' or jsonb_array_length(p_data->'ids')>50 then raise exception 'invalid_alerts'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  insert into private.ai_admin_alert_reads(admin_id,alert_id) select actor,id from private.ai_admin_alerts where id=any(ids) on conflict do nothing;
  return jsonb_build_object('saved',true);
 elsif p_action not in ('overview','alerts') then raise exception 'unknown_action'; end if;
 select jsonb_build_object('unread',count(*)) into counts from private.ai_admin_alerts a
 where not exists(select 1 from private.ai_admin_alert_reads r where r.admin_id=actor and r.alert_id=a.id);
 if p_action='alerts' then return counts; end if;
 select * into settings from private.ai_operating_reserve where singleton;
 with effective as materialized (
  select id,private.resolve_effective_entitlements(id) e from public.professional_profiles
 ), active as (
  select *,coalesce((e->'values'->>'ai.monthly_credits')::numeric,0) credits from effective
  where e->>'allowed'='true' and e->>'read_only' is distinct from 'true'
 ), groups as (
  select coalesce(e->>'plan_name','Sin plan') name,count(*) users,sum(credits) monthly_credits from active group by 1
 ) select jsonb_build_object('registered',(select count(*) from effective),'active',(select count(*) from active),
   'monthly_credits',coalesce((select sum(credits) from active),0),'plans',coalesce((select jsonb_agg(to_jsonb(g) order by users desc,name) from groups g),'[]')) into result;
 result:=result||jsonb_build_object('settings',to_jsonb(settings)-'singleton','checked_at',now(),
  'included',coalesce((select sum(greatest(0,included_credits)) from private.ai_accounts where billing_period_end>now()),0),
  'purchased',coalesce((select sum(greatest(0,purchased_credits)) from private.ai_accounts),0),
  'reserved',coalesce((select sum(reserved_included+reserved_purchased) from private.ai_accounts),0),
  'usd_per_credit',(select max(1/nullif(credits_per_usd*credit_multiplier,0)) from private.ai_feature_config where enabled and provider='openai'),
  'usage', (select jsonb_build_object('credits',coalesce(sum(charged_credits),0),'cost_usd',coalesce(sum(actual_cost),0),
    'executions',count(*),'unsettled',count(*) filter(where status in ('running','uncertain')),
    'unsettled_usd',coalesce(sum(estimated_cost) filter(where status in ('running','uncertain')),0))
   from private.ai_generations where provider='openai' and started_at>=now()-interval '30 days'),
  'cost_since_balance',coalesce((select sum(actual_cost) from private.ai_generations where provider='openai' and completed_at>settings.balance_at),0),
  'unsettled_total', (select count(*) from private.ai_generations where provider='openai' and status in ('running','uncertain')),
  'unsettled_total_usd',coalesce((select sum(estimated_cost) from private.ai_generations where provider='openai' and status in ('running','uncertain')),0),
  'pending_payments',(select count(*) from private.ai_credit_purchases where mode='live' and status='pending' and expires_at>now()),
  'assignment_issues',(select count(*) from private.ai_credit_purchases where mode='live' and (status='paid' or paid_at is not null) and credited_at is null),
  'webhook_issues',(select count(*) from private.billing_webhook_events where mode='live' and processed_at is null and last_error is not null),
  'sales',(select jsonb_build_object('count',count(*),'credits',coalesce(sum(credits_purchased+bonus_credits-reversed_credits),0),
   'mxn',coalesce(sum(amount_paid-refunded_amount),0)/100.0) from private.ai_credit_purchases where mode='live' and credited_at>=now()-interval '30 days'),
  'daily', (select jsonb_agg(jsonb_build_object('day',d::date,'credits',coalesce(u.credits,0),'cost_usd',coalesce(u.cost,0),'purchases',coalesce(s.credits,0)) order by d)
    from generate_series((now() at time zone 'America/Mexico_City')::date-29,(now() at time zone 'America/Mexico_City')::date,interval '1 day') d
    left join (select (started_at at time zone 'America/Mexico_City')::date as bucket_day,sum(charged_credits) credits,sum(actual_cost) cost from private.ai_generations where provider='openai' and started_at>=now()-interval '31 days' group by 1) u on u.bucket_day=d::date
    left join (select (credited_at at time zone 'America/Mexico_City')::date as bucket_day,sum(credits_purchased+bonus_credits-reversed_credits) credits from private.ai_credit_purchases where mode='live' and credited_at>=now()-interval '31 days' group by 1) s on s.bucket_day=d::date),
  'alerts',counts||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by is_read,created_at desc,id) from (
    select a.id,a.purchase_id,a.status,a.credited,a.amount,a.credits,a.created_at,p.professional_id,pr.full_name professional_name,
     exists(select 1 from private.ai_admin_alert_reads r where r.admin_id=actor and r.alert_id=a.id) is_read
    from private.ai_admin_alerts a join private.ai_credit_purchases p on p.id=a.purchase_id join public.professional_profiles pr on pr.id=p.professional_id
    order by is_read,a.created_at desc,a.id limit 50) x),'[]'))
 );
 return result;
end $$;
create function public.admin_ai_operations(p_action text default 'overview',p_data jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$select private.admin_ai_operations(p_action,p_data)$$;
revoke all on function private.admin_ai_operations(text,jsonb),public.admin_ai_operations(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.admin_ai_operations(text,jsonb),public.admin_ai_operations(text,jsonb) to authenticated;
commit;
