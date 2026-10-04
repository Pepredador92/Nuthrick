/** Shared plain-text contract. No catalog identifiers, HTML, or model-reported nutrients. */
export type TextDietGuidance = {
  version: 1; dietCount: number; objective: string; contextReviewed: boolean;
  restrictionsReviewed: boolean; restrictions: string;
  meals: Array<{ name: string; time: string | null }>;
};
export type TextDiet = {
  schema_version: 1; requested_count: number;
  diets: Array<{ id: string; title: string; text: string }>;
  meals: TextDietGuidance['meals'];
  reviewed_at: string | null;
  prescription: { target_calories: number | null; macro_distribution: unknown };
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !v.includes('\u0000');
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).every(k => names.includes(k));
export function isTextDietMeals(v: unknown): v is TextDietGuidance['meals'] {
  return Array.isArray(v) && v.length >= 1 && v.length <= 6 && v.every(m => obj(m) && keys(m,['name','time']) && str(m.name,60)
    && (m.time === null || typeof m.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)))
    && new Set(v.map(m => m.name.trim().toLocaleLowerCase())).size === v.length;
}
export function isTextDietGuidance(v: unknown): v is TextDietGuidance {
  return obj(v) && keys(v,['version','dietCount','objective','contextReviewed','restrictionsReviewed','restrictions','meals'])
    && v.version === 1 && Number.isInteger(v.dietCount) && Number(v.dietCount) >= 1 && Number(v.dietCount) <= 7
    && typeof v.objective === 'string' && v.objective.length <= 1200 && typeof v.contextReviewed === 'boolean'
    && typeof v.restrictionsReviewed === 'boolean' && typeof v.restrictions === 'string' && v.restrictions.length <= 1500
    && isTextDietMeals(v.meals);
}
export function isTextDiet(v: unknown): v is TextDiet {
  return obj(v) && keys(v,['schema_version','requested_count','diets','meals','reviewed_at','prescription']) && v.schema_version === 1
    && Number.isInteger(v.requested_count) && Number(v.requested_count) >= 1 && Number(v.requested_count) <= 7
    && Array.isArray(v.diets) && v.diets.length === v.requested_count
    && v.diets.every(d => obj(d) && keys(d,['id','title','text']) && str(d.id,60) && str(d.title,120) && str(d.text,12000))
    && new Set(v.diets.map(d=>d.id)).size === v.diets.length
    && isTextDietMeals(v.meals) && (v.reviewed_at === null || typeof v.reviewed_at === 'string' && Number.isFinite(Date.parse(v.reviewed_at)))
    && obj(v.prescription) && keys(v.prescription,['target_calories','macro_distribution'])
    && (v.prescription.target_calories === null || typeof v.prescription.target_calories === 'number' && Number.isFinite(v.prescription.target_calories))
    && (v.prescription.macro_distribution === null || obj(v.prescription.macro_distribution));
}
export const canonicalTextDietValue = (value: unknown): string => JSON.stringify(value,(_k,v:unknown)=>
  obj(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en'))) : v);
export function textDietPrescriptionMatches(diet:TextDiet,plan:TextDiet['prescription']) {
  return canonicalTextDietValue(diet.prescription) === canonicalTextDietValue({target_calories:plan.target_calories,macro_distribution:plan.macro_distribution});
}
