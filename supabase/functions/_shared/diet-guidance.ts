/** Explicit professional choices, never model/system instructions or clinical approvals. */
export type DietGuidance = {
  version: 1;
  objective: string;
  contextReviewed: boolean;
  reactionReview: 'recorded' | 'none_confirmed';
  meals: Array<{ name: string; type: 'BREAKFAST' | 'SNACK' | 'MAIN_MEAL' | 'DINNER' | 'CUSTOM'; time: string | null; options: number }>;
};
export const GUIDED_DIET_LIMITS = { maxMeals: 6, maxOptionsPerMeal: 3, maxOptions: 12 } as const;
export function isDietGuidance(value: unknown): value is DietGuidance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as DietGuidance;
  const exact = (x: object, keys: string[]) => Object.keys(x).length === keys.length && Object.keys(x).every(k => keys.includes(k));
  return exact(v, ['version','objective','contextReviewed','reactionReview','meals'])
    && v.version === 1 && typeof v.objective === 'string' && v.objective.trim().length > 0 && v.objective.length <= 1200
    && typeof v.contextReviewed === 'boolean' && ['recorded','none_confirmed'].includes(v.reactionReview)
    && Array.isArray(v.meals) && v.meals.length > 0 && v.meals.length <= GUIDED_DIET_LIMITS.maxMeals
    && v.meals.every(m => m && typeof m === 'object' && exact(m,['name','type','time','options'])
      && typeof m.name === 'string' && m.name.trim().length > 0 && m.name.length <= 60
      && ['BREAKFAST','SNACK','MAIN_MEAL','DINNER','CUSTOM'].includes(m.type)
      && (m.time === null || typeof m.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))
      && Number.isInteger(m.options) && m.options >= 1 && m.options <= GUIDED_DIET_LIMITS.maxOptionsPerMeal)
    && new Set(v.meals.map(m => m.name.trim().toLocaleLowerCase())).size === v.meals.length
    && v.meals.reduce((n,m) => n + m.options,0) <= GUIDED_DIET_LIMITS.maxOptions;
}
