/** Explicit patient-facing fields. Clinical rationale, AI evidence and notes stay in the record. */
export const sharedObjectiveLabels = {
  outcome: "Qué buscamos",
  indicator: "Cómo lo mediremos",
  baseline: "Punto de partida",
  target: "Meta acordada",
  timeframe: "Cuándo lo revisaremos",
  monitoring: "Cómo lo revisaremos",
  feasibility: "Cómo adaptarlo a tu día",
} as const;
export const sharedStrategyLabels = {
  title: "Estrategia acordada",
  action: "Qué harás",
  method: "Cómo lo harás",
  frequency: "Con qué frecuencia",
  duration: "Durante cuánto tiempo",
  startDate: "Inicio previsto",
  responsible: "Profesional responsable",
  executor: "Quién lo llevará a cabo",
  adaptations: "Si se te complica",
  monitoring: "Qué observaremos",
  reviewAt: "Cuándo lo revisaremos",
  composition: "Alimentos o composición",
  dose: "Cantidad indicada",
  educationTopic: "Tema que revisaremos",
  materials: "Material de apoyo",
  comprehensionCheck: "Cómo repasaremos lo aprendido",
  coordinationWith: "Con quién nos coordinaremos",
  coordinationReason: "Para qué nos coordinaremos",
  access: "Acceso indicado",
} as const;
export type ClinicalSource = {
  consultationId: string;
  revision: number;
  approvedAt: string;
  questionKey?: string;
  goalIndex?: number;
  strategyId?: string;
  version?: number;
};
export type SharedObjective =
  & Record<keyof typeof sharedObjectiveLabels, string>
  & { source: ClinicalSource };
export type SharedStrategy =
  & Record<keyof typeof sharedStrategyLabels, string>
  & { source: ClinicalSource; route: string };
export type ClinicalGuidance = {
  objectives?: SharedObjective[];
  strategies?: SharedStrategy[];
};
export type ClinicalCandidates = {
  consultations: {
    id: string;
    date: string;
    revision: number;
    objectives: SharedObjective[];
    strategies: SharedStrategy[];
  }[];
};
export const clinicalSourceKey = (source: ClinicalSource) =>
  JSON.stringify([
    source.consultationId,
    source.revision,
    source.approvedAt,
    source.questionKey ?? null,
    source.goalIndex ?? null,
    source.strategyId ?? null,
    source.version ?? null,
  ]);
export const clinicalRouteLabels: Record<string, string> = {
  not_applicable: "",
  oral: "Oral",
  enteral: "Enteral",
  parenteral: "Parenteral",
};
