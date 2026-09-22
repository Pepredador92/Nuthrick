/** Read-only UX projection. Never expose source records, manifests or catalog IDs. */
import { getDietGenerationEligibility, manualGenerationPolicy } from './diet-generation-domain.js';
import { redactClinicalText } from './clinical.ts';
import { dietHash, type DietSource } from './diet.ts';

export async function dietPreflight(loaded: DietSource, enabled: boolean, budgetAvailable: boolean) {
  const identifiers = loaded.identifiers.filter((v): v is string => typeof v === 'string' && !!v);
  const result = getDietGenerationEligibility({ source: loaded.source, policy: manualGenerationPolicy(),
    sanitizeText: (s: string) => redactClinicalText(s, identifiers) }, { enabled, budgetAvailable, pending: false });
  const c = result.context;
  return { eligible: result.eligible, reasons: result.reasons.map((r: {code:string}) => ({code:r.code})),
    contextToken: await dietHash({ stamp: loaded.source.stamp, instructions: loaded.source.additionalInstructions ?? '' }),
    context: { clinical: c.clinical, prescription: c.prescription,
      restrictions: { reaction_status: c.restrictions.reaction_status, reactions: c.restrictions.reactions },
      preferences: { eating_pattern: c.preferences.eating_pattern, foods: c.preferences.foods },
      routine: c.routine, professional_instructions: c.professional_instructions,
      // The provider receives meal names, not private IDs or scheduled times.
      meals: c.meals.fact.state === 'known' ? c.meals.fact.value.map((m: {display_name:string}) => m.display_name) : [] } };
}
