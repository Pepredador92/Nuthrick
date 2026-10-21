begin;
-- Deploy the adapter with @3 support before activating. Keep the current model,
-- pricing, quotas and consumption accounting unchanged.
do $$begin
 if not exists(select 1 from private.ai_feature_config where feature='intervention_strategy' and prompt_version in ('intervention_strategy@1','intervention_strategy@2','intervention_strategy@3')) then raise exception 'Unexpected strategy prompt configuration'; end if;
 update private.ai_feature_config set prompt_version='intervention_strategy@3',updated_at=now()
 where feature='intervention_strategy' and prompt_version<>'intervention_strategy@3';
end $$;
commit;
