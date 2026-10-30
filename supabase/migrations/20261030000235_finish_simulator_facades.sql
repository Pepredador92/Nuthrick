-- Rebind facade plans after installing the new private implementations.
create or replace function public.my_billing() returns jsonb
language sql security invoker set search_path='' as $$select private.my_billing()$$;
create or replace function public.my_ai_credits() returns jsonb
language sql security invoker set search_path='' as $$select private.my_ai_credits()$$;
create or replace function public.billing_server(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.billing_server(p_action,p_data)$$;

-- Cancelling a simulated renewal keeps access until the displayed period ends,
-- matching the real subscription flow and keeping its Resume action available.
do $$ declare original text;updated text;begin
 original:=pg_get_functiondef('private.my_billing()'::regprocedure);
 updated:=replace(original,'''state'',r.subscription_state','''state'',''active''');
 if updated=original then raise exception 'simulation_subscription_state_missing';end if;
 execute updated;
end $$;
notify pgrst,'reload schema';
