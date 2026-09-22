import { describe, it, expect } from 'vitest';
import { summarizeConfirmedRecall, summarizeAnthropometry } from './clinicalSummary';
const food = { name: 'Tortilla', group_code: 'CEREALS_NO_FAT', portion_amount: 1, portion_unit: 'tortilla' };
const recall = { approved_at: '2026-09-22T12:00:00Z', narrative: 'PRIVATE NARRATIVE', items: [{ mealLabel: 'Desayuno', quantity: 2, unit: 'tortilla', food, rawText: 'PRIVATE RAW' }] };
describe('compact clinical summary', () => {
  it('ignores absent, unapproved and malformed recall', () => {
    for (const r of [null, {}, { ...recall, approved_at: null }, { ...recall, approved_at: 'invalid' }, { ...recall, items: [{ ...recall.items[0], quantity: null }] }]) expect(summarizeConfirmedRecall(r, s => s)).toBeUndefined();
  });
  it('uses deterministic confirmed totals, not narrative or submitted totals', () => {
    const result = summarizeConfirmedRecall({ ...recall, total: { energy_kcal: 9000 } }, s => s)!;
    expect(result.nutrition.energy_kcal).toBe(140);
    expect(result.meals).toEqual([{ name: 'Desayuno', foods: ['Tortilla'] }]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|9000|approved_at|rawText/);
    expect(result.scope).toBe('one_recorded_day_not_prescription');
    expect(result.totalsScope).toBe('confirmed_items_only');
  });
  it('bounds names and lists, keeps totals for all confirmed items, marks truncation', () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ ...recall.items[0], mealLabel: `Tiempo ${i % 12}`, food: { ...food, name: `${i} ${'x'.repeat(1000)}` } }));
    const result = summarizeConfirmedRecall({ ...recall, items }, s => s)!;
    expect(result.meals).toHaveLength(8); expect(result.foodListTruncated).toBe(true);
    expect(result.meals.every(m => m.foods.length <= 8 && m.foods.every(f => f.length <= 64))).toBe(true);
    expect(result.nutrition.energy_kcal).toBe(21000);
    expect(JSON.stringify(result).length).toBeLessThan(5100);
  });
  it('includes only measured/derived available fields and does not calculate BMI', () => {
    expect(summarizeAnthropometry({ weightKg: 70, heightCm: 170 })).toEqual({ weightKg: 70, heightCm: 170 });
    expect(summarizeAnthropometry({ bmi: 24, waistCm: 80, bodyFatPct: 20, leanMassKg: 56, history: [1, 2], name: 'PRIVATE' })).toEqual({ bmi: 24, waistCm: 80, bodyFatPct: 20, leanMassKg: 56 });
    for (const v of [null, {}, { weightKg: '70', heightCm: -1, bmi: NaN, bodyFatPct: 101 }]) expect(summarizeAnthropometry(v)).toBeUndefined();
  });
});
