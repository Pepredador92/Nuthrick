begin;
create function pg_temp.ensure(ok boolean) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'assertion_failed';end if;end$$;
create function pg_temp.reject(q text,want text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm=want then return;end if;raise;end;raise exception 'expected %',want;end$$;
-- Rolled back synthetic owner; no production user touched.
insert into auth.users(id) values('44444444-4444-4444-8444-444444444444');
insert into professional_profiles(id,full_name) values('44444444-4444-4444-8444-444444444444','LOCAL CALIBRATION GUARD') on conflict(id) do nothing;
insert into patients(id,professional_id,full_name) values('44444444-4444-4444-8444-444444444445','44444444-4444-4444-8444-444444444444','LOCAL FICTICIA');
insert into private.ai_accounts(professional_id,purchased_credits) values('44444444-4444-4444-8444-444444444444',1000);
insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations,max_daily_credits,calibration_started_at,calibration_patient_id,calibration_request_limit,calibration_usd_limit,calibration_model_limits)
values('44444444-4444-4444-8444-444444444444',true,100,20,1000,now()-interval '1 second','44444444-4444-4444-8444-444444444445',9,1,'{"diet_draft:mock":9}');
update private.ai_feature_config set enabled=true,execution_mode='real',max_provider_attempts=1,model='mock',pricing_version='test',max_input_tokens=10000,max_output_tokens=1024,input_usd_per_million=60,cached_usd_per_million=0,output_usd_per_million=0 where feature='diet_draft';
insert into private.ai_feature_access(feature,professional_id,enabled) values('diet_draft','44444444-4444-4444-8444-444444444444',true);
create function pg_temp.reserve(k uuid default gen_random_uuid(),p uuid default '44444444-4444-4444-8444-444444444445') returns jsonb language sql as $$select public.ai_server('reserve','44444444-4444-4444-8444-444444444444',jsonb_build_object('feature','diet_draft','idempotency_key',k,'request_hash',repeat('a',64),'patient_id',p,'config',public.ai_server('config','44444444-4444-4444-8444-444444444444','{"feature":"diet_draft"}')))$$;
select pg_temp.reject('select pg_temp.reserve(gen_random_uuid(),null)','calibration_scope');
select pg_temp.reserve('44444444-4444-4444-8444-444444444446');
select pg_temp.ensure((pg_temp.reserve('44444444-4444-4444-8444-444444444446')->>'created')::boolean=false);
select pg_temp.reject('select pg_temp.reserve()','calibration_budget');
update private.ai_pilot_limits set calibration_request_limit=1 where professional_id='44444444-4444-4444-8444-444444444444';
select pg_temp.reject('select pg_temp.reserve()','calibration_request_limit');
update private.ai_pilot_limits set calibration_request_limit=9,calibration_model_limits='{"diet_draft:mock":1}' where professional_id='44444444-4444-4444-8444-444444444444';
select pg_temp.reject('select pg_temp.reserve()','calibration_model_limit');
update private.ai_feature_config set max_provider_attempts=2 where feature='diet_draft';
select pg_temp.reject('select pg_temp.reserve()','calibration_scope');
select pg_temp.ensure(not has_function_privilege('authenticated','public.ai_provider_metadata(uuid,uuid,text,text,integer)','execute'));
select pg_temp.ensure(not has_function_privilege('anon','public.ai_provider_metadata(uuid,uuid,text,text,integer)','execute'));
rollback;
select 'PASS 8 calibration guard assertions; no provider calls';
