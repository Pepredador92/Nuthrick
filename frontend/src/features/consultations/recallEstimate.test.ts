import { expect, it } from 'vitest';
import { isRecallEstimate, recallEstimateTotals } from './recallEstimate';
import { summarizeConfirmedRecall } from '../diet-workshop/clinicalSummary';
import { withConfirmedRecall } from '../../../../supabase/functions/ai/recall-context';
import { buildConsultationSupportContext, buildPesClinicalContext } from '../../../../supabase/functions/ai/clinical';
export const estimate = { confidence: 'low' as const, assumptions: ['Taza de 240 ml supuesta.'], uncertainties: ['Confirmar leche entera o descremada.'], meals: [
  { mealLabel: 'Desayuno', description: 'Un vaso de leche, tamaño supuesto.', energy_kcal: 150, protein_g: 8, carbohydrate_g: 12, fat_g: 8 },
  { mealLabel: 'Comida', description: 'Dos tortillas.', energy_kcal: 140, protein_g: 4, carbohydrate_g: 28, fat_g: 2 },
] };
it('sums meal intake and macro percentages without changing prescribed energy', () => {
  const { total, macros } = recallEstimateTotals(estimate);
  expect(total).toEqual({ energy_kcal: 290, protein_g: 12, carbohydrate_g: 40, fat_g: 10 });
  expect(macros.reduce((sum, m) => sum + m.percentage!, 0)).toBeCloseTo(100);
  for (const bad of [null, { ...estimate, meals: [] }, { ...estimate, confidence: 'exact' }, ...[NaN, -1, Infinity, 50001].map(energy_kcal => ({ ...estimate, meals: [{ ...estimate.meals[0], energy_kcal }] }))]) expect(isRecallEstimate(bad)).toBe(false);
});
it('only approved estimates become PES, objective, instructions and workshop context with explicit uncertainty', () => {
  const record = { method: 'ai_estimate', approved_at: '2026-10-13T12:00:00Z', estimate, items: [], narrative: 'PRIVATE NARRATIVE' };
  const source = { stamp: 's', recall: record, facts: [{ source: 'Entrevista · treatment objective', finding: 'Organizar comidas.' }] };
  const contextual = withConfirmedRecall(source);
  expect(buildPesClinicalContext(contextual).facts.some(f => f.finding.includes('290 kcal'))).toBe(true);
  expect(buildConsultationSupportContext(contextual).facts.some(f => f.source.includes('Incertidumbre'))).toBe(true);
  expect(buildConsultationSupportContext(contextual, true).facts.some(f => f.source.includes('Supuesto'))).toBe(true);
  const summary = summarizeConfirmedRecall(record, s => s);
  expect(summary?.nutrition.energy_kcal).toBe(290);
  expect(summary?.totalsScope).toBe('professionally_reviewed_ai_estimate');
  expect(JSON.stringify(summary)).not.toContain('PRIVATE');
  expect(summarizeConfirmedRecall({ ...record, approved_at: null }, s => s)).toBeUndefined();
  expect(withConfirmedRecall({ ...source, recall: { ...record, approved_at: null } }).facts).toEqual(source.facts);
});
