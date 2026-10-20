begin;
-- Deploy the Edge function supporting @7 before activating this prompt.
-- Keep the current model, reasoning effort, pricing and token limits.
do $$
begin
  if not exists(select 1 from private.ai_feature_config where feature='pes_diagnosis' and prompt_version='pes_diagnosis@6') then
    raise exception 'Unexpected PES configuration; review before activation';
  end if;
  update private.ai_feature_config set prompt_version='pes_diagnosis@7',updated_at=now()
    where feature='pes_diagnosis' and prompt_version='pes_diagnosis@6';
end $$;
commit;
