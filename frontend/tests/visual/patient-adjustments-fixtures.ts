import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import refs from "@/src/features/interpretations/references.json";
import { interpretResult } from "@/src/features/interpretations/engine";
import type { InterpretationReference } from "@/src/features/interpretations/types";
export const patient = { id: "visual-patient", full_name: "Paciente de demostración", height_cm: 174, weight_kg: 80, birth_date: "1992-06-10", equation_sex: "male" };
export const consultation = { id: "visual-consultation", patient_id: patient.id, consultation_date: "2026-09-20T12:00:00Z", status: "draft" };
const measurements = [["weight", "Peso corporal", "general", "kg"], ["waist", "Cintura", "circumference", "cm"], ["hip", "Cadera", "circumference", "cm"], ["triceps", "Tricipital", "skinfold", "mm"], ["subscapular", "Subescapular", "skinfold", "mm"], ["humerus", "Diámetro de húmero", "bone_breadth", "cm"]];
export const catalog = measurements.map(([id, name, category, unit], i) => ({ id, code: id, name, display_name: name, clinical_name: name, category, subcategory: "", unit, data_type: "number", min_value: 0.001, max_value: 1000, decimal_places: 2, description: "Medición registrada durante esta consulta.", synonyms: [], display_order: i, source_kind: "direct", choice_options: [] }));
let workspace = catalog.map((item) => item.id);
let values = [{ id: "weight-value", measurement_type_id: "weight", value: 87.6 }];
export async function loadConsultationMeasurements() { return { catalog, workspaceIds: workspace, values, hasFollowup: false, followupIds: [], previousValues: {} }; }
export async function saveMeasurementWorkspace(ids: string[]) { workspace = ids; return ids; }
export async function savePatientMeasurementFollowup(_id: string, ids: string[]) { return ids; }
export async function saveConsultationMeasurements(_c: unknown, payload: Record<string, number>) { values = Object.entries(payload).map(([measurement_type_id, value]) => ({ id: measurement_type_id, measurement_type_id, value })); return values; }
export async function loadCalculationCatalog() { return []; }
export async function saveConsultationCalculationResults() { return []; }
export async function loadInterpretationData() { return { references: refs, saved: [], pregnant: false, pregnancyFromInterview: false }; }
export async function loadConsultationDeviceData() { return { devices: [], sessions: [] }; }
export async function saveDeviceMeasurements() { return {}; }
async function baseHistory() {
  return { consultations: [], series: catalog.map<LongitudinalSeries>((item, i) => ({ id: item.id, label: item.name, concept: item.name, conceptCode: item.code, category: "measurements", unit: item.unit, sourceType: "manual_measurement", method: null, provenance: null, graphable: true, points: [0, 1, 2].map((j) => ({ consultation_id: String(j), consultation_date: `2026-09-${String(1 + j * 9).padStart(2, "0")}T12:00:00Z`, raw_value: 80 - j + i, display_value: String(80 - j + i), unit: item.unit, source_reference: {}, ...(i === 0 ? { referenceWeight: { value: 65, method: "Referencia registrada" } } : {}) })) })).concat([{ id: "bmi", label: "IMC", concept: "IMC", conceptCode: "bmi", category: "calculations", unit: "kg/m²", sourceType: "calculation", method: "IMC", provenance: "IMC", graphable: true, points: [28, 27.5, 27].map((raw_value, j) => ({ consultation_id: String(j), consultation_date: `2026-09-${String(1 + j * 9).padStart(2, "0")}T12:00:00Z`, raw_value, display_value: String(raw_value), unit: "kg/m²", source_reference: {}, interpretation: interpretResult("bmi", raw_value, "kg/m²", { age: 34, sex: "male", pregnant: false }, refs as InterpretationReference[], String(j)) })) }]) };
}

export async function loadLongitudinalHistory() {
  const history = await baseHistory();
  const bmi = history.series.find((item) => item.id === "bmi")!;
  bmi.points.forEach((point) => { point.heightCm = 174; if (point.interpretation) point.interpretation.context.bmi = Number(point.raw_value); });
  history.series.push({ ...bmi, id: "fat", label: "Grasa corporal · JP3 + Siri", conceptCode: "body_fat_percentage", unit: "%", method: "JP3 + Siri", provenance: "JP3 + Siri", points: bmi.points.map((point, index) => ({ ...point, unit: "%", raw_value: 24 - index, display_value: String(24 - index), interpretation: { ...point.interpretation!, state: "no_reference", rule: null, reference: null } })) });
  history.series.push({ ...bmi, id: "somato", label: "Somatocarta · Heath-Carter", conceptCode: "somatochart_coordinates", unit: null, method: "Heath-Carter", provenance: "Heath-Carter", visualization: "somatochart", points: bmi.points.map((point, index) => ({ ...point, unit: null, raw_value: -1.5 + index, display_value: "Coordenadas guardadas", coordinates: { x: -1.5 + index, y: 5 - index }, interpretation: null })) });
  return history;
}

export async function requireEntitlement() { return {}; }
