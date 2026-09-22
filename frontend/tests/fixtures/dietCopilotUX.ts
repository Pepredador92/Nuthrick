/** Offline only: the same eligibility, FakeDietGenerator, validator and adapter as the domain. */
import { dietCalibrationFixture } from '../../src/features/diet-workshop/generationCalibrationFixtures';
import { validFakeOutput } from '../../src/features/diet-workshop/generationFixtures';
import { FakeDietGenerator, getDietGenerationEligibility, prepareDietGeneration, validateDietGenerationDraft, applyDietGenerationDraft, hasDietMenuContent, type GenerationInput, type PreparedDietGeneration } from '../../src/features/diet-workshop/generationBoundary';
import { addFoodToMenu, createDietMenu } from '../../src/features/menu/model';
import type { WorkshopTransport, WorkshopPreflight } from '../../src/services/dietWorkshopAI';
import { AIRequestError } from '../../src/services/ai';
import type { NutritionPlan } from '../../src/types/domain';

export function uxFixture(mode='valid') {
  const loaded=dietCalibrationFixture('A');
  const input:GenerationInput={...loaded,policy:{restrictions:{},unresolved:[]},sanitizeText:s=>s.replace(/PRIVATE|\S+@\S+/g,'[omitido]')};
  input.source.plan.diet_menu=null;
  if(mode==='replace')input.source.plan.diet_menu=addFoodToMenu(createDietMenu(input.source.plan.meal_distribution!),input.source.plan.meal_distribution!,'meal-1',input.source.catalog!.foods[0],1,'manual');
  if(mode==='blocked')input.source.consultation!.pes=null;
  let prepared:PreparedDietGeneration|undefined,raw:unknown;
  let generationInput:GenerationInput|undefined;
  const load=(plan:NutritionPlan,instructions:string):GenerationInput=>({...input,source:{...input.source,plan,additionalInstructions:instructions}});
  const preflight=async(plan:NutritionPlan,instructions:string):Promise<WorkshopPreflight>=>{
    const result=getDietGenerationEligibility(load(plan,instructions),{enabled:true,budgetAvailable:true,pending:false}),c=result.context;
    return {eligible:result.eligible,reasons:result.reasons,contextToken:JSON.stringify([plan,input.source.stamp,instructions]),context:{clinical:c.clinical,prescription:c.prescription,
      meals:c.meals.fact.state==='known'?c.meals.fact.value.map(m=>m.display_name):[],restrictions:{reaction_status:c.restrictions.reaction_status,reactions:c.restrictions.reactions},
      preferences:{eating_pattern:c.preferences.eating_pattern,foods:c.preferences.foods},routine:c.routine,professional_instructions:c.professional_instructions}};
  };
  const transport:WorkshopTransport={preflight,status:async()=>null,
    generate:async(plan,instructions,key)=>{
      generationInput=load(plan,instructions);prepared=prepareDietGeneration(generationInput,{enabled:true,budgetAvailable:true,pending:false}).prepared!;
      raw=await new FakeDietGenerator(payload=>{const out=validFakeOutput(payload.payload);if(mode==='needs_adjustment')out.meal_options[0].entries[0].multiplier=1;
        if(mode==='invalid')out.meal_options[0].entries[0].candidate_ref='not-authorized';return out;}).generate({feature:'diet_workshop',idempotencyKey:key,generationId:'hidden-generation',payload:prepared.payload});
      return {generationId:'hidden-generation',validation:validateDietGenerationDraft(raw,prepared,generationInput),hasManualMenu:hasDietMenuContent(plan.diet_menu)};
    },
    decide:async(_proposal,apply,replaceExisting,acceptDifferences)=>{
      if(!apply)return;
      const result=applyDietGenerationDraft(raw,prepared!,generationInput!,{replaceExisting,acceptDifferences});
      if(!result.plan)throw new AIRequestError(result.issues[0].code);
      return result.plan;
    },
  };
  return {input,transport};
}
