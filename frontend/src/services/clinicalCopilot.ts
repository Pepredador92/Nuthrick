import { supabase } from "@/src/lib/supabase";
import type { PesDraft, RecallSavedItem } from "@/src/features/consultations/clinicalCopilot";
import type { RecallEstimate } from "@/src/features/consultations/recallEstimate";
import type { ClinicalMeasurementFact } from '@/src/features/consultations/clinicalCopilot';
import type { ObjectivePlan } from '../../../supabase/functions/_shared/objectives';
export type SavedRecallRecord = { narrative: string; items: RecallSavedItem[]; approved_at?: string; method?: 'ai_estimate'; estimate?: RecallEstimate };
export async function getClinicalRevision(patientId: string, consultationId: string) {
  const { data, error } = await supabase.from("consultation_snapshots")
    .select("revision").eq("patient_id", patientId).eq("consultation_id", consultationId)
    .order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new Error("No pudimos cargar esta consulta. Intenta nuevamente.");
  return data.revision as number;
}
export type ObjectiveWorkspace = {
  stamp: string;
  plans?: Record<string, ObjectivePlan>;
  facts: ClinicalMeasurementFact[];
  pes: {
    approved_at: string;
    problem: string;
    etiology: string;
    signsSymptoms: string;
    pesStatement: string;
  } | null;
  objective: {
    approved_at: string;
    pes_approved_at?: string;
    question_key: string;
    value: unknown;
    content: string;
    pes_statement: string;
    revision: number;
    smart_plan?: ObjectivePlan;
  } | null;
  target: ClinicalWorkspace["target"];
};
export async function clinicalObjective(
  consultationId: string,
  revision: number,
  action = "read",
  stamp?: string,
  questionKey?: string,
  plan?: ObjectivePlan,
): Promise<ObjectiveWorkspace> {
  const { data, error } = await supabase.rpc("clinical_objective", {
    p_consultation: consultationId,
    p_revision: revision,
    p_action: action,
    p_stamp: stamp ?? null,
    p_question_key: questionKey ?? null,
    p_plan: plan ?? null,
  });
  if (error)
    throw new Error(
        error.message === 'pes_etiology_required'
        ? 'Completa y aprueba una etiología con sustento clínico en el PES. «NA» no sustituye la causa; tus objetivos guardados se conservan.'
        : error.message === 'invalid_request'
        ? 'No pudimos aprobar el formato de estos objetivos. Tus cambios se conservan; vuelve a guardar los objetivos e intenta aprobarlos.'
        : error.message === 'context_unavailable'
        ? 'Esta consulta cambió de revisión o ya está cerrada. Actualiza la consulta para continuar con la versión vigente.'
        : error.message === 'account_read_only' || error.message === 'entitlement_required'
        ? 'Tu acceso actual permite consultar esta revisión. Revisa el acceso de la cuenta para guardar aprobaciones.'
        : error.message === 'objective_plan_required' || error.message === 'objective_smart_required'
        ? 'Completa resultado, relación con el PES, indicador, situación inicial, meta, plazo, seguimiento y viabilidad.'
        : error.message === 'objective_agreement_required'
        ? 'Registra si el objetivo se acordó con el paciente o cuidador.'
        : error.message === 'objective_pes_changed'
        ? 'El PES cambió. Vincula los objetivos al PES actual y revisa sus signos y síntomas.'
        : error.message === 'objective_text_mismatch'
        ? 'El texto guardado no coincide con los objetivos. Guarda los cambios y vuelve a revisar.'
        : error.message === "pes_approval_required"
        ? "Revisa y aprueba el PES antes de aprobar el objetivo."
        : error.message === "context_changed"
          ? "La consulta cambió. Actualiza el contexto antes de aprobar."
          : "No pudimos cargar o guardar la revisión del objetivo. El texto de la entrevista se conserva.",
    );
  return data as ObjectiveWorkspace;
}
export type ClinicalWorkspace = {
  stamp: string;
  target?: {
    energy_kcal: number | null;
    protein_g: number | null;
    carbohydrate_g: number | null;
    fat_g: number | null;
  } | null;
  readiness: {
    interview: boolean;
    objective: boolean;
    anthropometry: boolean;
    laboratories: boolean;
  };
  records: {
    pes?: { approved_at: string } & Partial<Pick<PesDraft, 'evidence' | 'missingContext' | 'uncertainties'>>;
    recall?: SavedRecallRecord;
  };
};
export async function clinicalWorkspace(
  consultationId: string,
  revision: number,
  kind?: "pes" | "recall",
  payload?: unknown,
  generationId?: string,
) {
  const estimate = kind === 'recall' && payload && typeof payload === 'object' && 'method' in payload && payload.method === 'ai_estimate';
  const { data, error } = await supabase.rpc(estimate ? 'clinical_recall_estimate' : "clinical_workspace", estimate ? {
    p_consultation: consultationId, p_revision: revision, p_action: 'approve', p_payload: payload, p_generation: generationId ?? null,
  } : {
    p_consultation: consultationId,
    p_revision: revision,
    p_kind: kind ?? null,
    p_payload: payload ?? null,
    p_generation: generationId ?? null,
  });
  if (error)
    throw new Error(
      error.message === 'pes_etiology_required'
        ? 'Completa la etiología con información clínica. «NA», «No aplica» o «Pendiente» no permiten aprobar el PES; puedes conservar el borrador y continuar la consulta.'
        : error.message === 'pes_statement_mismatch'
        ? 'El enunciado no coincide con P, E y S. Actualiza el enunciado antes de aprobar.'
        : error.message === 'pes_evidence_review_required'
          ? 'Confirma la revisión de P, E y S y de sus fuentes antes de aprobar.'
          : error.message === "context_changed"
        ? "La consulta cambió. Actualiza el contexto y revisa la propuesta antes de aprobar."
        : error.message === "unit_unavailable"
          ? "Revisa la unidad del alimento."
          : "No pudimos guardar o cargar esta revisión clínica. Tus cambios siguen disponibles para revisar.",
    );
  return data as ClinicalWorkspace;
}
export async function removeClinicalRecall(consultationId: string, revision: number, stamp: string) {
  const { error } = await supabase.rpc('clinical_recall_estimate', { p_consultation: consultationId, p_revision: revision, p_action: 'remove', p_payload: { stamp }, p_generation: null });
  if (error) throw new Error(error.message === 'context_changed' ? 'La consulta cambió. Actualiza antes de retirar el recordatorio.' : 'No pudimos retirar el recordatorio de esta consulta.');
}
