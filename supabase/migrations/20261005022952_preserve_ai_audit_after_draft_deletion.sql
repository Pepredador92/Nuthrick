-- AI generation snapshots are a private audit record. The plan can be a
-- never-published draft that its owner chooses to discard; keep the snapshot
-- and its original UUID for attribution without retaining the draft row.
-- Published versions still have their own RESTRICT foreign key and cannot be
-- removed through delete_nutrition_plan_draft.
alter table private.ai_diet_snapshots
  drop constraint if exists ai_diet_snapshots_plan_id_fkey;

comment on column private.ai_diet_snapshots.plan_id is
  'Original workshop plan UUID for private AI audit; the draft may later be deleted.';
