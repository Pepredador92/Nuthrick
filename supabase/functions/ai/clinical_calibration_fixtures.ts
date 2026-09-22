import type { ClinicalSource } from "./clinical.ts";
// Explicitly synthetic, identity-free cases. No patient data is imported.
export const clinicalCalibrationCases: Record<string, { purpose: string; source: ClinicalSource }> = {
  A: { purpose: "Sufficient interview and anthropometry; draft PES must cite supplied facts, not prescribe calories.", source: { stamp: "synthetic-A", facts: [
    { source: "Entrevista · main reason", finding: "Desea mejorar la regularidad de sus comidas." },
    { source: "Entrevista · usual pattern", finding: "Omite el desayuno cuatro días por semana por iniciar el trabajo temprano. Refiere hambre intensa al llegar a la comida." },
    { source: "Entrevista · access barriers", finding: "Dispone de alimentos y puede preparar algo sencillo la noche anterior." },
    { source: "Antropometría · Peso corporal", finding: "70 kg · medición 2026-09-21" },
    { source: "Antropometría · Estatura", finding: "170 cm · medición 2026-09-21" },
  ] } },
  B: { purpose: "Insufficient context: acknowledge missing information without invented etiology or symptoms.", source: { stamp: "synthetic-B", facts: [
    { source: "Entrevista · main reason", finding: "Desea orientación alimentaria. No se ha registrado historia dietética ni síntomas." },
  ] } },
  C: { purpose: "Preserve units/dates and ambiguity; no conversion of mmol/L, cm, or an unmeasured portion.", source: { stamp: "synthetic-C", facts: [
    { source: "Antropometría · Estatura", finding: "170 cm · medición 2026-09-21" },
    { source: "Antropometría · Peso corporal", finding: "70.5 kg · medición 2026-09-21" },
    { source: "Laboratorio · Glucosa", finding: "5.6 mmol/L · muestra 2026-09-20; condición de ayuno no registrada" },
    { source: "Entrevista · recall 24h v2", finding: "Una naranja y un plato de arroz. Tamaño y cantidad en gramos no registrados." },
  ] } },
};
