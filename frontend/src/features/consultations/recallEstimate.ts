export type RecallEstimateMeal = {
  mealLabel: string;
  description: string;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
};
export type RecallEstimate = {
  meals: RecallEstimateMeal[];
  assumptions: string[];
  uncertainties: string[];
  confidence: 'low' | 'moderate' | 'high';
};
export const recallNutrients = [
  { key: 'energy_kcal', label: 'Energía', unit: 'kcal', max: 10000 },
  { key: 'protein_g', label: 'Proteína', unit: 'g', max: 1000 },
  { key: 'carbohydrate_g', label: 'Carbohidratos', unit: 'g', max: 1000 },
  { key: 'fat_g', label: 'Grasas', unit: 'g', max: 1000 },
] as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const notes = (v: unknown) => Array.isArray(v) && v.length <= 20 && v.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 1000);
export function isRecallEstimate(v: unknown): v is RecallEstimate {
  if (!object(v) || !['low', 'moderate', 'high'].includes(String(v.confidence)) || !notes(v.assumptions) || !notes(v.uncertainties)
    || !Array.isArray(v.meals) || !v.meals.length || v.meals.length > 12) return false;
  if (!v.meals.every(m => object(m) && typeof m.mealLabel === 'string' && m.mealLabel.trim().length > 0 && m.mealLabel.length <= 120
    && typeof m.description === 'string' && m.description.trim().length > 0 && m.description.length <= 1000
    && recallNutrients.every(n => { const value = m[n.key]; return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= n.max; }))) return false;
  return recallNutrients.every(n => (v.meals as RecallEstimateMeal[]).reduce((sum, m) => sum + m[n.key], 0) <= n.max * 3);
}
export function recallEstimateTotals(estimate: RecallEstimate) {
  const total = { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 };
  for (const meal of estimate.meals) for (const n of recallNutrients) total[n.key] += meal[n.key];
  const macros = [
    { code: 'PROTEIN', label: 'Proteína', grams: total.protein_g, factor: 4, color: '#ab8bc8' },
    { code: 'CARBOHYDRATE', label: 'Carbohidratos', grams: total.carbohydrate_g, factor: 4, color: '#65b4ce' },
    { code: 'FAT', label: 'Grasas', grams: total.fat_g, factor: 9, color: '#d7ae68' },
  ];
  const energy = macros.reduce((sum, m) => sum + m.grams * m.factor, 0);
  return { total, macros: macros.map(m => ({ ...m, percentage: energy > 0 ? m.grams * m.factor / energy * 100 : null })) };
}
