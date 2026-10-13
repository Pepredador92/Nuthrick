import { supabase } from "@/src/lib/supabase";
import type { RecallSavedItem } from "@/src/features/consultations/clinicalCopilot";
import type { RecallEstimate } from "@/src/features/consultations/recallEstimate";
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
  facts: { source: string; finding: string }[];
  pes: {
    approved_at: string;
    problem: string;
    etiology: string;
    signsSymptoms: string;
    pesStatement: string;
  } | null;
  objective: {
    approved_at: string;
    question_key: string;
    value: unknown;
    content: string;
    pes_statement: string;
    revision: number;
  } | null;
  target: ClinicalWorkspace["target"];
};
export async function clinicalObjective(
  consultationId: string,
  revision: number,
  action = "read",
  stamp?: string,
  questionKey?: string,
): Promise<ObjectiveWorkspace> {
  const { data, error } = await supabase.rpc("clinical_objective", {
    p_consultation: consultationId,
    p_revision: revision,
    p_action: action,
    p_stamp: stamp ?? null,
    p_question_key: questionKey ?? null,
  });
  if (error)
    throw new Error(
      error.message === "pes_approval_required"
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
    pes?: { approved_at: string };
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
      error.message === "context_changed"
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
