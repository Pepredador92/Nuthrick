-- Activate only after deploying the adapter that accepts draft planning contexts.
update private.ai_feature_config set prompt_version='intervention_strategy@2',updated_at=now() where feature='intervention_strategy' and prompt_version='intervention_strategy@1';
