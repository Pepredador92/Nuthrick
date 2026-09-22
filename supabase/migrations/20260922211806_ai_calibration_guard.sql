-- Optional campaign limits, checked under the existing account lock.
-- Kept on the SAME pilot/account/generation infrastructure, not a new ledger.
alter table private.ai_feature_config add column max_provider_attempts integer not null default 1 check(max_provider_attempts between 1 and 2);
alter table private.ai_pilot_limits add column calibration_started_at timestamptz,
 add column calibration_patient_id uuid,
 add column calibration_request_limit integer check(calibration_request_limit between 1 and 9),
 add column calibration_usd_limit numeric check(calibration_usd_limit>0 and calibration_usd_limit<=1),
 add column calibration_model_limits jsonb;
alter table private.ai_pilot_limits add constraint complete_calibration_guard check (
 (calibration_started_at is null and calibration_patient_id is null and calibration_request_limit is null and calibration_usd_limit is null and calibration_model_limits is null)
 or (calibration_started_at is not null and calibration_patient_id is not null and calibration_request_limit is not null and calibration_usd_limit is not null and calibration_model_limits is not null and jsonb_typeof(calibration_model_limits)='object'));

do $$
declare original text; amended text; marker text:='   spent := private.ai_daily_committed(p_owner,reservation_time);';
begin
 original:=pg_get_functiondef('public.ai_server(text,uuid,jsonb)'::regprocedure);
 amended:=replace(original,marker,$guard$
   if l.calibration_started_at is not null then
     if c.execution_mode<>'real' or c.max_provider_attempts<>1 or (p_data->>'patient_id')::uuid is distinct from l.calibration_patient_id then raise exception 'calibration_scope'; end if;
     if (select count(*) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at)>=l.calibration_request_limit then raise exception 'calibration_request_limit'; end if;
     if (select count(*) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at and feature=c.feature and model=c.model)>=least(9,greatest(0,coalesce((l.calibration_model_limits->>(c.feature||':'||c.model))::integer,0))) then raise exception 'calibration_model_limit'; end if;
     if cost + (select coalesce(sum(case when status in ('reserved','running','uncertain') then estimated_cost else coalesce(actual_cost,0) end),0) from private.ai_generations where professional_id=p_owner and started_at>=l.calibration_started_at)>l.calibration_usd_limit then raise exception 'calibration_budget'; end if;
   end if;
$guard$||marker);
 if original=amended then raise exception 'unexpected_ai_server_definition'; end if;
 execute amended;
end $$;

alter table private.ai_generations add column provider_request_id text,
 add column response_model text, add column provider_latency_ms integer check(provider_latency_ms>=0);
create function public.ai_provider_metadata(p_owner uuid,p_generation uuid,p_request_id text,p_model text,p_latency integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if (p_request_id is not null and p_request_id !~ '^[a-zA-Z0-9_-]{1,200}$') or (p_model is not null and p_model !~ '^[a-zA-Z0-9_.:-]{1,200}$') or p_latency<0 then raise exception 'invalid_metadata'; end if;
 update private.ai_generations set provider_request_id=p_request_id,response_model=p_model,provider_latency_ms=p_latency
 where id=p_generation and professional_id=p_owner and status='running';
 if not found then raise exception 'generation_unavailable'; end if;
end $$;
revoke all on function public.ai_provider_metadata(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.ai_provider_metadata(uuid,uuid,text,text,integer) to service_role;
