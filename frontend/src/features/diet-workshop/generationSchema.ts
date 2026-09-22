import { DIET_GENERATION_LIMITS as limits } from './generationCandidates';

export type DietModelOutput = { schema_version: 1; meal_options: Array<{
  meal_ref: string;
  entries: Array<{ candidate_ref: string; portion_ref: 'base'; multiplier: number }>;
}> };
export type GenerationIssue = { code: string; path: string };
const ref = { type: 'string', minLength: 1, maxLength: 80 };
/** Provider-neutral JSON schema; paired with the strict runtime parser below. */
export const dietGenerationOutputSchema = {
  type: 'object', additionalProperties: false, required: ['schema_version', 'meal_options'], properties: {
    schema_version: { const: 1 }, meal_options: { type: 'array', minItems: 1, maxItems: limits.maxMeals, items: {
      type: 'object', additionalProperties: false, required: ['meal_ref', 'entries'], properties: {
        meal_ref: ref, entries: { type: 'array', minItems: 1, maxItems: limits.maxEntriesPerMeal, items: {
          type: 'object', additionalProperties: false, required: ['candidate_ref', 'portion_ref', 'multiplier'], properties: {
            candidate_ref: ref, portion_ref: { const: 'base' }, multiplier: { type: 'number', exclusiveMinimum: 0, maximum: limits.maxMultiplier, multipleOf: limits.multiplierIncrement },
          },
        } },
      },
    } },
  },
} as const;

/** Small validator for exactly the schema vocabulary used above. No coercion,
 * ignored fields, implicit defaults or dependency on an LLM SDK. */
type Schema = { type?: string; const?: unknown; required?: readonly string[]; additionalProperties?: boolean;
  properties?: Record<string, Schema>; items?: Schema; minItems?: number; maxItems?: number;
  minLength?: number; maxLength?: number; exclusiveMinimum?: number; maximum?: number; multipleOf?: number };
export function parseDietModelOutput(value: unknown): { data?: DietModelOutput; issues: GenerationIssue[] } {
  const issues: GenerationIssue[] = [];
  const fail = (path: string) => { issues.push({ code: 'invalid_output', path }); };
  const visit = (v: unknown, s: Schema, path: string) => {
    if ('const' in s && v !== s.const) { fail(path); return; }
    if (s.type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { fail(path); return; }
      const r = v as Record<string, unknown>;
      if (Object.keys(r).some(k => !Object.hasOwn(s.properties ?? {}, k)) || s.required?.some(k => !Object.hasOwn(r,k))) { fail(path); return; }
      for (const [k, child] of Object.entries(s.properties ?? {})) visit(r[k], child, `${path}.${k}`);
    } else if (s.type === 'array') {
      if (!Array.isArray(v) || v.length < (s.minItems ?? 0) || v.length > (s.maxItems ?? Infinity)) { fail(path); return; }
      v.forEach((item,i) => visit(item, s.items!, `${path}[${i}]`));
    } else if (s.type === 'string') {
      if (typeof v !== 'string' || v.length < (s.minLength ?? 0) || v.length > (s.maxLength ?? Infinity)) fail(path);
    } else if (s.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= (s.exclusiveMinimum ?? -Infinity) || v > (s.maximum ?? Infinity)
        || (s.multipleOf !== undefined && !Number.isInteger(v / s.multipleOf))) fail(path);
    }
  };
  try {
    if (JSON.stringify(value)?.length > limits.maxResponseCharacters) return { issues: [{ code: 'invalid_output', path: '$' }] };
    visit(value, dietGenerationOutputSchema, '$');
  } catch { fail('$'); }
  return issues.length ? { issues } : { data: value as DietModelOutput, issues };
}
