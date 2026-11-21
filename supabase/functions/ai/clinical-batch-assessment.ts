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
import { completeClinicalSentence } from "./clinical-planning.ts";

type Visit = "initial" | "follow_up";
type AssessmentFeature = Exclude<ClinicalBatchFeature, "pes_diagnosis">;

const field = (maxLength: number) => ({ type: "string", maxLength });
const properties = {
  title: field(200),
  indicator: field(400),
  criterion: field(400),
  goalIndex: { type: "integer", minimum: 0, maximum: 2 },
  evidenceFactIds: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { type: "string", pattern: "^f[1-9][0-9]*$" },
  },
};
export function assessmentSchema(feature: AssessmentFeature) {
  const fields = {
    ...properties,
    action: field(
      feature === "consultation_support"
        ? 400
        : feature === "intervention_strategy"
        ? 1500
        : PATIENT_INSTRUCTION_MAX_LENGTH,
    ),
    monitoring: field(feature === "intervention_strategy" ? 1500 : 400),
  };
  return {
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
          required: Object.keys(fields),
          properties: fields,
        },
      },
    },
  };
}

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
    "Propón qué puede probar la persona con la información disponible. Escribe en action el cambio útil que puede intentar, en indicator qué se observará, en criterion qué resultado observable revisarán y en monitoring cómo. Si solo es posible valorar, elige una pregunta o registro que ayude a decidir el siguiente paso. Usa goalIndex=0.",
  intervention_strategy:
    "Propón acciones que el nutriólogo pueda realizar con la persona. En title pon un nombre breve. En action describe cómo acompañar el objetivo y en monitoring qué revisará el nutriólogo. Vincula el índice del objetivo en goalIndex.",
  patient_instructions:
    "Redacta en action una instrucción clara que ayude a realizar alguna acción del borrador. Habla directamente con la persona de tú, con palabras de uso diario y oraciones completas. Usa goalIndex=0.",
};

export function assessmentInstructions(feature: AssessmentFeature) {
  return `Genera borradores de valoración nutricional para revisión del profesional. ${
    assessmentTasks[feature]
  }
Aunque la etiología esté pendiente, puedes proponer educación, organización de rutinas, práctica de pasos sencillos, resolución de barreras o continuidad de una acción que ya se esté realizando y que conste como vigente. Escoge una acción proporcionada a los datos. Evita diagnósticos, causas atribuidas, prescripciones, dosis, metas de peso, cantidades de ingesta, restricciones o pautas nuevas de actividad.
Personaliza a partir de facts y cita los IDs exactos que sustenten cada propuesta. Si falta un dato que cambiaría la decisión, conviértelo en una pregunta o actividad de valoración concreta. Conserva los acuerdos documentados y deja como propuesta aquello que aún se tenga que conversar. Escribe los campos de acción y seguimiento con oraciones completas. En los campos de texto ajenos a esta etapa usa la cadena vacía. Devuelve items vacío si falta evidencia pertinente para personalizar.`;
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
    strategy: "Conocer la rutina de comidas",
    professionalAction:
      "Acordar con la persona un día habitual que pueda describir para conocer sus comidas y horarios.",
    professionalMonitoring:
      "Revisar el relato y qué situaciones modificaron la rutina.",
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
    strategy: "Revisar el avance desde la última consulta",
    professionalAction:
      "Revisar con la persona una acción que intentó desde la última consulta e identificar qué le ayudó o se le dificultó.",
    professionalMonitoring:
      "Retomar un ejemplo concreto y acordar el siguiente paso.",
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
      evidence.length !== item.evidenceFactIds.length ||
      !completeClinicalSentence(item.action)
    ) return [];
    if (
      feature === "consultation_support" && (item.action.length > 400 ||
        !item.indicator.trim() || !completeClinicalSentence(item.criterion) ||
        !completeClinicalSentence(item.monitoring))
    ) return [];
    if (
      feature === "intervention_strategy" &&
      (!item.title.trim() || item.action.length > 1500 ||
        item.goalIndex >= context.priorDrafts.objectives.length)
    ) return [];
    return [{ item, evidence }];
  });
  // A malformed nonempty response is not a decision that the clinical data
  // are insufficient. Keep that result on the recoverable validation path.
  if (output?.items.length && !contextual.length) return null;
  const batchBasis = contextual.length ? "assessment" : "template";
  const drafts = contextual.length ? contextual : [{
    item: {
      title: template.strategy,
      action: feature === "consultation_support"
        ? template.goal
        : feature === "intervention_strategy"
        ? template.professionalAction
        : template.action,
      indicator: template.indicator,
      criterion: template.criterion,
      monitoring: feature === "intervention_strategy"
        ? template.professionalMonitoring
        : template.monitoring,
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
        monitoring: completeClinicalSentence(item.monitoring)
          ? item.monitoring
          : "",
        missingContext:
          item.monitoring.trim() && !completeClinicalSentence(item.monitoring)
            ? ["Completar el seguimiento. El texto generado quedó incompleto."]
            : [],
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
