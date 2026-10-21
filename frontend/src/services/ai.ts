import type {TextDietGuidance} from '../../../supabase/functions/_shared/text-diet';
import type { DietGuidance } from '../../../supabase/functions/_shared/diet-guidance';
import { supabase } from '@/src/lib/supabase';

export type AIBalance = { available_credits: number; reserved_credits: number };
export type AIState = 'idle' | 'generating' | 'ready' | 'error' | 'insufficient' | 'uncertain';
export const aiMessages: Record<string,string> = {
  input_too_large: 'El expediente supera la capacidad técnica del modelo de IA. No se cobró esta solicitud. Contacta a soporte; puedes continuar la consulta manualmente.',
  input_count_unavailable: 'No pudimos comprobar el tamaño del contexto. No se generó una propuesta ni se cobró esta solicitud. Puedes reintentar o continuar manualmente.',
  context_unavailable: 'La consulta cambió o ya no está disponible para esta solicitud. Guarda los cambios y actualiza la página. Puedes continuar manualmente.',
  instruction_agreements_required: 'Esta consulta no tiene objetivos o acciones registrados para redactar indicaciones. Puedes escribirlas manualmente.',
  pes_approval_required: 'Revisa y aprueba el PES antes de pedir objetivos vinculados al diagnóstico.',
  pes_etiology_required: 'El PES no tiene una etiología con información clínica: «NA» o «No aplica» no son suficientes. Confirma la causa, completa y aprueba el PES antes de generar objetivos. No se consumieron créditos en esta solicitud.',
  pes_signs_required: 'Completa los signos y síntomas del PES antes de generar objetivos. No se consumieron créditos en esta solicitud.',
  objective_output_empty_refunded: 'La IA no encontró base suficiente para proponer objetivos. Los créditos de este intento se reintegraron. Revisa la causa y los signos del PES, completa los acuerdos o redacta los objetivos manualmente.',
  objective_output_invalid_refunded: 'No pudimos entregar objetivos válidos. Los créditos de este intento se reintegraron y tu consulta se conserva. Puedes continuar manualmente o reintentar.',
  objective_output_refunded: 'Esta solicitud no entregó objetivos utilizables. Los créditos se reintegraron. Revisa el PES antes de volver a generar.',
  objective_output_refund_pending: 'No pudimos entregar objetivos. El reintegro de créditos está pendiente de comprobación. No repitas la solicitud; puedes continuar manualmente y contactar a soporte.',
  strategy_planning_required: 'Para proponer estrategias necesitas un PES aprobado y al menos un objetivo guardado, que puede estar en borrador. También puedes escribir estrategias manuales o continuar sin ellas.',
  strategy_approvals_required: 'Revisa y aprueba el PES y los objetivos SMART antes de proponer estrategias.',
  strategy_approval_required: 'Revisa y aprueba una estrategia vigente antes de generar indicaciones.',
  insufficient_credits: 'No tienes saldo disponible suficiente para esta solicitud. Recarga créditos de IA para continuar.',
  feature_disabled: 'Esta función de IA aún no está habilitada.',
  pilot_limit_reached: 'Se alcanzó el límite de uso de esta función.',
  pilot_daily_limit: 'Alcanzaste el límite diario de generaciones. Intenta mañana.',
  pilot_daily_budget: 'Alcanzaste el límite diario de consumo de IA. Intenta mañana.',
  feature_not_implemented: 'Esta función estará disponible en una próxima iteración.',
  provider_outcome_unknown: 'La solicitud está pendiente de revisión. No la vuelvas a generar para evitar un consumo duplicado.',
  service_unavailable: 'No pudimos verificar el resultado. Consulta su estado antes de volver a generar.',
  invalid_output: 'La respuesta no pasó la validación. No se modificó el expediente.',
  invalid_output_refunded: 'No pudimos obtener un PES válido. Los créditos de este intento se reintegraron y el expediente se conserva. Puedes reintentar o redactarlo manualmente.',
  invalid_output_refund_pending: 'No pudimos obtener un PES válido. El reintegro de los créditos está pendiente de comprobación. Puedes continuar manualmente; contacta a soporte.',
  provider_credit_exhausted: 'La IA no está disponible temporalmente. Contacta a soporte.',
  ai_consent_required: 'Antes de usar IA, revisa y acepta el aviso de tratamiento de datos.',
  ai_consent_unavailable: 'No pudimos verificar tu autorización para usar IA. Intenta de nuevo.',
};
export async function getAIBalance(): Promise<AIBalance> {
  const { data, error } = await supabase.rpc('ai_balance');
  if (error || !data || !Number.isFinite(Number(data.available_credits)) || !Number.isFinite(Number(data.reserved_credits))) throw new Error('No se pudo consultar el saldo de IA.');
  return { available_credits: Number(data.available_credits), reserved_credits: Number(data.reserved_credits) };
}
export class AIRequestError extends Error {
  constructor(public code: string) { super(aiMessages[code] ?? 'No se pudo generar. Inténtalo más tarde.'); }
}
export async function getAIGenerationStatus(idempotencyKey: string) {
  const { data, error } = await supabase.rpc('ai_generation_status',{ p_key: idempotencyKey });
  if (error) throw new AIRequestError('service_unavailable');
  return data as { generationId: string; status: string; chargedCredits: number; errorCode: string | null } | null;
}
// Reuse the same key when checking/retrying a logical request. Never supply owner/model/prompt/prices.
export async function runAIRequest(request: { objectiveTextStyle?: 'patient_v1'; strategyFeedback?: string; textGuidance?:TextDietGuidance; guidance?: DietGuidance; feature: string; idempotencyKey: string; patientId?: string; consultationId?: string; revision?: number; narrative?: string; planId?: string; previousProposalId?: string; rejectedItems?: string[]; rejectedFoodIds?: string[]; rejectedSignatures?: string[] }): Promise<{ generationId: string; status: string; output?: unknown; replay: boolean; draftSaved?:boolean }> {
  try {
    const consent = await supabase.rpc('my_ai_processing_consent');
    if (consent.error || !consent.data) throw new AIRequestError('ai_consent_unavailable');
    if (consent.data.eligible && !consent.data.accepted) {
      window.dispatchEvent(new Event('nuthrick:ai-consent-manage'));
      throw new AIRequestError('ai_consent_required');
    }
    const { data, error } = await supabase.functions.invoke('ai',{ body: request });
    if (error) {
      let code = 'service_unavailable';
      try { const body = await error.context?.json(); if (typeof body?.error === 'string') code = body.error; } catch { /* No raw server messages. */ }
      throw new AIRequestError(code);
    }
    if (data?.error) throw new AIRequestError(data.error);
    if (!data?.generationId || !data?.status) throw new AIRequestError('service_unavailable');
    return data;
  } finally {
    // Invalid output can consume tokens; uncertain requests can retain credits too.
    window.dispatchEvent(new Event('nuthrick:ai-balance'));
  }
}
