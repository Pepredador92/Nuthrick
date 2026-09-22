import { supabase } from "@/src/lib/supabase";
import type { RecallSavedItem } from "@/src/features/consultations/clinicalCopilot";
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
    recall?: {
      narrative: string;
      items: RecallSavedItem[];
      approved_at: string;
    };
  };
};
export async function clinicalWorkspace(
  consultationId: string,
  revision: number,
  kind?: "pes" | "recall",
  payload?: unknown,
  generationId?: string,
) {
  const { data, error } = await supabase.rpc("clinical_workspace", {
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
