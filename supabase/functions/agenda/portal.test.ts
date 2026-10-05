import { strict as assert } from 'node:assert';
import { portalRequest } from './portal.ts';

Deno.test('professional can retire a published version through the scoped history action', async () => {
  const ownerId = '00000000-0000-4000-8000-000000000001';
  const patientId = '00000000-0000-4000-8000-000000000002';
  const versionId = '00000000-0000-4000-8000-000000000003';
  let call: Record<string, unknown> | null = null;
  const result = await portalRequest(
    new Request('https://nuthrick.test/functions/v1/agenda', { method: 'POST' }),
    { op: 'portal_owner', action: 'plan_history', patientId, retireVersionId: versionId },
    {
      rpc: async (payload) => { call = payload; return { ok: true, removedFromSharedPlan: true }; },
      owner: async () => ownerId,
      limit: async () => undefined,
      mail: async () => 'sent',
      key: 'test-key',
    },
  );
  assert.deepEqual(call, {
    p_action: 'plan_history',
    p_data: { owner: ownerId, patientId, retireVersionId: versionId },
  });
  assert.deepEqual(result, { ok: true, removedFromSharedPlan: true });
});
