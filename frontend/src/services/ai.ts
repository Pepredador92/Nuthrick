import { supabase } from '@/src/lib/supabase';

export type AIBalance = { available_credits: number; reserved_credits: number };
export type AIState = 'idle' | 'generating' | 'ready' | 'error' | 'insufficient' | 'uncertain';
export const aiMessages: Record<string,string> = {
  insufficient_credits: 'Ya utilizaste los créditos de IA incluidos en tu plan.',
  feature_disabled: 'Esta función de IA aún no está habilitada.',
  feature_not_implemented: 'Esta función estará disponible en una próxima iteración.',
  provider_outcome_unknown: 'La solicitud está pendiente de revisión. No la vuelvas a generar para evitar un consumo duplicado.',
  service_unavailable: 'No pudimos verificar el resultado. Consulta su estado antes de volver a generar.',
  invalid_output: 'La respuesta no pasó la validación. No se modificó el expediente.',
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
export async function runAIRequest(request: { feature: string; idempotencyKey: string; patientId?: string; consultationId?: string; revision?: number; narrative?: string; planId?: string; rejectedFoodIds?: string[]; rejectedSignatures?: string[] }): Promise<{ generationId: string; status: string; output?: unknown; replay: boolean }> {
  try {
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
