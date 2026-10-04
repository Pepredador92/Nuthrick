import {AIError} from './core.ts';
import {dietHash,type DietSource} from './diet.ts';
import {redactClinicalText} from './clinical.ts';
import {buildDietGenerationContext,textDietReviewSource} from './diet-generation-domain.js';
import {isTextDietGuidance,isTextDiet,type TextDietGuidance,type TextDiet} from '../_shared/text-diet.ts';

export type TextDietSource=DietSource;
export function textDietContext(loaded:TextDietSource,guidance:TextDietGuidance,instructions='') {
  if(!isTextDietGuidance(guidance))throw new AIError('invalid_request');
  const clean=(s:string)=>redactClinicalText(s,loaded.identifiers.filter((v):v is string=>typeof v==='string'&&!!v));
  const reviewedSource=textDietReviewSource(loaded.source);
  const {context,blockers}=buildDietGenerationContext({...reviewedSource.source,catalog:undefined,additionalInstructions:instructions,
    guidance:{version:1,objective:guidance.objective,contextReviewed:guidance.contextReviewed,reactionReview:'recorded',
      meals:guidance.meals.map(m=>({...m,type:'CUSTOM' as const,options:1}))}},clean);
  const reasons=blockers.filter(b=>['draft_required','consultation_required','context_mismatch','energy_required','macros_required','prescription_inconsistent','instructions_too_long'].includes(b)).map(code=>({code}));
  if(!guidance.contextReviewed||!guidance.objective.trim())reasons.push({code:'context_review_required'});
  if(!guidance.restrictionsReviewed||!guidance.restrictions.trim())reasons.push({code:'text_restrictions_required'});
  const payload={format:'text_diet' as const,diet_count:guidance.dietCount,
    meal_schedule:guidance.meals.map(m=>({name:clean(m.name),time:m.time})),
    clinical:{...context.clinical,...(reviewedSource.suggestionOrigin&&context.clinical.objective.fact.state!=='known'?{objectiveSuggestionOrigin:reviewedSource.suggestionOrigin}:{})},prescription:context.prescription,
    restrictions:{reaction_status:context.restrictions.reaction_status,reactions:context.restrictions.reactions,professional_review:clean(guidance.restrictions)},
    preferences:{eating_pattern:context.preferences.eating_pattern,foods:context.preferences.foods},routine:context.routine,
    professional_instructions:clean(instructions)};
  return {payload,reasons};
}
export type TextDietSnapshot={version:1;format:'text_diet';hash:string;sourceStamp:string;payload:ReturnType<typeof textDietContext>['payload'];prescription:TextDiet['prescription']};
export async function textDietPreflight(loaded:TextDietSource,guidance:TextDietGuidance,instructions:string,available=true,budget=true) {
  const {payload,reasons}=textDietContext(loaded,guidance,instructions);
  if(!available)reasons.push({code:'feature_disabled'});if(!budget)reasons.push({code:'insufficient_credits'});
  return {eligible:!reasons.length,reasons,context:payload,contextToken:await dietHash([loaded.source.stamp,guidance,instructions])};
}
export async function prepareTextDietSnapshot(loaded:TextDietSource,guidance:TextDietGuidance,instructions:string):Promise<TextDietSnapshot> {
  const {payload,reasons}=textDietContext(loaded,guidance,instructions);
  if(reasons.length)throw new AIError(reasons[0].code);
  const value={version:1 as const,format:'text_diet' as const,sourceStamp:loaded.source.stamp,payload,
    prescription:{target_calories:loaded.source.plan.target_calories,macro_distribution:loaded.source.plan.macro_distribution}};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>48000)throw new AIError('input_too_large');
  return {...value,hash:await dietHash(value)};
}
export async function verifyTextDietSnapshot(value:TextDietSnapshot) {
  const {hash,...content}=value;
  if(value.format!=='text_diet'||value.version!==1||await dietHash(content)!==hash)throw new AIError('snapshot_invalid');
}
type ModelMeal={title:string;ingredients:string[];preparation:string};
export function validateTextDietOutput(output:unknown,snapshot:TextDietSnapshot):TextDiet|null {
  const diets=(output as {diets?:Array<{meals:ModelMeal[]}>}|null)?.diets;
  if(!Array.isArray(diets)||diets.length!==snapshot.payload.diet_count)return null;
  const signatures=new Set<string>();
  const clean=(s:string)=>redactClinicalText(s,[]).trim();
  const rows=[];
  for(const [i,day] of diets.entries()) {
    if(!Array.isArray(day.meals)||day.meals.length!==snapshot.payload.meal_schedule.length)return null;
    if(day.meals.some(m=>!m||typeof m.title!=='string'||!m.title.trim()||m.title.length>120||typeof m.preparation!=='string'||!m.preparation.trim()||m.preparation.length>500
      ||!Array.isArray(m.ingredients)||m.ingredients.length<1||m.ingredients.length>9||m.ingredients.some(s=>typeof s!=='string'||!s.trim()||s.length>160)))return null;
    const ingredientKey=(s:string)=>s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\d.,/½¼¾⅓⅔⅛⅜⅝⅞]+/g,' ').replace(/\b(gramos?|g|kg|ml|litros?|tazas?|piezas?|cucharadas?|cucharaditas?|rebanadas?|de)\b/g,' ').replace(/\s+/g,' ').trim();
    const signature=day.meals.map(m=>m.ingredients.map(ingredientKey).sort().join('|')).sort().join('\n');
    if(signatures.has(signature))return null;signatures.add(signature);
    const text=day.meals.map((meal,j)=>{
      const time=snapshot.payload.meal_schedule[j];
      return `${time.name}${time.time?' · '+time.time:''}\n${clean(meal.title)}\n${meal.ingredients.map(s=>'• '+clean(s)).join('\n')}\nPreparación: ${clean(meal.preparation)}`;
    }).join('\n\n');
    rows.push({id:`diet-${i+1}`,title:`Dieta ${i+1}`,text});
  }
  const draft:TextDiet={schema_version:1,requested_count:snapshot.payload.diet_count,diets:rows,meals:snapshot.payload.meal_schedule,reviewed_at:null,prescription:snapshot.prescription};
  return isTextDiet(draft)?draft:null;
}
