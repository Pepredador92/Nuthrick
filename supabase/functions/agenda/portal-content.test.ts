import { sanitizePortalContent } from './portal-content.ts';

for (const key of ['objectives', 'treatment_objective', 'next_objectives']) {
  Deno.test(`explicit sharing accepts ${key} with consultation provenance`, () => {
    const result = sanitizePortalContent({
      goal: 'Objetivo acordado', instructions: '', results: [], consultations: [],
      goalSource: { consultationId: '00000000-0000-0000-0000-000000000001', revision: 1, questionKey: key },
      privateClinicalData: 'never forward',
    });
    if (result.goalSource?.questionKey !== key || 'privateClinicalData' in result) throw new Error('Invalid patient DTO');
  });
}
Deno.test('sharing rejects unrelated clinical answers', () => {
  try {
    sanitizePortalContent({
      goal: 'Clinical content', instructions: '', results: [], consultations: [],
      goalSource: { consultationId: '00000000-0000-0000-0000-000000000001', revision: 1, questionKey: 'pes_statement' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_input') return;
    throw error;
  }
  throw new Error('Unrelated clinical answer accepted');
});
