import { supabase } from "@/src/lib/supabase";
import type { RecallSavedItem } from "@/src/features/consultations/clinicalCopilot";
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
