/** Compact, allowlisted projection of server-owned, professionally saved data.
 * Never infer long-term habits or prescribe from a single recorded day. */
import { calculateExchangeTotals } from '../exchanges/model';
import { exchangeContributionForFood } from '../menu/model';
import { exchangeCatalog } from '../exchanges/catalog';
import type { FoodSnapshot } from '../../types/domain';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const groups = new Set<string>(exchangeCatalog.map(g => g.groupCode));
export const CLINICAL_SUMMARY_LIMITS = { meals: 8, foodsPerMeal: 8, foodCharacters: 64, recordedItems: 150 } as const;

export function summarizeConfirmedRecall(raw: unknown, sanitize: (s: string) => string) {
  if (!object(raw) || typeof raw.approved_at !== 'string' || !Number.isFinite(Date.parse(raw.approved_at))
    || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > CLINICAL_SUMMARY_LIMITS.recordedItems) return undefined;
  const clean = (s: string) => sanitize(s).trim().slice(0, CLINICAL_SUMMARY_LIMITS.foodCharacters);
  const contributions: ReturnType<typeof exchangeContributionForFood> = [];
  const meals = new Map<string, Set<string>>();
  for (const item of raw.items) {
    if (!object(item) || !object(item.food) || typeof item.mealLabel !== 'string' || !item.mealLabel.trim()
      || typeof item.food.name !== 'string' || !item.food.name.trim() || !positive(item.quantity) || item.quantity > 10000
      || !positive(item.food.portion_amount) || item.unit !== item.food.portion_unit
      || typeof item.food.group_code !== 'string' || !groups.has(item.food.group_code)) return undefined;
    // Same deterministic exchange engine as the confirmed R24h UI. No model totals.
    contributions.push(...exchangeContributionForFood(item.food as FoodSnapshot, item.quantity));
    const meal = clean(item.mealLabel), food = clean(item.food.name);
    if (!meals.has(meal)) meals.set(meal, new Set());
    meals.get(meal)!.add(food);
  }
  const totals = calculateExchangeTotals(contributions);
  if (!Object.values(totals).every(v => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const truncated = meals.size > CLINICAL_SUMMARY_LIMITS.meals || [...meals.values()].some(f => f.size > CLINICAL_SUMMARY_LIMITS.foodsPerMeal);
  return {
    scope: 'one_recorded_day_not_prescription' as const,
    totalsScope: 'confirmed_items_only' as const,
    nutrition: totals,
    meals: [...meals].slice(0, CLINICAL_SUMMARY_LIMITS.meals).map(([name, foods]) => ({ name, foods: [...foods].slice(0, CLINICAL_SUMMARY_LIMITS.foodsPerMeal) })),
    ...(truncated ? { foodListTruncated: true } : {}),
  };
}

/** Values/units selected by the server, no raw rows, identity or historical series.
 * Derived BMI/composition must already exist; do not calculate a new result. */
export function summarizeAnthropometry(raw: unknown) {
  if (!object(raw)) return undefined;
  const keys = ['weightKg', 'heightCm', 'bmi', 'waistCm', 'bodyFatPct', 'leanMassKg'] as const;
  const result = Object.fromEntries(keys.flatMap(k => positive(raw[k]) && (k !== 'bodyFatPct' || raw[k] <= 100) ? [[k, raw[k]]] : []));
  return Object.keys(result).length ? result : undefined;
}
