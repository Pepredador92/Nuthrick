-- Version the compact PES context/prompt. Preserve administrator-defined input,
-- output and credit limits, model, prices, entitlements and enabled state.
update private.ai_feature_config
set prompt_version='pes_diagnosis@2',updated_at=now()
where feature='pes_diagnosis' and prompt_version='pes_diagnosis@1';
