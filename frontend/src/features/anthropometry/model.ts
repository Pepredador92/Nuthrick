export type FormulaId = "bmi" | "whr" | "jp7" | "siri" | "brozek";
export type Measurements = Partial<
  Record<
    | "weight"
    | "height"
    | "waist"
    | "hip"
    | "chest"
    | "axillary"
    | "triceps"
    | "subscapular"
    | "suprailiac"
    | "abdomen"
    | "thigh",
    number
  >
>;
export interface AssessmentInput {
  measuredAt: string;
  age: number | null;
  sex: "" | "male" | "female";
  context: "" | "adult" | "pregnancy" | "other";
  protocol: string;
  scale: string;
  caliper: string;
  measurements: Measurements;
  bia: {
    device: string;
    protocol: string;
    fat: number | null;
    fastingHours: number | null;
    recentExercise: "" | "yes" | "no";
    hydration: "" | "usual" | "changed";
    notes: string;
  };
  selected: FormulaId[];
  bmiReference: boolean;
}
export interface Reference {
  id: string;
  version: string;
  title: string;
  url: string;
}
export interface Result {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  method: string;
  methodVersion: string;
  provenance: "measured" | "device" | "calculated";
  inputs: Record<string, string | number>;
  compatibilityKey: string | null;
  classification: string | null;
  reference: Reference | null;
  reference_id: string | null;
  reference_version: string | null;
  sources: Reference[];
  guidance: string;
  formula?: FormulaId;
  calculation?: string;
  previous?: {
    value: number;
    delta: number;
    measuredAt: string;
    recordId: string;
    conditionsDiffer: boolean;
    conditions: AssessmentInput["bia"] | null;
  };
}
export interface Diagnosis {
  enabled: boolean;
  mode: "pes" | "narrative";
  problem: string;
  etiology: string;
  narrative: string;
  evidenceText: string;
  evidence: Result[];
}
export interface AnthroPayload {
  schemaVersion: 1;
  engineVersion: string;
  input: AssessmentInput;
  results: Result[];
  assessment: string[];
  note: string;
  noteReviewed: boolean;
  diagnosis: Diagnosis;
}
export interface AnthroRecord {
  id: string;
  professional_id: string;
  patient_id: string;
  consultation_id: string;
  revision: number;
  measured_at: string;
  payload: AnthroPayload;
  created_at: string;
}
export const prompts = [
  "¿Qué cambios relevantes observas respecto a la consulta anterior?",
  "¿Qué indicadores son relevantes para el objetivo actual del paciente?",
  "¿Existe algún resultado que requiera seguimiento?",
  "¿Hay diferencias importantes entre métodos de composición corporal?",
  "¿Qué condiciones pueden afectar la comparabilidad?",
  "Observaciones antropométricas",
];
export function newPayload(date: string, age: number | null): AnthroPayload {
  return {
    schemaVersion: 1,
    engineVersion: "1.0.0",
    input: {
      measuredAt: date,
      age,
      sex: "",
      context: "",
      protocol: "",
      scale: "",
      caliper: "",
      measurements: {},
      bia: {
        device: "",
        protocol: "",
        fat: null,
        fastingHours: null,
        recentExercise: "",
        hydration: "",
        notes: "",
      },
      selected: ["bmi"],
      bmiReference: true,
    },
    results: [],
    assessment: prompts.map(() => ""),
    note: "",
    noteReviewed: false,
    diagnosis: {
      enabled: false,
      mode: "pes",
      problem: "",
      etiology: "",
      narrative: "",
      evidenceText: "",
      evidence: [],
    },
  };
}
