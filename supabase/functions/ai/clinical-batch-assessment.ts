import type { ClinicalBatchFeature } from "../_shared/clinical-batch.ts";
import {
  emptyStrategy,
  type StrategyDocument,
} from "../_shared/interventions.ts";
import { emptyObjective, type ObjectiveGoal } from "../_shared/objectives.ts";
import { PATIENT_INSTRUCTION_MAX_LENGTH } from "../_shared/patient-instructions.ts";
import {
  buildPesClinicalContext,
  clinicalFactTiming,
  type ClinicalSource,
  redactClinicalText,
} from "./clinical.ts";
import type { BatchStages } from "./clinical-batch.ts";

type Visit = "initial" | "follow_up";
type AssessmentFeature = Exclude<ClinicalBatchFeature, "pes_diagnosis">;

const field = (maxLength: number) => ({ type: "string", maxLength });
const properties = {
  title: field(200),
  action: field(PATIENT_INSTRUCTION_MAX_LENGTH),
  indicator: field(400),
  criterion: field(400),
  monitoring: field(400),
  goalIndex: { type: "integer", minimum: 0, maximum: 2 },
  evidenceFactIds: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { type: "string", pattern: "^f[1-9][0-9]*$" },
  },
};
export const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
    },
  },
};

type AssessmentItem = {
  title: string;
  action: string;
  indicator: string;
  criterion: string;
  monitoring: string;
  goalIndex: number;
  evidenceFactIds: string[];
};

const assessmentTasks: Record<AssessmentFeature, string> = {
  consultation_support:
    "Propón objetivos de observación. Escribe en action qué podrá observar o registrar la persona (máximo 400 caracteres), en indicator qué se revisará, en criterion qué anotaciones servirán para revisarlo, y en monitoring cómo hacerlo. Usa goalIndex=0.",
  intervention_strategy:
    "Propón acciones de acompañamiento para los objetivos de la lista. Vincula cada acción al índice de un objetivo real en goalIndex. En title pon un nombre breve y en action explica cómo realizarla. Usa monitoring para explicar qué se revisará.",
  patient_instructions:
    "Redacta en action una instrucción clara que ayude a realizar alguna acción del borrador. Habla directamente con la persona de tú, con palabras de uso diario y oraciones completas. Usa goalIndex=0.",
};

export function assessmentInstructions(feature: AssessmentFeature) {
  return `Genera borradores de valoración nutricional para revisión del profesional. ${
    assessmentTasks[feature]
  }
Solo se permiten acciones de observación, registro, conversación o verificación. Evita diagnósticos, causas atribuidas, prescripciones, dosis, metas de peso, cantidades de ingesta, restricciones o pautas de actividad.
Personaliza lo que conviene observar o confirmar a partir de facts y cita sus IDs exactos en evidenceFactIds. Revisa primero las notas de la consulta actual, aunque falte la entrevista. Usa la historia como antecedente fechado y confirma vigencia. Los borradores de etapas previas orientan el plan, pero jamás son fuentes de hechos clínicos. Si objectives o strategies son generales, todavía puedes utilizar hechos actuales para adaptar esta etapa sin cambiar lo que la persona debe observar. No inventes duración, frecuencia, disponibilidad ni acuerdos. En los campos de texto ajenos a esta etapa usa la cadena vacía. Devuelve items vacío si falta evidencia pertinente para personalizar.`;
}

export function buildBatchAssessment(
  source: ClinicalSource,
  visit: Visit,
  stages: BatchStages,
) {
  const facts = buildPesClinicalContext(source).facts
    .filter((fact) =>
      clinicalFactTiming(fact) !== "plan" &&
      !fact.source.startsWith("PES previo aprobado · ")
    )
    .map((fact, index) => ({ ...fact, id: `f${index + 1}` }));
  const pes = stages.pes_diagnosis?.output;
  const objectives = (stages.consultation_support?.output.objectives ?? []) as {
    goal: ObjectiveGoal;
  }[];
  const strategies = (stages.intervention_strategy?.output.strategies ??
    []) as StrategyDocument[];
  const clean = (value: unknown) =>
    typeof value === "string"
      ? redactClinicalText(value, source.identifiers)
      : "";
  return {
    consultationType: visit,
    facts,
    priorDrafts: {
      problem: clean(pes?.problem),
      signs: Array.isArray(pes?.signsSymptoms)
        ? pes.signsSymptoms.map(clean)
        : [],
      objectives: objectives.map(({ goal }, index) => ({
        index,
        outcome: clean(goal?.outcome),
        monitoring: clean(goal?.monitoring),
      })),
      strategies: strategies.map(({ strategy }) => ({
        title: clean(strategy?.title),
        action: clean(strategy?.action),
      })),
    },
    pesGeneration: stages.pes_diagnosis?.generationId,
    objectiveGeneration: stages.consultation_support?.generationId,
  };
}

export type BatchAssessment = ReturnType<typeof buildBatchAssessment>;
const templates = {
  initial: {
    goal: "Identifica cómo suele ser tu alimentación en un día normal.",
    indicator: "Comidas y horarios anotados.",
    criterion:
      "Traer un ejemplo de lo que comiste y bebiste en un día habitual.",
    monitoring:
      "Anota los horarios aproximados y qué se te hizo fácil o difícil.",
    strategy: "Conocer tu rutina de comidas",
    action:
      "Elige un día habitual y anota qué comes y bebes y a qué hora. Si algo cambia tu rutina, anótalo también.",
    question:
      "¿Qué te gustaría revisar de tu alimentación y cómo es un día habitual para ti?",
  },
  follow_up: {
    goal:
      "Identifica qué cambió en tu alimentación desde la consulta anterior.",
    indicator: "Cambios, dificultades y acciones que pudiste realizar.",
    criterion:
      "Traer un ejemplo de algo que pudiste hacer o que te costó desde la visita anterior.",
    monitoring: "Anota qué intentaste y qué te ayudó o te dificultó hacerlo.",
    strategy: "Revisar cómo te fue desde la última consulta",
    action:
      "Piensa en lo que intentaste desde la última consulta y anota un ejemplo de qué te funcionó o qué te costó. Si hubo algún cambio en tu rutina, anótalo.",
    question:
      "¿Qué cambió desde la visita anterior y qué te ayudó o dificultó poner en práctica lo conversado?",
  },
};

export function batchDraft(
  feature: ClinicalBatchFeature,
  context: BatchAssessment,
  generationId: string,
  output?: { items: AssessmentItem[] },
) {
  const template = templates[context.consultationType];
  if (feature === "pes_diagnosis") {
    return {
      batchBasis: "template",
      problem: "",
      etiology: "",
      signsSymptoms: [],
      pesStatement: "",
      evidence: [],
      missingContext: [
        template.question,
        "¿Qué datos pueden confirmar el problema y su posible causa?",
      ],
      uncertainties: [
        "Falta información para formular un diagnóstico nutricional.",
      ],
    };
  }
  const byId = new Map(context.facts.map((fact) => [fact.id, fact]));
  const contextual = (output?.items ?? []).flatMap((item) => {
    const evidence = [...new Set(item.evidenceFactIds)].flatMap((id) => {
      const fact = byId.get(id);
      return fact && fact.source.length <= 2000 && fact.finding.length <= 4000
        ? [{ source: fact.source, finding: fact.finding }]
        : [];
    });
    if (
      evidence.length !== item.evidenceFactIds.length || !item.action.trim()
    ) return [];
    if (
      feature === "consultation_support" && (item.action.length > 400 ||
        !item.indicator.trim() || !item.criterion.trim() ||
        !item.monitoring.trim())
    ) return [];
    if (
      feature === "intervention_strategy" &&
      (!item.title.trim() || item.action.length > 1500 ||
        item.goalIndex >= context.priorDrafts.objectives.length)
    ) return [];
    if (
      feature === "patient_instructions" &&
      !/[^.\s…][.!?]["»”)]*\s*$/.test(item.action)
    ) return [];
    return [{ item, evidence }];
  });
  const batchBasis = contextual.length ? "assessment" : "template";
  const drafts = contextual.length ? contextual : [{
    item: {
      title: template.strategy,
      action: feature === "consultation_support"
        ? template.goal
        : template.action,
      indicator: template.indicator,
      criterion: template.criterion,
      monitoring: template.monitoring,
      goalIndex: 0,
    },
    evidence: [],
  }];
  if (feature === "consultation_support") {
    return {
      batchBasis,
      objectives: drafts.map(({ item, evidence }) => ({
        goal: {
          ...emptyObjective(),
          outcome: item.action,
          indicator: item.indicator,
          target: item.criterion,
          monitoring: item.monitoring,
          timeframe: "En la próxima consulta",
          textStyle: "patient_v1",
          targetOrigin: "proposed",
          timeframeOrigin: "proposed",
        },
        evidence,
      })),
    };
  }
  if (feature === "intervention_strategy") {
    const strategies: StrategyDocument[] = drafts.map((
      { item, evidence },
      index,
    ) => ({
      version: 1,
      generationId,
      pesApprovedAt: `draft:${context.pesGeneration}`,
      objectiveApprovedAt: `draft:${context.objectiveGeneration}`,
      strategy: {
        ...emptyStrategy(),
        title: item.title,
        action: item.action,
        monitoring: item.monitoring,
        goalIndexes: context.priorDrafts.objectives[item.goalIndex]
          ? [item.goalIndex]
          : [],
        priority: index + 1,
        evidence,
      },
    }));
    return { batchBasis, strategies };
  }
  return {
    batchBasis,
    instructions: drafts.map(({ item, evidence }) => ({
      text: item.action,
      evidence,
    })),
  };
}

export const isAssessmentDraft = (output: unknown): boolean => {
  const basis = (output as { batchBasis?: unknown } | null)?.batchBasis;
  return basis === "assessment" || basis === "template";
};
