-- User-approved production model change for every active OpenAI feature.
-- Standard text pricing verified on 2026-10-04:
-- https://developers.openai.com/api/docs/models/gpt-5.6-luna
-- USD per million tokens: input 0.20, cached input 0.02, output 1.20.
-- Existing generations retain their config_snapshot and original settlement rates.
update private.ai_feature_config
set model = 'gpt-5.6-luna',
    input_usd_per_million = 0.20,
    cached_usd_per_million = 0.02,
    output_usd_per_million = 1.20,
    pricing_version = 'openai-standard-2026-10-04',
    updated_at = now()
where enabled = true
  and provider = 'openai';
