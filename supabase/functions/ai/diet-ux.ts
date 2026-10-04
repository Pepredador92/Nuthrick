/** Read-only UX projection. Never expose source records, manifests or catalog IDs. */
import { getDietGenerationEligibility, prepareGuidedDiet, manualGenerationPolicy } from './diet-generation-domain.js';
import { redactClinicalText } from './clinical.ts';
import { dietHash, type DietSource } from './diet.ts';

export async function dietPreflight(loaded: DietSource, enabled: boolean, budgetAvailable: boolean) {
  const identifiers = loaded.identifiers.filter((v): v is string => typeof v === 'string' && !!v);
  const guided = prepareGuidedDiet(loaded.source);
  const result = getDietGenerationEligibility({ source: guided.source, policy: manualGenerationPolicy(),
    sanitizeText: (s: string) => redactClinicalText(s, identifiers) }, { enabled, budgetAvailable, pending: false });
  const c = result.context;
  return { eligible: result.eligible && !guided.issues.length, reasons: [...guided.issues,...result.reasons].map((r: {code:string}) => ({code:r.code})),
    contextToken: await dietHash({ stamp: loaded.source.stamp, instructions: loaded.source.additionalInstructions ?? '',...(loaded.source.guidance?{guidance:loaded.source.guidance}:{}) }),
    context: { historyRequiresReview: loaded.source.historyRequiresReview === true, clinical: c.clinical, prescription: c.prescription,
      restrictions: { reaction_status: c.restrictions.reaction_status, reactions: c.restrictions.reactions },
      preferences: { eating_pattern: c.preferences.eating_pattern, foods: c.preferences.foods },
      routine: c.routine, professional_instructions: c.professional_instructions,
      // The provider receives meal names, not private IDs or scheduled times.
      meals: c.meals.fact.state === 'known' ? c.meals.fact.value.map((m: {display_name:string}) => m.display_name) : [] } };
}
