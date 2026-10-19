import type { ObjectiveWorkspace } from "@/src/services/clinicalCopilot";
import {
  composeObjective,
  type ObjectivePlan,
} from "../../../supabase/functions/_shared/objectives";
export const approvedPes = {
  approved_at: "2026-10-18T12:00:00Z",
  problem: "Ingesta insuficiente",
  etiology: "Dificultad para organizar las comidas",
  signsSymptoms: "Registro dietético de la consulta",
  pesStatement:
    "Ingesta insuficiente relacionado con dificultad para organizar las comidas, evidenciado por registro dietético de la consulta.",
};
export const smartPlan = (): ObjectivePlan => ({
  version: 1,
  pesApprovedAt: approvedPes.approved_at,
  goals: [{
    outcome: "Organizar las comidas durante la jornada laboral",
    etiology: approvedPes.etiology,
    sign: approvedPes.signsSymptoms,
    indicator: "Comidas registradas",
    baseline: "Registro de la consulta inicial",
    target: "Realizar las comidas acordadas",
    timeframe: "Próxima consulta",
    monitoring: "Registro de comidas para revisar en seguimiento",
    feasibility: "Preparaciones disponibles según horario y presupuesto",
    agreement: "patient",
  }],
});
export const objectiveWorkspace = (
  plan?: ObjectivePlan,
  approved = false,
): ObjectiveWorkspace => ({
  stamp: "current",
  facts: [{
    source: "Entrevista · access barriers",
    finding: "Horario laboral variable",
  }],
  pes: structuredClone(approvedPes),
  plans: plan ? { treatment_objective: structuredClone(plan) } : {},
  objective: approved && plan
    ? {
      approved_at: "2026-10-18T12:10:00Z",
      question_key: "treatment_objective",
      value: plan.goals.map(composeObjective).join("\n\n"),
      content: plan.goals.map(composeObjective).join("\n\n"),
      pes_statement: approvedPes.pesStatement,
      revision: 1,
      smart_plan: structuredClone(plan),
    }
    : null,
  target: {
    energy_kcal: 2100,
    protein_g: 100,
    carbohydrate_g: null,
    fat_g: null,
  },
});
