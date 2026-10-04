import {supabase} from '@/src/lib/supabase';
import {AIRequestError,getAIGenerationStatus,runAIRequest} from './ai';
import {isTextDiet,type TextDiet,type TextDietGuidance} from '../../../supabase/functions/_shared/text-diet';
import type {NutritionPlan} from '@/src/types/domain';
import type {DietGenerationContext} from '@/src/features/diet-workshop/generationContext';
export type TextDietPreflight={eligible:boolean;contextToken:string;reasons:Array<{code:string}>;context:{clinical:DietGenerationContext['clinical'];prescription:DietGenerationContext['prescription'];restrictions:Pick<DietGenerationContext['restrictions'],'reaction_status'|'reactions'>;preferences:Pick<DietGenerationContext['preferences'],'eating_pattern'|'foods'>}};
export type TextDietProposal={generationId:string;textDraft:TextDiet};
const fields=(p:NutritionPlan,g:TextDietGuidance,n:string)=>({feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:p.id,patientId:p.patient_id??undefined,consultationId:p.consultation_id??undefined,revision:p.draft_revision??1,textGuidance:g,narrative:n});
async function invoke(body:Record<string,unknown>) {
  const {data,error}=await supabase.functions.invoke('ai',{body});
  if(error){let code='service_unavailable';try{const result=await error.context?.json();if(typeof result?.error==='string')code=result.error;}catch{/* no raw error */}throw new AIRequestError(code);}
  if(!data||data.error)throw new AIRequestError(data?.error??'service_unavailable');return data;
}
export const textDietTransport={
  async preflight(p:NutritionPlan,g:TextDietGuidance,n:string):Promise<TextDietPreflight>{return invoke({...fields(p,g,n),action:'text_diet_preflight'});},
  async generate(p:NutritionPlan,g:TextDietGuidance,n:string,key:string):Promise<TextDietProposal>{
    const r=await runAIRequest({...fields(p,g,n),idempotencyKey:key});
    if(r.status!=='succeeded')throw new AIRequestError('provider_outcome_unknown');
    const draft=(r.output as {textDraft?:unknown})?.textDraft;
    if(!draft)return this.recover(r.generationId);
    if(!isTextDiet(draft))throw new AIRequestError('invalid_output');return {generationId:r.generationId,textDraft:draft};
  },
  async recover(generationId:string):Promise<TextDietProposal>{const r=await invoke({action:'text_diet_result',generationId});if(!isTextDiet(r.textDraft))throw new AIRequestError('invalid_output');return r;},
  status:getAIGenerationStatus,
  async apply(generationId:string,replaceExisting:boolean):Promise<NutritionPlan>{const r=await invoke({action:'apply_text_diet',generationId,replaceExisting});if(!r.ok||!isTextDiet(r.plan?.text_diet))throw new AIRequestError('draft_save_failed');return r.plan;},
  async discard(generationId:string){await invoke({action:'discard_text_diet',generationId});},
};
export type TextDietTransport=typeof textDietTransport;
