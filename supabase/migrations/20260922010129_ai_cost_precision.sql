-- Six decimals in USD/million require twelve decimals in per-token audit costs.
-- Credits remain fixed at 0.001; this only preserves provider-cost precision.
alter table private.ai_generations
  alter column estimated_cost type numeric(24,12),
  alter column actual_cost type numeric(24,12);
