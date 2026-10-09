-- Integration checks roll back every fixture, setting and notification.
begin;
do $$
declare actor uuid; owner uuid; mapping private.ai_credit_price_mappings; purchase uuid:=gen_random_uuid(); alert uuid; result jsonb; before_count bigint;
begin
 select user_id into actor from private.platform_admins where enabled limit 1;
 if actor is null then raise exception 'Admin fixture required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.admin_ai_operations();
 if jsonb_array_length(result->'daily')<>30 then raise exception 'Daily series incomplete'; end if;
 if result->'settings' is null then raise exception 'Settings missing'; end if;
 perform public.admin_ai_operations('save_settings','{"balance_usd":100,"coverage_days":21,"buffer_percent":30,"extra_credits":50}');
 result:=public.admin_ai_operations();
 if (result->'settings'->>'balance_usd')::numeric<>100 or (result->'settings'->>'coverage_days')::integer<>21 then raise exception 'Settings not saved'; end if;
 begin
  perform public.admin_ai_operations('save_settings','{"balance_usd":-1}');
  raise exception 'Invalid balance accepted';
 exception when others then if sqlerrm='Invalid balance accepted' then raise; end if; end;
 begin
  perform public.admin_ai_operations('save_settings','{"coverage_days":0}');
  raise exception 'Invalid coverage accepted';
 exception when check_violation then null; end;
 select * into mapping from private.ai_credit_price_mappings where mode='live' limit 1;
 select id into owner from public.professional_profiles limit 1;
 insert into private.ai_credit_purchases(id,professional_id,package_id,price_mapping_id,package_snapshot,credits_purchased,bonus_credits,amount,expected_amount,currency,mode,expires_at,closed_at)
 values(purchase,owner,mapping.package_id,mapping.id,'{}',100,0,10000,10000,'MXN','live',now()+interval '1 day',now());
 update private.ai_credit_purchases set status='paid',paid_at=now(),amount_paid=10000 where id=purchase;
 result:=public.admin_ai_operations();
 if (result->>'assignment_issues')::integer<1 then raise exception 'Missing assignment warning'; end if;
 update private.ai_credit_purchases set credited_at=now() where id=purchase;
 select count(*) into before_count from private.ai_admin_alerts where purchase_id=purchase;
 if before_count<>2 then raise exception 'Payment and assignment transitions missing'; end if;
 update private.ai_credit_purchases set status='paid',credited_at=credited_at,refunded_amount=0 where id=purchase;
 if (select count(*) from private.ai_admin_alerts where purchase_id=purchase)<>before_count then raise exception 'Duplicate alert'; end if;
 select id into alert from private.ai_admin_alerts where purchase_id=purchase order by created_at desc limit 1;
 perform public.admin_ai_operations('mark_read',jsonb_build_object('ids',jsonb_build_array(alert)));
 perform public.admin_ai_operations('mark_read',jsonb_build_object('ids',jsonb_build_array(alert)));
 if (select count(*) from private.ai_admin_alert_reads where alert_id=alert and admin_id=actor)<>1 then raise exception 'Read acknowledgement not idempotent'; end if;
 update private.ai_credit_purchases set mode='test',price_mapping_id=(select id from private.ai_credit_price_mappings where mode='test' limit 1),status='failed' where id=purchase;
 if (select count(*) from private.ai_admin_alerts where purchase_id=purchase)<>before_count then raise exception 'Test payment generated alert'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.admin_ai_operations();
  raise exception 'Non-admin allowed';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.admin_ai_operations(text,jsonb)','EXECUTE') then raise exception 'Anonymous RPC exposed'; end if;
 if has_table_privilege('authenticated','private.ai_admin_alerts','SELECT') then raise exception 'Alert table exposed'; end if;
end $$;
select 'PASS: overview, validation, assignment warnings, idempotent live alerts, test exclusion and admin-only access' as result;
rollback;
