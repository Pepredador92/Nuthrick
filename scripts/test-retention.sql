create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.reject(p_sql text,p_error text) returns void language plpgsql as $$begin
 begin execute p_sql;exception when others then if position(p_error in sqlerrm)>0 then return;end if;raise;end;
 raise exception 'Expected error %',p_error;end$$;
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.plan_catalog()) p where p->>'name'='Respaldo'),'Respaldo excluded from public catalog');
select pg_temp.assert_true(not has_function_privilege('anon','public.my_retention_offer()','EXECUTE'),'anonymous offer denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.billing_retention','SELECT'),'retention private');
select pg_temp.reject($q$select private.billing_price((select id from private.plans where code='respaldo'),'monthly')$q$,'plan_unavailable');
select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000007',false);
select pg_temp.assert_true(public.my_retention_offer()->>'eligible'='true','paid standard account eligible');
do $$declare owner uuid:='ba000000-0000-4000-8000-000000000007'; lk uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); ctx jsonb; ids uuid[]; req jsonb; price_id uuid;begin
 select array_agg(id) into ids from (select id from public.patients where professional_id=owner order by id limit 5) x;
 perform private.billing_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 req:=jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',op,'action','retention','request',jsonb_build_object('patient_ids',ids));
 begin
  perform private.billing_server('prepare_operation',req||jsonb_build_object('actor','ba000000-0000-4000-8000-000000000002'));
  raise exception 'forged actor was accepted';
 exception when others then if sqlerrm<>'unauthorized' then raise;end if;end;
 begin
  perform private.billing_server('prepare_operation',jsonb_set(req,'{request,patient_ids}',to_jsonb(ids||ids[1])));
  raise exception 'six patients were accepted';
 exception when others then if sqlerrm<>'retention_patient_selection_required' then raise;end if;end;
 ctx:=private.billing_server('prepare_operation',req);
 perform pg_temp.assert_true(ctx->'target_price'->>'retention_days'='90' and ctx->'target_price'->>'amount'='14900','server price and duration');
 price_id:=(ctx->'target_price'->>'id')::uuid;
 perform pg_temp.assert_true(private.resolve_effective_entitlements(owner)->>'plan_name'='Esencial','request does not activate unpaid Respaldo');
 perform private.billing_server('operation_saved',jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',op,'result',jsonb_build_object('requested',true,'schedule_id','sched_retention','retention_starts_at',now()+interval '30 days','retention_ends_at',now()+interval '120 days')));
 ctx:=private.billing_server('prepare_operation',req);
 perform pg_temp.assert_true(ctx->>'replay'='true','retention operation replay');
 perform private.billing_server('unlock',jsonb_build_object('owner',owner,'lock_key',lk));
 perform pg_temp.assert_true(public.my_retention_offer()->>'eligible'='false','offer is single-use');
 -- Model a paid transition after provider verification, without a real provider call.
 perform set_config('nuthrick.billing_apply','true',true);
 update private.billing_subscriptions set price_mapping_id=price_id,pending_plan_id=null,cancel_at_period_end=true where professional_id=owner and mode='test';
 update private.professional_access set plan_id=(select id from private.plans where code='respaldo'),status='active' where professional_id=owner;
 update private.billing_retention set starts_at=now()-interval '1 day',ends_at=now()+interval '89 days' where professional_id=owner;
end$$;
set role authenticated;
select pg_temp.assert_true((select count(*)=60 from public.patients),'all historical patients remain readable');
update public.patients set full_name='SELECTED AND EDITABLE' where id=(select (public.my_retention_offer()->'patient_ids'->>0)::uuid);
select pg_temp.reject($q$update public.patients set full_name='FORBIDDEN' where id=(select id from public.patients where id not in(select value::uuid from jsonb_array_elements_text(public.my_retention_offer()->'patient_ids')) limit 1)$q$,'retention_patient_read_only');
select pg_temp.reject($q$insert into public.consultations(patient_id) select id from public.patients where id not in(select value::uuid from jsonb_array_elements_text(public.my_retention_offer()->'patient_ids')) limit 1$q$,'retention_patient_read_only');
reset role;
-- A free slot may be occupied by a new patient; a sixth slot is rejected.
update private.billing_retention set patient_ids=patient_ids[1:4] where professional_id='ba000000-0000-4000-8000-000000000007';
set role authenticated;
insert into public.patients(full_name) values('FIFTH RETENTION SLOT');
select pg_temp.reject($q$insert into public.patients(full_name) values('SIXTH RETENTION SLOT')$q$,'retention_patient_limit');
reset role;
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000007')->'values'->>'ai.monthly_credits'='0','zero included credits');
select pg_temp.assert_true(not private.can_use_feature('ba000000-0000-4000-8000-000000000007','ai.pes'),'AI unavailable during Respaldo');
do $$declare owner uuid:='ba000000-0000-4000-8000-000000000007';lk uuid:=gen_random_uuid();ctx jsonb;begin
 perform private.billing_server('lock',jsonb_build_object('owner',owner,'lock_key',lk));
 ctx:=private.billing_server('prepare_operation',jsonb_build_object('owner',owner,'actor',owner,'lock_key',lk,'operation_key',gen_random_uuid(),'action','change','request',jsonb_build_object('plan_id',(select id from private.plans where code='esencial'),'interval','monthly')));
 perform pg_temp.assert_true(ctx->'target_price'->>'plan_name'='Esencial','upgrade allowed despite automatic retention end');
 perform private.billing_server('unlock',jsonb_build_object('owner',owner,'lock_key',lk));
end$$;
update private.billing_retention set starts_at=now()-interval '91 days',ends_at=now()-interval '1 day';
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000007')->>'read_only'='true','expiry enforced before webhook');
select pg_temp.assert_true(private.resolve_effective_entitlements('ba000000-0000-4000-8000-000000000007')->>'allowed'='true','expired account may read');
select private.require_entitlement('ba000000-0000-4000-8000-000000000007','exports');
select pg_temp.reject($q$select private.require_entitlement('ba000000-0000-4000-8000-000000000007','consultations')$q$,'account_read_only');
