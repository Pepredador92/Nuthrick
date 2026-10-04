import { isDietGuidance } from '../../../../supabase/functions/_shared/diet-guidance';
import { exchangeCatalog } from '../exchanges/catalog';
import { applyExchangeSuggestion, confirmExchangePrescription, createExchangePrescription } from '../exchanges/model';
import { applyMealDistributionSuggestion, confirmMealDistribution, createMealDistribution, createMealTime } from '../meal-distribution/model';
import { createFoodSnapshot, exchangeContributionForFood } from '../menu/model';
import { hardFoodAllowed } from './generationCandidates';
import { exchangeAlternatives, mealAlternatives } from './proposals';
import { foodTargetsFor } from '../supplements/targets';
import { buildDietGenerationContext, type DietContextSource } from './generationContext';

/** Prepare all steps in memory. Only the atomic, revision-checked apply saves them. */
export function prepareGuidedDiet(source: DietContextSource): { source: DietContextSource; issues: Array<{code:string;path:string}> } {
  if (!source.guidance) return {source,issues:[]};
  const g = source.guidance;
  const fail = (code:string) => ({source,issues:[{code,path:'guidance'}]});
  if (!isDietGuidance(g) || !g.contextReviewed) return fail('context_review_required');
  const copy = structuredClone(source);
  // An explicit review can supply a missing negative; it cannot erase recorded reactions.
  const reactions = copy.answers.food_reactions_v2?.value;
  if (g.reactionReview === 'none_confirmed' && copy.answers.food_reactions_status?.value !== 'Sí'
    && (reactions == null || Array.isArray(reactions) && !reactions.length) && !copy.historyRequiresReview) {
    copy.answers.food_reactions_status = {value:'No',response_area:'professional_assessment'};
  }
  const check = buildDietGenerationContext({...copy,catalog:undefined},s=>s);
  const critical = check.blockers.filter(c => !['catalog_required','meal_structure_required','meal_structure_invalid','distribution_invalid'].includes(c));
  if (critical.length) return {source:copy,issues:critical.map(code=>({code,path:'context'}))};
  if (copy.historyRequiresReview) return fail('restrictions_need_review');
  const targets = foodTargetsFor(copy.plan);
  if (Object.values(targets).some(v=>!Number.isFinite(v)||v<=0)) return fail('prescription_inconsistent');
  const excluded = Object.entries(copy.plan.diet_menu?.food_preferences??{}).filter(([,v])=>v==='exclude').map(([id])=>id);
  const foods = copy.catalog?.foods.filter(f=>hardFoodAllowed(f,copy.plan.professional_id,{excludedFoodIds:excluded}))??[];
  const recipes = copy.catalog?.recipes.filter(r=>r.active && (r.owner_id===null||r.owner_id===copy.plan.professional_id)
    && r.items.length>0 && r.items.every(i=>i.amount>0&&foods.some(f=>f.id===i.food_item_id&&f.portion_unit===i.unit))).map(r=>({...r,items:r.items.map(i=>{const f=foods.find(f=>f.id===i.food_item_id)!;return {...i,food_snapshot:createFoodSnapshot(f),exchange_contribution:exchangeContributionForFood(f,i.amount)};})}))??[];
  if (!foods.length) return fail('catalog_required');
  let distribution = createMealDistribution(()=> 'guided-initial');
  distribution.meal_times = g.meals.map((m,i)=>({...createMealTime(m.name.trim(),i,m.time,`guided-meal-${i+1}`),meal_type:m.type}));
  const preferences = Object.fromEntries(exchangeCatalog.filter(c=>!foods.some(f=>f.group_code===c.groupCode)).map(c=>[c.groupCode,'exclude' as const]));
  try {
    const exchanges = exchangeAlternatives({targets,options:{groupPreferences:preferences}},{foods,recipes},distribution)[0];
    let prescription = confirmExchangePrescription(applyExchangeSuggestion(createExchangePrescription(targets),targets,exchanges),targets);
    // Stable metadata keeps retries and context hashes deterministic.
    const stamp = source.plan.updated_at;
    prescription = {...prescription,confirmed_at:stamp,updated_at:stamp,suggestion_applied_at:stamp};
    const meal = mealAlternatives(distribution,prescription,[],false,{foods,recipes}).find(m=>distribution.meal_times.every(t=>m.distribution.some(c=>c.meal_time_id===t.id&&c.portions>0)));
    if (!meal) return fail('invalid_distribution');
    distribution = confirmMealDistribution(applyMealDistributionSuggestion(distribution,meal),prescription);
    distribution = {...distribution,confirmed_at:stamp,updated_at:stamp,suggestion_metadata:distribution.suggestion_metadata?{...distribution.suggestion_metadata,generated_at:stamp}:undefined};
    copy.plan = {...copy.plan,exchange_prescription:prescription,meal_distribution:distribution};
    return {source:copy,issues:[]};
  } catch { return fail('proposal_unavailable'); }
}
