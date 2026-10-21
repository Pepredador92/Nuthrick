begin;
-- Deploy the @3 adapter before activation. Only the prompt/schema changes;
-- the model, funded token allocation and actual usage accounting stay intact.
do $$begin
 if not exists(select 1 from private.ai_feature_config where feature='patient_instructions'
   and prompt_version in ('patient_instructions@1','patient_instructions@2','patient_instructions@3')) then
   raise exception 'Unexpected patient instructions prompt configuration';
 end if;
 update private.ai_feature_config set prompt_version='patient_instructions@3',updated_at=now()
 where feature='patient_instructions' and prompt_version<>'patient_instructions@3';
end $$;
commit;
