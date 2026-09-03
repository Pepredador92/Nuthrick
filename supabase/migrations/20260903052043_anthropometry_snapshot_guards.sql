-- Explicitly remove inherited Supabase default grants; only append/read are allowed.
revoke all on public.consultation_anthropometry from authenticated, anon, public;
grant select, insert on public.consultation_anthropometry to authenticated;

alter table public.consultation_anthropometry add constraint anthropometry_document_shape check (
 coalesce(
  jsonb_typeof(payload) = 'object'
  and payload->>'schemaVersion' = '1'
  and jsonb_typeof(payload->'engineVersion') = 'string'
  and jsonb_typeof(payload->'input') = 'object'
  and jsonb_typeof(payload->'input'->'measuredAt') = 'string'
  and jsonb_typeof(payload->'input'->'bia') = 'object'
  and jsonb_typeof(payload->'input'->'measurements') = 'object'
  and jsonb_typeof(payload->'results') = 'array'
  and jsonb_typeof(payload->'assessment') = 'array'
  and jsonb_typeof(payload->'note') = 'string'
  and jsonb_typeof(payload->'noteReviewed') = 'boolean'
  and jsonb_typeof(payload->'diagnosis') = 'object',
 false)
);
