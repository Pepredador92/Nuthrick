import type { DietGuidance } from '../../../supabase/functions/_shared/diet-guidance';
import { supabase } from '@/src/lib/supabase';
import { AIRequestError, getAIGenerationStatus, runAIRequest } from './ai';
import type { DietGenerationContext } from '@/src/features/diet-workshop/generationContext';
import type { DietDraftValidation } from '@/src/features/diet-workshop/generationBoundary';
import type { NutritionPlan } from '@/src/types/domain';

export type WorkshopContext = Pick<DietGenerationContext, 'clinical'|'prescription'|'routine'|'professional_instructions'> & {
  meals: string[]; historyRequiresReview?: boolean;
  restrictions: Pick<DietGenerationContext['restrictions'], 'reaction_status'|'reactions'>;
  preferences: Pick<DietGenerationContext['preferences'], 'eating_pattern'|'foods'>;
};
export type WorkshopPreflight = {eligible:boolean; reasons:Array<{code:string}>; contextToken?:string; context?:WorkshopContext};
export type WorkshopProposal = {generationId:string; validation:DietDraftValidation; hasManualMenu:boolean};
export type WorkshopTransport = {
  preflight(plan:NutritionPlan, instructions:string, guidance?:DietGuidance):Promise<WorkshopPreflight>;
  generate(plan:NutritionPlan, instructions:string, key:string, guidance?:DietGuidance):Promise<WorkshopProposal>;
  decide(proposal:WorkshopProposal, apply:boolean, replaceExisting:boolean, acceptDifferences:boolean):Promise<NutritionPlan|undefined>;
  recover?(generationId:string):Promise<WorkshopProposal>;
  status:typeof getAIGenerationStatus;
};
const previousByPlan=new Map<string,{revision:number;generationId:string}>();
const planByGeneration=new Map<string,{id:string;revision:number}>();
const fields = (plan:NutritionPlan, instructions:string, key:string, guidance?:DietGuidance) => ({feature:'diet_draft',idempotencyKey:key,planId:plan.id,revision:plan.draft_revision ?? 1,
  ...(plan.patient_id ? {patientId:plan.patient_id} : {}), ...(plan.consultation_id ? {consultationId:plan.consultation_id} : {}), narrative:instructions,...(guidance?{guidance}:{})});

async function invoke(body:Record<string,unknown>) {
  const {data,error}=await supabase.functions.invoke('ai',{body});
  if(error) {
    let code='service_unavailable';
    try {const parsed=await error.context?.json();if(typeof parsed?.error==='string')code=parsed.error;} catch { /* Do not expose raw errors. */ }
    throw new AIRequestError(code);
  }
  if(data?.error)throw new AIRequestError(data.error);
  if(!data)throw new AIRequestError('service_unavailable');
  return data;
}
export const workshopTransport:WorkshopTransport = {
  preflight: async(plan,instructions,guidance) => invoke({action:'diet_preflight',...fields(plan,instructions,crypto.randomUUID(),guidance)}),
  generate: async(plan,instructions,key,guidance) => {
    let result:Awaited<ReturnType<typeof runAIRequest>>;
    const previous=previousByPlan.get(plan.id);
    try {result=await runAIRequest({...fields(plan,instructions,key,guidance),...(!guidance && previous?.revision===(plan.draft_revision??1)?{previousProposalId:previous.generationId}:{})});} catch(e) {
      if(e instanceof AIRequestError && e.code==='invalid_output')return {generationId:'',hasManualMenu:false,validation:{status:'invalid',issues:[{code:'invalid_output',path:'output'}]}};
      throw e;
    }
    if(result.status==='invalid_output') return {generationId:result.generationId,hasManualMenu:false,
      validation:{status:'invalid',issues:[{code:'invalid_output',path:'output'}]}};
    const output=result.output as {validation?:DietDraftValidation;hasManualMenu?:boolean}|undefined;
    if(!output?.validation)throw new AIRequestError('provider_outcome_unknown');
    planByGeneration.set(result.generationId,{id:plan.id,revision:plan.draft_revision??1});
    return {generationId:result.generationId,validation:output.validation,hasManualMenu:output.hasManualMenu===true};
  },
  decide: async(proposal,apply,replaceExisting,acceptDifferences) => {
    if(!apply && proposal.validation.status==='invalid')return;
    const data=await invoke({action:apply?'apply_diet_draft':'discard_diet_draft',generationId:proposal.generationId,replaceExisting,acceptDifferences});
    if(!data.ok || (apply && (!data.plan || data.plan.status!=='draft')))throw new AIRequestError('service_unavailable');
    const plan=planByGeneration.get(proposal.generationId);
    if(plan){if(apply)previousByPlan.delete(plan.id);else previousByPlan.set(plan.id,{revision:plan.revision,generationId:proposal.generationId});planByGeneration.delete(proposal.generationId);}
    return data.plan;
  },
  recover:async(generationId)=>invoke({action:'diet_result',generationId}),
  status:getAIGenerationStatus,
};
