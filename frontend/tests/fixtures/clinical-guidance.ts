import {
  emptyObjective,
  type ObjectivePlan,
} from "../../../supabase/functions/_shared/objectives";
import { emptyStrategy } from "../../../supabase/functions/_shared/interventions";
import {
  type SharedObjective,
  sharedObjectiveLabels,
  type SharedStrategy,
  sharedStrategyLabels,
} from "../../../supabase/functions/_shared/clinical-guidance";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "../../src/types/domain";
import type { InterventionItem } from "../../src/services/clinicalInterventions";
export const clinicalFixtureIds = {
  patient: "22222222-2222-4222-8222-222222222222",
  consultation: "33333333-3333-4333-8333-333333333333",
  strategy: "44444444-4444-4444-8444-444444444444",
  owner: "11111111-1111-4111-8111-111111111111",
};
export const clinicalFixtureApprovedAt = "2026-10-20T16:00:00.000Z";
export const clinicalFixtureGoal = {
  ...emptyObjective(),
  outcome: "Organizar los momentos de comida",
  etiology: "Dificultad de organización registrada en la entrevista",
  sign: "Omisión de comidas registrada",
  indicator: "Días con registro",
  baseline: "Un día registrado",
  target: "Completar el registro en cuatro días",
  timeframe: "Revisar en siete días",
  monitoring: "Conversar sobre los registros de la semana",
  feasibility: "Usar el teléfono para llevar el registro",
  agreement: "patient" as const,
};
export const clinicalFixturePlan: ObjectivePlan = {
  version: 1,
  pesApprovedAt: clinicalFixtureApprovedAt,
  goals: [clinicalFixtureGoal],
};
export const clinicalFixtureStrategy = {
  ...emptyStrategy(),
  title: "Organizar una colación práctica",
  action: "Elegir y preparar una opción para los días de jornada larga.",
  method: "Practicar con las opciones disponibles en casa.",
  frequency: "Cuatro días por semana",
  duration: "Dos semanas",
  startDate: "2026-10-21",
  responsible: "Nutrióloga de ejemplo",
  executor: "Paciente",
  adaptations: "Usar una opción que ya tenga disponible.",
  monitoring: "Registrar qué opción pudo preparar.",
  reviewAt: "En catorce días",
  adjustmentCriteria:
    "Revisar las barreras si no fue posible preparar la opción.",
  educationTopic: "Organización de comidas",
  materials: "Guía de opciones acordadas",
  comprehensionCheck: "Explicar con sus palabras cómo lo hará.",
  etiologyLink: "Organización registrada",
  goalIndexes: [0],
  agreement: "patient" as const,
  evidence: [{
    source: "Entrevista · consulta actual",
    finding: "La jornada larga dificulta organizar la comida.",
  }],
  referenceNotes: "Nota clínica interna de ejemplo",
};
export const clinicalFixtureItem: InterventionItem = {
  id: clinicalFixtureIds.strategy,
  draft: null,
  approved: {
    version: 1,
    approvedAt: clinicalFixtureApprovedAt,
    goals: [clinicalFixtureGoal],
    document: {
      version: 1,
      pesApprovedAt: clinicalFixtureApprovedAt,
      objectiveApprovedAt: clinicalFixtureApprovedAt,
      strategy: clinicalFixtureStrategy,
    },
  },
  version: 1,
  updated_at: clinicalFixtureApprovedAt,
  state: "approved",
  requiresReview: false,
  execution: {},
  history: [],
};
export const clinicalFixtureSharedGoal: SharedObjective = {
  ...Object.fromEntries(
    Object.keys(sharedObjectiveLabels).map(
      (k) => [k, clinicalFixtureGoal[k as keyof typeof clinicalFixtureGoal]],
    ),
  ),
  source: {
    consultationId: clinicalFixtureIds.consultation,
    revision: 2,
    approvedAt: clinicalFixtureApprovedAt,
    questionKey: "treatment_objective",
    goalIndex: 0,
  },
} as SharedObjective;
export const clinicalFixtureSharedStrategy: SharedStrategy = {
  ...Object.fromEntries(
    Object.keys(sharedStrategyLabels).map(
      (k) => [
        k,
        clinicalFixtureStrategy[k as keyof typeof clinicalFixtureStrategy],
      ],
    ),
  ),
  route: "not_applicable",
  source: {
    consultationId: clinicalFixtureIds.consultation,
    revision: 2,
    approvedAt: clinicalFixtureApprovedAt,
    strategyId: clinicalFixtureIds.strategy,
    version: 1,
  },
} as SharedStrategy;
export const clinicalFixturePatient = {
  id: clinicalFixtureIds.patient,
  full_name: "Paciente de ejemplo",
  birth_date: "1990-05-12",
} as Patient;
export const clinicalFixtureConsultation = {
  id: clinicalFixtureIds.consultation,
  consultation_type: "follow_up",
  sequence_number: 2,
  consultation_date: "2026-10-20T16:00:00Z",
  status: "completed",
  summary: "Consulta sintética para revisar documentos.",
} as Consultation;
export const clinicalFixtureValues = {
  main_reason: "Organizar las comidas durante la jornada de trabajo.",
  pes_problem: "Omisión de comidas",
  pes_etiology: "Dificultad de organización",
  pes_evidence: "Registro de entrevista",
  pes_statement:
    "Omisión de comidas relacionada con dificultad de organización, evidenciada en el registro de entrevista.",
  treatment_objective:
    "Texto previo del objetivo que se sustituye por el detalle estructurado.",
  first_actions: "Preparar la opción acordada y llevar el registro.",
  next_appointment: "2026-11-03",
};
export const clinicalFixtureSnapshot = {
  id: "55555555-5555-4555-8555-555555555555",
  consultation_id: clinicalFixtureIds.consultation,
  patient_id: clinicalFixtureIds.patient,
  professional_id: clinicalFixtureIds.owner,
  revision: 2,
  template_name: "Seguimiento",
  template_version: 1,
  clinical_records: {
    pes: { approved_at: clinicalFixtureApprovedAt },
    objective_plans: { treatment_objective: clinicalFixturePlan },
    objective: {
      approved_at: clinicalFixtureApprovedAt,
      pes_approved_at: clinicalFixtureApprovedAt,
      question_key: "treatment_objective",
      smart_plan: clinicalFixturePlan,
    },
  },
  structure: {
    consultation_type: "follow_up",
    sections: [{
      section_key: "interview",
      title: "Entrevista",
      questions: [{ question_key: "main_reason", label: "Motivo de consulta" }],
    }, {
      section_key: "clinical",
      title: "Diagnóstico y acuerdos",
      questions: Object.keys(clinicalFixtureValues).filter((k) =>
        k !== "main_reason"
      ).map((k) => ({
        question_key: k,
        label: {
          pes_problem: "Problema",
          pes_etiology: "Etiología",
          pes_evidence: "Evidencia",
          pes_statement: "Enunciado PES",
          treatment_objective: "Objetivo acordado",
          first_actions: "Indicaciones acordadas",
          next_appointment: "Próxima revisión",
        }[k] || k,
      })),
    }].map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({
        ...q,
        question_type: "long_text",
        configuration: {},
        is_required: false,
        response_area: "professional_assessment",
      })),
    })),
  },
} as unknown as ConsultationSnapshot;
