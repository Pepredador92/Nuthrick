export const clinicalBatchStages = [
  { feature: "pes_diagnosis", label: "Diagnóstico PES" },
  { feature: "consultation_support", label: "Objetivos" },
  { feature: "intervention_strategy", label: "Estrategias" },
  { feature: "patient_instructions", label: "Indicaciones" },
] as const;
export type ClinicalBatchFeature =
  typeof clinicalBatchStages[number]["feature"];
export const clinicalBatchKey = (feature: ClinicalBatchFeature) =>
  `proposal:batch:${feature}`;
export const clinicalBatchRevisionKey = (feature: ClinicalBatchFeature) =>
  `proposal:batch-revision:${feature}`;
export type ClinicalBatchProposal = {
  batchId: string;
  generationId: string;
  output: Record<string, unknown>;
  inputGenerations?: string[];
  revises?: string;
};
export const approvedPesSource = "PES actual aprobado";
export const provisionalPesSource = "PES provisional";
export const pesSignSource = (source: string) =>
  source === `${approvedPesSource} · Signos y síntomas` ||
  source === `${provisionalPesSource} · Signos y síntomas`;
export const pesEtiologySource = (source: string) =>
  source === `${approvedPesSource} · Etiología` ||
  source === `${provisionalPesSource} · Etiología`;
