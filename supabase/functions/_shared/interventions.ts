/** Structured planning data. Clinical approval and execution are separate decisions. */
export const strategyCategories = {
  food: "Alimentación y soporte nutricional",
  education: "Educación nutricional",
  counseling: "Asesoría nutricional",
  supplementation: "Suplementación y coordinación farmacológica",
  coordination: "Coordinación de la atención",
} as const;
export type StrategyCategory = keyof typeof strategyCategories;
export const strategyFields = [
  "title",
  "action",
  "etiologyLink",
  "method",
  "frequency",
  "duration",
  "startDate",
  "responsible",
  "executor",
  "adaptations",
  "monitoring",
  "reviewAt",
  "adjustmentCriteria",
  "access",
  "dose",
  "composition",
  "educationTopic",
  "materials",
  "comprehensionCheck",
  "coordinationWith",
  "coordinationReason",
  "referenceTitle",
  "referenceUrl",
  "referenceVersion",
  "referenceNotes",
] as const;
export type Strategy = Record<typeof strategyFields[number], string> & {
  category: StrategyCategory;
  goalIndexes: number[];
  priority: number;
  route: "not_applicable" | "oral" | "enteral" | "parenteral";
  agreement: "pending" | "patient" | "caregiver";
  evidence: { source: string; finding: string }[];
  referenceIds: string[];
  missingContext: string[];
};
export type StrategyDocument = {
  version: 1;
  pesApprovedAt: string;
  objectiveApprovedAt: string;
  strategy: Strategy;
  generationId?: string;
};
export const strategyReferences = [
  {
    id: "academy-intervention",
    title: "Academy · Nutrition Intervention",
    url:
      "https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-intervention",
    version: "Consultada 2026-10-18",
    scope:
      "Marco del proceso: planificación, implementación, etiología y participación del paciente.",
  },
  {
    id: "academy-monitoring",
    title: "Academy · Nutrition Monitoring and Evaluation",
    url:
      "https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-monitoring-and-evaluation",
    version: "Consultada 2026-10-18",
    scope:
      "Marco de seguimiento: indicadores y criterios elegidos por el profesional.",
  },
] as const;
export const emptyStrategy = (): Strategy => ({
  ...Object.fromEntries(strategyFields.map((field) => [field, ""])) as Record<
    typeof strategyFields[number],
    string
  >,
  category: "education",
  goalIndexes: [],
  priority: 1,
  route: "not_applicable",
  agreement: "pending",
  evidence: [],
  referenceIds: [],
  missingContext: [],
});
// Matches validate_intervention_document and the draft column in PostgreSQL.
export const STRATEGY_DOCUMENT_MAX_BYTES = 90000;
function withinDocumentByteLimit(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return false;
    // jsonb::text adds one space after structural commas and colons. Count
    // those separators outside strings so a compact JSON payload cannot pass
    // here and then exceed the database limit when PostgreSQL normalizes it.
    let separators = 0, quoted = false, escaped = false;
    for (const char of serialized) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === ":" || char === ",") separators++;
    }
    return new TextEncoder().encode(serialized).length + separators <=
      STRATEGY_DOCUMENT_MAX_BYTES;
  } catch {
    return false;
  }
}
export function isStrategyDocument(value: unknown): value is StrategyDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as StrategyDocument, s = d.strategy;
  return d.version === 1 && typeof d.pesApprovedAt === "string" &&
    typeof d.objectiveApprovedAt === "string" && !!s &&
    strategyFields.every((field) =>
      typeof s[field] === "string" && s[field].length <= 1500
    ) && Object.hasOwn(strategyCategories, s.category) &&
    Array.isArray(s.goalIndexes) && s.goalIndexes.length <= 3 &&
    new Set(s.goalIndexes).size === s.goalIndexes.length &&
    s.goalIndexes.every((i) => Number.isInteger(i) && i >= 0 && i <= 2) &&
    Number.isInteger(s.priority) && s.priority >= 1 && s.priority <= 10 &&
    ["not_applicable", "oral", "enteral", "parenteral"].includes(s.route) &&
    ["pending", "patient", "caregiver"].includes(s.agreement) &&
    Array.isArray(s.evidence) && s.evidence.length <= 10 &&
    s.evidence.every((e) =>
      e && typeof e.source === "string" && typeof e.finding === "string" &&
      e.source.length <= 2000 && e.finding.length <= 4000
    ) &&
    Array.isArray(s.referenceIds) && s.referenceIds.length <= 5 &&
    s.referenceIds.every((id) =>
      strategyReferences.some((ref) => ref.id === id)
    ) && Array.isArray(s.missingContext) && s.missingContext.length <= 15 &&
    s.missingContext.every((note) =>
      typeof note === "string" && note.length <= 400
    ) && withinDocumentByteLimit(d);
}
export function strategyIssues(s: Strategy): string[] {
  const required: typeof strategyFields[number][] = [
    "title",
    "action",
    "etiologyLink",
    "method",
    "frequency",
    "duration",
    "startDate",
    "responsible",
    "executor",
    "adaptations",
    "monitoring",
    "reviewAt",
    "adjustmentCriteria",
  ];
  if (["food", "supplementation"].includes(s.category)) {
    required.push("composition", "dose");
  }
  if (["enteral", "parenteral"].includes(s.route)) {
    required.push("access", "coordinationWith");
  }
  if (["education", "counseling"].includes(s.category)) {
    required.push("educationTopic", "materials", "comprehensionCheck");
  }
  if (s.category === "coordination") {
    required.push("coordinationWith", "coordinationReason");
  }
  return [
    ...required.filter((field) => !s[field].trim()).map((field) => field),
    ...(!s.goalIndexes.length ? ["goalIndexes"] : []),
    ...(["food", "supplementation"].includes(s.category) &&
        s.route === "not_applicable"
      ? ["route"]
      : []),
    ...(!["food", "supplementation"].includes(s.category) &&
        s.route !== "not_applicable"
      ? ["route"]
      : []),
    ...(s.agreement === "pending" ? ["agreement"] : []),
    ...(s.referenceUrl && !/^https:\/\/[^\s]+$/.test(s.referenceUrl)
      ? ["referenceUrl"]
      : []),
  ];
}
export function strategySummary(s: Strategy): string {
  return [
    s.action,
    s.method,
    s.frequency && `Frecuencia: ${s.frequency}`,
    s.duration && `Duración: ${s.duration}`,
    s.monitoring && `Seguimiento: ${s.monitoring}`,
  ].filter(Boolean).join("\n");
}

export function approvedStrategyFacts(
  entries: { document: StrategyDocument }[] = [],
) {
  return entries.flatMap((entry, index) => {
    if (!isStrategyDocument(entry.document)) return [];
    const s = entry.document.strategy;
    return [{
      source: `Estrategia aprobada · ${index + 1}`,
      finding: `${s.title}\n${
        strategySummary(s)
      }\nInicio previsto: ${s.startDate}\nVía: ${s.route}\nAcceso: ${s.access}\nComposición: ${
        ["food", "supplementation"].includes(s.category) ? s.composition : ""
      }\nCantidad: ${
        ["food", "supplementation"].includes(s.category) ? s.dose : ""
      }\nAdaptaciones: ${s.adaptations}`,
    }];
  });
}
