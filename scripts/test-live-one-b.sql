-- Disposable local fixtures only. No real approval, message, clinical record or provider call.
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.reject(query text,code text) returns void language plpgsql as $$begin begin execute query;exception when others then if position(code in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected rejection: %',code;end$$;
insert into auth.users(id,email,email_confirmed_at) values ('ab000000-0000-4000-8000-000000000001','admin@example.test',now()),('ab000000-0000-4000-8000-000000000002','professional@example.test',now());
insert into private.platform_admins(user_id) values('ab000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',false);
select pg_temp.assert((select count(*)=3 from private.legal_documents where version=1 and review_status='pending_review' and effective_at is null and approved_by is null and length(body)>500),'Three existing v1 drafts, no approval/date');
select pg_temp.assert((select count(*)=0 from public.legal_documents_public),'No draft exposed');
select pg_temp.assert(public.legal_document('terms') is null,'Public RPC hides drafts');
select pg_temp.assert(not private.billing_legal_ready() and not private.transactional_email_ready(),'Both readiness gates pending');
select pg_temp.assert(not has_table_privilege('authenticated','private.transactional_email_outbox','SELECT'),'Professional cannot read another outbox');
select pg_temp.assert(not has_table_privilege('anon','private.legal_document_versions','SELECT'),'Private drafts denied');
select pg_temp.assert(not has_function_privilege('authenticated','public.transactional_email_server(text,jsonb)','EXECUTE'),'Server RPC service only');
select pg_temp.reject($q$select public.operations_admin_api('legal_status','{}')$q$,'use_legal_approval_flow');
select pg_temp.reject($q$update private.legal_documents set review_status='approved' where key='terms'$q$,'legal_approval_required');
select public.email_admin_api('contacts','{"support_email":"support@example.org","privacy_email":"privacy@example.org","confirmation":"CONFIRMAR CONTACTOS REALES"}');
select pg_temp.assert((select support_email='support@example.org' from public.operational_contact_public),'Central verified contact public');
select pg_temp.assert(public.legal_admin_api('get','{"key":"terms"}')->>'preview_body' like '%support@example.org%','Preview resolves verified contacts');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',false);
select pg_temp.reject($q$select public.legal_admin_api('approve','{"key":"terms"}')$q$,'admin_required');
select pg_temp.reject($q$select public.email_admin_api('overview')$q$,'admin_required');
select pg_temp.reject($q$select public.record_legal_acceptance('terms',1,'settings')$q$,'legal_not_published');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',false);
-- Isolate external infrastructure for readiness aggregation in this disposable DB.
create or replace function private.billing_provider_credentials() returns jsonb language sql security definer set search_path='' as $$select '{"mode":"test","secret_key":"sk_test_LOCALFIXTURE","account_id":"acct_LOCALFIXTURE","webhook_secret":"whsec_LOCALFIXTURE"}'::jsonb$$;
create or replace function private.operations_jobs() returns jsonb language sql security definer set search_path='' as $$select '[{"jobname":"nuthrick-billing-monthly-and-grace","active":true,"last_status":"succeeded"},{"jobname":"nuthrick-transactional-email-outbox","active":true,"last_status":"succeeded"}]'::jsonb$$;
insert into private.access_codes(code_hash,name,plan_id,duration_days,max_redemptions,starts_at,expires_at)
select 'LOCAL_ONLY_HASH','Local Beta fixture',id,90,1,now(),now()+interval '90 days' from private.plans where code='beta';
update private.ai_feature_config set enabled=false; -- previous credit tests enabled their mock configuration only
select pg_temp.assert(private.pre_live_readiness()->'summary'='{"ready":13,"pending":2,"blocked":0}'::jsonb,'Actual readiness aggregates to 13/2 with legal+email pending');
-- All approvals below are synthetic fixtures in the disposable local clone.
create function pg_temp.approve(k text,when_at timestamptz) returns void language plpgsql as $$declare d jsonb;begin
 d:=public.legal_admin_api('get',jsonb_build_object('key',k));
 perform public.legal_admin_api('approve',jsonb_build_object('key',k,'version',d->'version','revision',d->'revision','preview_hash',d->'preview_hash','confirmation','Confirmo que este documento fue revisado y aprobado.','effective_at',when_at));
end$$;
select pg_temp.reject($q$select pg_temp.approve('terms',now())$q$,'legal_decisions_required');
do $$declare k text;d jsonb;begin
 foreach k in array array['terms','privacy','refunds'] loop
  d:=public.legal_admin_api('get',jsonb_build_object('key',k));
  d:=public.legal_admin_api('save',d||jsonb_build_object('key',k,'body',repeat('Texto ficticio para pruebas locales. ',10),'status','draft'));
  perform pg_temp.assert(d->>'review_status'='draft','Draft saved');
  perform pg_temp.reject(format('select pg_temp.approve(%L,now())',k),'legal_review_required');
  d:=public.legal_admin_api('save',d||jsonb_build_object('key',k,'status','pending_review'));
  perform pg_temp.reject(format('select public.legal_admin_api(''approve'',%L::jsonb)',(d||jsonb_build_object('key',k,'confirmation','no'))::text),'confirmation_required');
  perform pg_temp.approve(k,case when k='refunds' then now()+interval '1 day' else now()-interval '1 minute' end);
 end loop;
end$$;
select pg_temp.assert(not private.billing_legal_ready(),'Future effective date cannot pass readiness');
set role anon;
select pg_temp.assert((select count(*)=2 from public.legal_documents_public),'RLS hides future version even on direct SELECT');
reset role;
select public.record_legal_acceptance('terms',1,'settings');
select public.record_legal_acceptance('terms',1,'settings');
select pg_temp.assert((select count(*)=1 from private.legal_acceptances),'Duplicate acceptance is idempotent');
select pg_temp.reject($q$update private.legal_documents set body='mutated' where key='terms'$q$,'legal_version_immutable');
do $$declare k text;d jsonb;begin
 foreach k in array array['terms','refunds'] loop
  d:=public.legal_admin_api('get',jsonb_build_object('key',k));
  d:=public.legal_admin_api('new_version',d||jsonb_build_object('key',k));
  perform pg_temp.assert(d->>'version'='2' and d->>'approved_at' is null,'New draft without approval inheritance');
  if k='terms' then perform pg_temp.assert(public.legal_document(k)->>'version'='1','v1 stays public while v2 draft');end if;
  d:=public.legal_admin_api('save',d||jsonb_build_object('key',k,'status','pending_review','requires_acceptance',true));
  perform pg_temp.approve(k,now()-interval '1 second');
 end loop;
end$$;
select pg_temp.assert(private.billing_legal_ready(),'All three approved and effective');
select pg_temp.assert((select count(*)=1 from private.legal_acceptances where document_version=1),'Old acceptance unchanged');
select pg_temp.assert(jsonb_array_length(public.my_legal_acceptances()->'required')=2,'Future reacceptance prepared');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000002',false);
select pg_temp.assert(public.my_legal_acceptances()->'accepted'='[]','Acceptances isolated by owner');
select set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000001',false);
-- Real email readiness is exercised using synthetic receipt IDs, never HTTP.
select public.email_admin_api('configure','{"domain_name":"example.org","domain_id":"00000000-0000-4000-8000-000000000001","from_email":"notifications@example.org","confirmation":"SOLO CORREOS DE PRUEBA CONTROLADOS"}');
select public.email_admin_api('authorize_recipient','{"email":"controlled@example.org","confirmation":"CONTROLO ESTA BANDEJA Y AUTORIZO LAS PRUEBAS"}');
select pg_temp.reject($q$select public.email_admin_api('authorize_recipient','{"email":"invalid","confirmation":"CONTROLO ESTA BANDEJA Y AUTORIZO LAS PRUEBAS"}')$q$,'invalid_email');
select pg_temp.reject($q$select public.email_admin_api('queue_tests','{"email":"controlled@example.org","operation_key":"00000000-0000-4000-8000-000000000001"}')$q$,'email_configuration_required');
select private.transactional_email_server('verified',(select to_jsonb(s)||'{"evidence":{"spf":true,"dkim":true,"dmarc":true},"runtime_ready":true}' from private.transactional_email_settings s));
select public.email_admin_api('queue_tests','{"email":"controlled@example.org","operation_key":"00000000-0000-4000-8000-000000000001"}');
select public.email_admin_api('queue_tests','{"email":"controlled@example.org","operation_key":"00000000-0000-4000-8000-000000000001"}');
select pg_temp.assert((select count(*)=5 from private.transactional_email_outbox where is_test_delivery),'Duplicate queue keeps 5');
select pg_temp.assert(not private.transactional_email_ready(),'Provider/DNS without inbox proof not ready');
do $$declare e jsonb;lease uuid;pid text;stored jsonb;begin
 for i in 1..5 loop
  lease:=gen_random_uuid();e:=private.transactional_email_server('claim',jsonb_build_object('lease_key',lease));
  perform pg_temp.assert(e is not null,'Claim returns queued item');
  stored:=private.transactional_email_server('prepare',jsonb_build_object('id',e->'id','lease_key',lease,'message',jsonb_build_object('subject','original')));
  perform pg_temp.assert(private.transactional_email_server('prepare',jsonb_build_object('id',e->'id','lease_key',lease,'message',jsonb_build_object('subject','mutated')))=stored,'Retry freezes final envelope');
  pid:='provider_fixture_'||i;
  perform private.transactional_email_server('delivery_event',jsonb_build_object('event_id','receipt_fixture_'||i,'provider_message_id',pid,'type','email.delivered','occurred_at',now()));
  perform private.transactional_email_server('complete',jsonb_build_object('id',e->'id','lease_key',lease,'provider_message_id',pid));
  perform pg_temp.assert((select delivery_status='delivered' from private.transactional_email_outbox where id=(e->>'id')::uuid),'Receipt before provider response reconciles');
  perform public.email_admin_api('observed',jsonb_build_object('id',e->'id','note','Fixture local: received with safe links.','confirmation','Confirmo que recibí y revisé este correo.'));
 end loop;
end$$;
select private.transactional_email_server('worker_done','{"accepted":5,"failed":0}');
select pg_temp.assert(private.transactional_email_ready(),'Five observed tests plus DNS and signed receipt evidence pass');
select pg_temp.assert(private.pre_live_readiness()->'summary'='{"ready":15,"pending":0,"blocked":0}'::jsonb,'Legal approval plus actual email proof yields 15/0 from evidence');
select pg_temp.assert((select x->>'status'='ready' from jsonb_array_elements(private.pre_live_readiness()->'checks')x where x->>'key'='legal'),'General legal ready');
select pg_temp.assert((select x->>'status'='ready' from jsonb_array_elements(private.pre_live_readiness()->'checks')x where x->>'key'='transactional_email'),'General email ready');
select private.transactional_email_server('delivery_event',jsonb_build_object('event_id','bounce_fixture_1','provider_message_id','provider_fixture_1','type','email.bounced','occurred_at',now()));
select private.transactional_email_server('delivery_event',jsonb_build_object('event_id','receipt_duplicate_later','provider_message_id','provider_fixture_1','type','email.delivered','occurred_at',now()));
select pg_temp.assert(not private.transactional_email_ready(),'Bounce revokes readiness');
select pg_temp.assert((select delivery_status='bounced' from private.transactional_email_outbox where provider_message_id='provider_fixture_1'),'Late delivered cannot undo bounce');
select pg_temp.reject($q$select public.email_admin_api('retry',jsonb_build_object('id',(select id from private.transactional_email_outbox where provider_message_id='provider_fixture_1')))$q$,'email_not_retryable');
-- A new config cannot reuse observations from the previous sender/configuration.
select public.email_admin_api('contacts','{"support_email":"support2@example.org","privacy_email":"privacy@example.org","confirmation":"CONFIRMAR CONTACTOS REALES"}');
select private.transactional_email_server('verified',(select to_jsonb(s)||'{"evidence":{"spf":true,"dkim":true,"dmarc":true},"runtime_ready":true}' from private.transactional_email_settings s));
select pg_temp.assert(not private.transactional_email_ready(),'Changed configuration requires fresh observations');
select public.email_admin_api('queue_tests','{"email":"controlled@example.org","operation_key":"00000000-0000-4000-8000-000000000002"}');
do $$declare e jsonb;lease uuid:=gen_random_uuid();other jsonb;begin
 e:=private.transactional_email_server('claim',jsonb_build_object('lease_key',lease));
 other:=private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid()));
 perform pg_temp.assert(e->>'id'<>other->>'id','Two workers never share leased item');
 perform private.transactional_email_server('complete',jsonb_build_object('id',e->'id','lease_key',lease,'code','email_provider_rejected','retryable',false));
 perform pg_temp.assert((select status='failed' and attempts=5 from private.transactional_email_outbox where id=(e->>'id')::uuid),'Permanent failure dead letter');
 perform public.email_admin_api('retry',jsonb_build_object('id',e->'id'));
 perform pg_temp.assert((select status='pending' and attempts=0 from private.transactional_email_outbox where id=(e->>'id')::uuid),'Manual retry audited and bounded');
 update private.transactional_email_outbox set status='failed',first_attempt_at=now()-interval '25 hours' where id=(e->>'id')::uuid;
 perform pg_temp.reject(format('select public.email_admin_api(''retry'',%L::jsonb)',jsonb_build_object('id',e->'id')::text),'email_delivery_requires_reconciliation');
end$$;
select pg_temp.assert((select count(*)>0 from private.admin_audit where action='email_retry'),'Manual retry audited');
-- Retryable provider failure: backoff, five attempts, then manual reconciliation.
do $$declare e jsonb;lease uuid;target uuid;begin
 select id into target from private.transactional_email_outbox where is_test_delivery and configuration_revision=(select configuration_revision from private.transactional_email_settings) and attempts=0 limit 1;
 update private.transactional_email_outbox set next_attempt_at=now()+interval '1 day' where id<>target;
 for i in 1..5 loop
  update private.transactional_email_outbox set next_attempt_at=now()-interval '1 second' where id=target;
  lease:=gen_random_uuid();e:=private.transactional_email_server('claim',jsonb_build_object('lease_key',lease));
  perform pg_temp.assert(e->>'id'=target::text,'Retry claims same message');
  perform private.transactional_email_server('complete',jsonb_build_object('id',target,'lease_key',lease,'code','email_delivery_unknown','retryable',true));
  perform pg_temp.assert((select attempts=i and next_attempt_at>now() from private.transactional_email_outbox where id=target),'Retry increments with future backoff');
 end loop;
 perform pg_temp.assert((select status='failed' and attempts=5 from private.transactional_email_outbox where id=target),'Five failures dead letter');
 update private.transactional_email_outbox set next_attempt_at=now()-interval '1 second' where id=target;
 perform pg_temp.assert(private.transactional_email_server('claim',jsonb_build_object('lease_key',gen_random_uuid())) is null,'Sixth automatic attempt denied');
end$$;
select pg_temp.assert(private.transactional_email_server('authorize_admin','{"actor":"ab000000-0000-4000-8000-000000000001"}')->>'authorized'='true','Admin JWT actor validated server-side');
select pg_temp.reject($q$select private.transactional_email_server('authorize_admin','{"actor":"ab000000-0000-4000-8000-000000000002"}')$q$,'admin_required');
