import { supabase } from '@/src/lib/supabase';
import type { NutritionPlan } from '@/src/types/domain';
export type WorkshopPreview = {
  payload: string; signature: string; menuSignature: string; summary: string; warnings: string[]; assumptions: string[]; goal: string | null;
  patch: Required<Pick<NutritionPlan,'exchange_prescription'|'meal_distribution'|'diet_menu'>>;
};
export async function workshopAIStatus(planId: string) {
  try {
  const {data,error}=await supabase.rpc('ai_workshop_status',{p_plan:planId});
  if(error) return {enabled:false};
  return {enabled:data?.enabled===true};
  } catch { return {enabled:false}; }
}
export async function decideWorkshop(preview: WorkshopPreview, apply: boolean): Promise<NutritionPlan> {
  const {data,error}=await supabase.functions.invoke('ai',{body:{action:apply?'apply_workshop':'discard_workshop',payload:preview.payload,signature:preview.signature}});
  if(error||!data?.ok) throw new Error('La propuesta venció o el contexto cambió. El borrador sigue intacto; genera una propuesta nueva.');
  return data.plan;
}
