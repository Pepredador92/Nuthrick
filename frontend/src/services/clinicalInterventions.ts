import { supabase } from "@/src/lib/supabase";
import { accessMessages } from "@/src/features/admin/api";
import type { ObjectiveGoal } from "../../../supabase/functions/_shared/objectives";
import type { StrategyDocument } from "../../../supabase/functions/_shared/interventions";
import type { ObjectiveWorkspace } from "./clinicalCopilot";
export type InterventionItem = {
  id: string;
  draft: StrategyDocument | null;
  approved: {
    document: StrategyDocument;
    version: number;
    approvedAt: string;
    goals: ObjectiveGoal[];
  } | null;
  version: number;
  updated_at: string;
  state: "draft" | "approved" | "executing" | "completed" | "withdrawn";
  requiresReview: boolean;
  execution: {
    executor?: string;
    startDate?: string;
    communication?: { recipient: string; recordedAt: string };
  };
  history: {
    id: string;
    action: string;
    version: number;
    recorded_at: string;
    payload: Record<string, unknown>;
  }[];
};
export type InterventionWorkspace = {
  archived?: boolean;
  stamp: string;
  pes: ObjectiveWorkspace["pes"];
  objective: ObjectiveWorkspace["objective"];
  items: InterventionItem[];
  facts: ObjectiveWorkspace["facts"];
};
export type InterventionAction =
  | "read"
  | "save"
  | "approve"
  | "delete"
  | "revert"
  | "start"
  | "communicate"
  | "complete"
  | "withdraw";
export async function clinicalInterventions(
  consultationId: string,
  revision: number,
  action: InterventionAction = "read",
  data: Record<string, unknown> = {},
): Promise<InterventionWorkspace> {
  const result = await supabase.rpc("clinical_interventions", {
    p_consultation: consultationId,
    p_revision: revision,
    p_action: action,
    p_data: data,
  });
  if (result.error) {
    const messages: Record<string, string> = {
      account_read_only:
        "La cuenta permite consultar el historial; recupera el acceso de escritura para modificar la estrategia.",
      entitlement_required:
        "Tu acceso actual no permite esta acción en consultas.",
      strategy_changed:
        "Esta estrategia cambió en otra sesión. Actualiza el contexto antes de guardar.",
      strategy_context_changed:
        "El PES o los objetivos cambiaron. Revisa la estrategia y vuelve a vincularla antes de aprobar o registrar su ejecución.",
      strategy_approvals_required:
        "Revisa y aprueba el PES y los objetivos SMART antes de aprobar una estrategia.",
      strategy_incomplete:
        "Completa los campos de la estrategia y vincula al menos un objetivo.",
      strategy_agreement_required:
        "Registra el acuerdo con el paciente o cuidador.",
      strategy_execution_required:
        "Completa la fecha y el responsable de ejecución, el destinatario o el motivo de cierre según la acción.",
      approved_strategy_retire_required:
        "Retira la estrategia aprobada para conservar su historial.",
      generation_unavailable:
        "La propuesta de IA no pertenece a esta consulta o no está disponible.",
      invalid_strategy: "Revisa los campos de la estrategia y sus límites.",
      strategy_limit:
        "Esta revisión admite hasta 30 estrategias, incluidas las retiradas.",
    };
    throw new Error(
      messages[result.error.message] ??
        accessMessages[result.error.message] ??
        "No pudimos cargar o guardar las estrategias. Conserva tus cambios e intenta de nuevo.",
    );
  }
  return result.data as InterventionWorkspace;
}
