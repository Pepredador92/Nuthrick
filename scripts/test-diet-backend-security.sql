-- Run ONLY against local Supabase. Metadata/security assertions, rolled back.
begin;
do $$ begin
 if has_function_privilege('authenticated','public.ai_diet_source(uuid,uuid,integer)','execute')
  or has_function_privilege('anon','public.ai_diet_source(uuid,uuid,integer)','execute') then raise exception 'source exposed'; end if;
 if has_function_privilege('authenticated','public.ai_diet_draft(uuid,text,jsonb)','execute')
  or has_function_privilege('anon','public.ai_diet_draft(uuid,text,jsonb)','execute') then raise exception 'apply exposed'; end if;
 if not has_function_privilege('service_role','public.ai_diet_draft(uuid,text,jsonb)','execute') then raise exception 'service apply missing'; end if;
 if has_table_privilege('authenticated','private.ai_diet_snapshots','select') or has_table_privilege('anon','private.ai_diet_snapshots','select') then raise exception 'snapshot exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='private.ai_diet_snapshots'::regclass) then raise exception 'snapshot RLS missing'; end if;
 if has_function_privilege('service_role','public.ai_workshop_source(uuid,uuid,integer)','execute') then raise exception 'legacy feature still callable'; end if;
 begin
  update private.ai_feature_config set execution_mode='simulated',input_usd_per_million=1 where feature='diet_draft';
  raise exception 'paid simulation accepted';
 exception when check_violation then null; end;
 raise notice 'PASS 7 SQL security/zero-pricing assertions';
end $$;
rollback;
