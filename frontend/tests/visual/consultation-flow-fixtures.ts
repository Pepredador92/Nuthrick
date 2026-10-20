// Offline fixture for the actual consultation screen. No real patient data or AI calls.
import {
  composeObjective,
  type ObjectivePlan,
} from "../../../supabase/functions/_shared/objectives";
import {
  clinicalObjective as previewObjective,
  reviewFacts,
} from "./clinical-copilot-fixtures";
import { initialInterview } from "../../src/features/consultations/interviewTemplate";
import type { AnswerWrite } from "../../src/features/consultations/answerAutosave";
import { withWorkflowSections } from "../../src/features/consultations/consultationWorkflow";
export * from "../../src/services/consultations";
export * from "../../src/services/patients";
export * from "./clinical-copilot-fixtures";
const followUp = location.search.includes("follow-up");
const consultation = {
  id: "demo",
  patient_id: "patient",
  professional_id: "owner",
  consultation_type: followUp ? "follow_up" : "initial",
  status: "draft",
  consultation_date: "2026-10-12T12:00:00Z",
  sequence_number: 0,
};
const snapshot = {
  id: "snapshot",
  consultation_id: "demo",
  patient_id: "patient",
  revision: 1,
  template_id: "template",
  template_version: 3,
  template_name: followUp ? "Entrevista de seguimiento" : "Entrevista inicial",
  structure: withWorkflowSections(
    followUp
      ? {
        consultation_type: "follow_up",
        sections: [{
          section_key: "progress",
          title: "Cambios desde la última consulta",
          questions: [{
            question_key: "changes_since_last",
            label: "¿Qué ha cambiado?",
            question_type: "long_text",
            response_area: "patient_reported",
            is_required: false,
            configuration: {},
          }],
        }],
      }
      : initialInterview,
  ),
};
const template = {
  template: {
    id: "template",
    name: snapshot.template_name,
    version: 3,
    consultation_type: consultation.consultation_type,
    is_system: true,
  },
  sections: [],
  questions: [],
};
export const getPatient = async () => ({
  id: "patient",
  full_name: "Paciente de demostración",
  timezone: "America/Mexico_City",
});
let discarded = false;
const designPreview = location.search.includes("clinical-design");
const pesParts = {
  pes_problem: "Patrón de comidas inconsistente",
  pes_etiology:
    "Dificultad para organizar las comidas durante la jornada laboral",
  pes_evidence: "Omisión de la comida referida en los días de trabajo",
  pes_statement:
    "Patrón de comidas inconsistente relacionado con dificultad para organizar las comidas durante la jornada laboral, evidenciado por omisión de la comida referida en los días de trabajo.",
};
const previewPlan: ObjectivePlan = {
  version: 1,
  pesApprovedAt: "2026-10-19T12:00:00Z",
  goals: [{
    outcome: "Organizar las comidas durante la jornada laboral",
    etiology: pesParts.pes_etiology,
    sign: pesParts.pes_evidence,
    indicator: "Comidas realizadas durante los días laborales",
    baseline: "La persona refiere omitir la comida durante su jornada",
    target: "",
    timeframe: "",
    monitoring: "Registro de comidas para revisar en seguimiento",
    feasibility: "",
    agreement: "pending",
  }],
};
const objectiveKey = followUp ? "next_objectives" : "treatment_objective";
const seededAnswers = {
  main_reason: "Mejorar hábitos",
  expectations: ["Organizar comidas"],
  interview_notes:
    "La persona desea encontrar opciones compatibles con su horario laboral. Datos ficticios de demostración.",
  ...pesParts,
  [objectiveKey]: composeObjective(previewPlan.goals[0]),
};
if (designPreview && !localStorage.getItem("qa-design-seeded")) {
  localStorage.setItem(
    "qa-clinical-records",
    JSON.stringify({
      pes: {
        approved_at: previewPlan.pesApprovedAt,
        problem: pesParts.pes_problem,
        etiology: pesParts.pes_etiology,
        signsSymptoms: [pesParts.pes_evidence],
        pesStatement: pesParts.pes_statement,
      },
      recall: {
        narrative: "Desayuno y comida de demostración.",
        approved_at: "2026-10-19T11:50:00Z",
        method: "ai_estimate",
        items: [],
        estimate: {
          confidence: "low",
          assumptions: ["Porciones de demostración."],
          uncertainties: [],
          meals: [{
            mealLabel: "Desayuno",
            description: "Ejemplo de un desayuno registrado.",
            energy_kcal: 500,
            protein_g: 20,
            carbohydrate_g: 60,
            fat_g: 20,
          }],
        },
      },
    }),
  );
  localStorage.setItem(
    "qa-objective-plans",
    JSON.stringify({ [objectiveKey]: previewPlan }),
  );
  localStorage.setItem("qa-pes-parts", JSON.stringify(seededAnswers));
  localStorage.setItem("qa-design-answers", JSON.stringify(seededAnswers));
  localStorage.setItem("qa-design-seeded", "true");
}
let answers: Record<string, unknown> = designPreview
  ? JSON.parse(
    localStorage.getItem("qa-design-answers") || JSON.stringify(seededAnswers),
  )
  : {};
export async function clinicalObjective(
  ...args: Parameters<typeof previewObjective>
) {
  const workspace = await previewObjective(...args);
  return { ...workspace, facts: [...workspace.facts, ...reviewFacts] };
}
export const listConsultations = async () => discarded ? [] : [consultation];
export const discardConsultationDraft = async () => {
  discarded = true;
  answers = {};
};
export const beginConsultation = async () => {
  discarded = false;
  return consultation;
};
export const updateConsultationDate = async (_id: string, date: string) => ({
  ...consultation,
  consultation_date: date + "T12:00:00Z",
});
export const loadActiveTemplate = async () => template;
export const ensureSnapshot = async () => snapshot;
export const listAvailableTemplates = async () => [template];
export const getSnapshot = async () => snapshot;
export const prepareConsultationWorkflow = async () => snapshot;
export const loadTemplateById = async () => template;
export const loadSystemTemplate = async () => template;
export const saveAnswers = async (
  _consultation: unknown,
  _snapshot: unknown,
  values: Record<string, unknown>,
) => {
  answers = structuredClone(values);
};
export const listAnswers = async () =>
  Object.entries(answers).map(([question_key, value]) => ({
    question_key,
    value,
  }));
export const useAccess = () => ({ data: null });

let answerVersion = 0;
export const syncConsultationAnswers = async (
  _id: string,
  _revision: number,
  request?: AnswerWrite,
) => {
  if (request) {
    if (request.version !== answerVersion) {
      return {
        version: answerVersion,
        answers: structuredClone(answers),
        conflict: true,
      };
    }
    answers = { ...answers, ...structuredClone(request.changes) };
    if (designPreview) {
      localStorage.setItem("qa-design-answers", JSON.stringify(answers));
    }
    answerVersion += 1;
    localStorage.setItem("qa-pes-parts", JSON.stringify(answers));
    const goal = answers.treatment_objective ?? answers.next_objectives ??
      answers.objectives;
    localStorage.setItem("qa-goal-text", typeof goal === "string" ? goal : "");
  }
  return { version: answerVersion, answers: structuredClone(answers) };
};
