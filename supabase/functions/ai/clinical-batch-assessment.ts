import type { ClinicalBatchFeature } from "../_shared/clinical-batch.ts";
import {
  emptyStrategy,
  isStrategyDocument,
  mergeRepeatedStrategyProposals,
  type Strategy,
  type StrategyDocument,
} from "../_shared/interventions.ts";
import { emptyObjective, type ObjectiveGoal } from "../_shared/objectives.ts";
import { PATIENT_INSTRUCTION_MAX_LENGTH } from "../_shared/patient-instructions.ts";
import { unsupportedPesNumbers } from "../_shared/pes.ts";
import {
  buildPesClinicalContext,
  clinicalFactTiming,
  type ClinicalSource,
  redactClinicalText,
} from "./clinical.ts";
import type { BatchStages } from "./clinical-batch.ts";
import { completeClinicalSentence, completeStrategyProse, linkedStrategyReviewWindow, strategyReviewDetails } from "./clinical-planning.ts";
import { objectiveBaseline, objectiveFeasibilityPrompt } from './objective-proposals.ts';

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
const assessmentStrategyFields = [
  "method", "adaptations", "educationTopic", "materials", "comprehensionCheck",
  "coordinationWith", "coordinationReason", "monitoring", "reviewAt", "adjustmentCriteria", "referenceNotes",
] as const;
const assessmentStrategyCategories = ["education", "counseling", "coordination"] as const;
type AssessmentStrategy = Pick<Strategy, typeof assessmentStrategyFields[number] | "title" | "action" | "goalIndexes" | "missingContext"> & {
  evidenceFactIds: string[];
  category: typeof assessmentStrategyCategories[number];
};

export function assessmentSchema(feature: AssessmentFeature) {
  const fields = feature === "intervention_strategy" ? {
    title: properties.title,
    action: field(1500),
    evidenceFactIds: properties.evidenceFactIds,
    ...Object.fromEntries(assessmentStrategyFields.map(key => [key, field(1500)])),
    goalIndexes: { type: "array", maxItems: 3, items: properties.goalIndex },
    category: { type: "string", enum: assessmentStrategyCategories },
    missingContext: { type: "array", maxItems: 15, items: field(400) },
  } : {
    ...properties,
    ...(feature === 'consultation_support' ? {
      baselineFactId: { type: 'string', pattern: '^(f[1-9][0-9]*)?$' },
      feasibility: field(400),
    } : {}),
    action: field(feature === "consultation_support" ? 400 : PATIENT_INSTRUCTION_MAX_LENGTH),
    monitoring: field(400),
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
  baselineFactId?: string;
  feasibility?: string;
};

const assessmentTasks: Record<AssessmentFeature, string> = {
  consultation_support:
    "Propón qué puede probar la persona con la información disponible. Escribe en action el cambio útil que puede intentar, en indicator qué se observará, en criterion qué resultado observable revisarán y en monitoring cómo. En baselineFactId cita el hecho que describa el punto de partida, o usa la cadena vacía si se conocerá con el primer registro. En feasibility redacta cómo adaptar el objetivo a una barrera o preferencia documentada. Si no está registrada, propón una adaptación que se pueda conversar sin asumir hechos. El nutriólogo elige el plazo. Si solo es posible valorar, elige una pregunta o registro que ayude a decidir el siguiente paso. Usa goalIndex=0.",
  intervention_strategy:
    "Redacta la estrategia para el nutriólogo. En title pon un nombre breve y en action describe la acción profesional. Completa method con el paso concreto para aplicarla, adaptations con ajustes a barreras o preferencias documentadas y monitoring y adjustmentCriteria con qué revisar y cuándo ajustar. Para educación o asesoría, completa educationTopic, materials y comprehensionCheck. Para coordinación, indica el rol o servicio y el motivo. En referenceNotes explica brevemente por qué la acción encaja con la información disponible. Usa en reviewAt el plazo del objetivo si existe. Deja vacíos los campos inaplicables. Incluye en missingContext solo preguntas concretas cuya respuesta cambiaría la estrategia. Si una misma acción apoya varios objetivos, devuelve una sola estrategia y vincula todos sus índices en goalIndexes. Si todavía no hay objetivos para vincular, usa [].",
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
        target: clean(goal?.target),
        timeframe: clean(goal?.timeframe),
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
    professionalMethod: "Repasar desde que se levanta hasta que termina el día y pedirle que cuente un ejemplo de su rutina.",
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
    professionalMethod: "Pedirle que describa una ocasión concreta y que explique qué hizo y qué ajustarían juntos.",
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
  output?: { items: AssessmentItem[] | AssessmentStrategy[] },
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
  if (feature === "intervention_strategy") {
    return batchStrategyDraft(context, generationId, output?.items as AssessmentStrategy[] | undefined);
  }
  const byId = new Map(context.facts.map((fact) => [fact.id, fact]));
  const contextual = ((output?.items ?? []) as AssessmentItem[]).flatMap((item) => {
    const evidenceIds = [...new Set(item.evidenceFactIds)];
    if (item.baselineFactId && byId.has(item.baselineFactId) && !evidenceIds.includes(item.baselineFactId)) evidenceIds.push(item.baselineFactId);
    const evidence = evidenceIds.flatMap((id) => {
      const fact = byId.get(id);
      return fact && fact.source.length <= 2000 && fact.finding.length <= 4000
        ? [{ source: fact.source, finding: fact.finding }]
        : [];
    });
    if (
      evidence.length !== evidenceIds.length || new Set(item.evidenceFactIds).size !== item.evidenceFactIds.length ||
      !completeClinicalSentence(item.action)
    ) return [];
    if (
      feature === "consultation_support" && (item.action.length > 400 ||
        !item.indicator.trim() || !completeClinicalSentence(item.criterion) ||
        !completeClinicalSentence(item.monitoring))
    ) return [];
    return [{ item, evidence }];
  });
  // A malformed nonempty response is not a decision that the clinical data
  // are insufficient. Keep that result on the recoverable validation path.
  if (output?.items.length && !contextual.length) return null;
  const batchBasis = contextual.length ? "assessment" : "template";
  const drafts: { item: Omit<AssessmentItem, 'evidenceFactIds'>; evidence: { source: string; finding: string }[] }[] = contextual.length ? contextual : [{
    item: {
      title: template.strategy,
      action: feature === "consultation_support" ? template.goal : template.action,
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
          etiology: 'La relación con el diagnóstico se revisará con lo observado en este objetivo.',
          indicator: item.indicator,
          baseline: objectiveBaseline(item.baselineFactId ? byId.get(item.baselineFactId) : undefined),
          target: item.criterion,
          monitoring: item.monitoring,
          feasibility: item.feasibility && completeClinicalSentence(item.feasibility) ? item.feasibility : objectiveFeasibilityPrompt,
          textStyle: "patient_v1",
          targetOrigin: "proposed",
        },
        evidence,
      })),
    };
  }
  return {
    batchBasis,
    instructions: drafts.map(({ item, evidence }) => ({
      text: item.action,
      evidence,
    })),
  };
}

function batchStrategyDraft(context: BatchAssessment, generationId: string, items: AssessmentStrategy[] = []) {
  const byId = new Map(context.facts.map(fact => [fact.id, fact]));
  const objectives = context.priorDrafts.objectives;
  const document = (strategy: Strategy): StrategyDocument => ({
    version: 1,
    generationId,
    pesApprovedAt: `draft:${context.pesGeneration}`,
    objectiveApprovedAt: `draft:${context.objectiveGeneration}`,
    strategy,
  });
  const strategies = items.flatMap((item, index) => {
    const ids = [...new Set(item.evidenceFactIds)];
    const evidence = ids.flatMap(id => {
      const fact = byId.get(id);
      return fact ? [{ source: fact.source, finding: fact.finding }] : [];
    });
    if (evidence.length !== item.evidenceFactIds.length || !item.title.trim() ||
      item.goalIndexes.some(goal => !objectives.some(objective => objective.index === goal))) return [];
    const strategy = {
      ...emptyStrategy(),
      ...Object.fromEntries(assessmentStrategyFields.map(field => [field, item[field]])),
      title: item.title,
      action: item.action,
      category: item.category,
      goalIndexes: [...new Set(item.goalIndexes)].sort(),
      priority: index + 1,
      missingContext: item.missingContext,
      evidence,
    };
    const reviewAt = linkedStrategyReviewWindow(objectives, strategy.goalIndexes);
    const datedEvidence = reviewAt ? [...evidence, { finding: reviewAt }] : evidence;
    const unsupported = unsupportedPesNumbers({
      problem: item.title,
      etiology: item.action,
      signsSymptoms: [...assessmentStrategyFields.map(field => item[field]), ...item.missingContext],
    }, datedEvidence);
    if (unsupported.length) return [];
    const complete = completeStrategyProse({
      ...strategy,
      ...strategyReviewDetails(strategy),
      reviewAt: item.reviewAt.trim() || reviewAt || (strategy.goalIndexes.length ? "En la revisión del objetivo." : ""),
    });
    if (!complete) return [];
    const draft = document(complete);
    return isStrategyDocument(draft) ? [draft] : [];
  });
  if (items.length) return strategies.length
    ? { batchBasis: "assessment", strategies: mergeRepeatedStrategyProposals(strategies) }
    : null;
  const template = templates[context.consultationType];
  const fallback = {
    ...emptyStrategy(),
    title: template.strategy,
    action: template.professionalAction,
    method: template.professionalMethod,
    monitoring: template.professionalMonitoring,
    category: "counseling" as const,
    goalIndexes: objectives.length ? [objectives[0].index] : [],
  };
  return { batchBasis: "template", strategies: [document({ ...fallback, ...strategyReviewDetails(fallback) })] };
}

export const isAssessmentDraft = (output: unknown): boolean => {
  const basis = (output as { batchBasis?: unknown } | null)?.batchBasis;
  return basis === "assessment" || basis === "template";
};
