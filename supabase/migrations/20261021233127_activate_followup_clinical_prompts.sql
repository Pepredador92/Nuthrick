begin;
-- The compatible Edge adapter and refund endpoint must be deployed first.
do $$begin
 if not exists(select 1 from private.ai_feature_config where feature='pes_diagnosis' and prompt_version in ('pes_diagnosis@9','pes_diagnosis@10'))
  or not exists(select 1 from private.ai_feature_config where feature='consultation_support' and prompt_version in ('consultation_support@5','consultation_support@6')) then
   raise exception 'Unexpected clinical prompt configuration';
 end if;
 update private.ai_feature_config set prompt_version='pes_diagnosis@10',updated_at=now()
  where feature='pes_diagnosis' and prompt_version='pes_diagnosis@9';
 update private.ai_feature_config set prompt_version='consultation_support@6',updated_at=now()
  where feature='consultation_support' and prompt_version='consultation_support@5';
end $$;
commit;
