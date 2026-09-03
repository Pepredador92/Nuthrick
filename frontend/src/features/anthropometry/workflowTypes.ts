import type { Result, AssessmentInput } from "./model";
export type MeasurementCategory =
  | "general"
  | "circumference"
  | "skinfold"
  | "diameter"
  | "bioimpedance"
  | "laboratory"
  | "other";
export type MeasurementSource = "manual" | "device" | "imported";
export type MeasurementUnit =
  | "kg"
  | "cm"
  | "mm"
  | "%"
  | "L"
  | "kcal/día"
  | "años"
  | "nivel"
  | "g/cm³"
  | "ratio"
  | "kg/m²"
  | "mg/dL"
  | "unidad";
export type CalculationCategory =
  "index" | "density" | "body_fat" | "body_composition" | "somatotype";
export interface MeasurementType {
  id: string;
  code: string;
  name: string;
  category: MeasurementCategory;
  unit: MeasurementUnit;
  data_type: "number";
  min_value: number;
  max_value: number;
  decimal_places: number;
  description: string;
  is_active: boolean;
  created_by: string | null;
}
export interface MeasurementDevice {
  id: string;
  manufacturer: string;
  model: string;
  device_type: string;
  technology: string;
  notes: string;
  is_system_device: boolean;
  created_by: string | null;
}
export type IndicatorCode =
  | "bmi"
  | "waist_hip_ratio"
  | "waist_height_ratio"
  | "body_density"
  | "body_fat"
  | "fat_mass"
  | "fat_free_mass";
export type CompositionMethod =
  "jp7_siri" | "jp7_brozek" | "density_siri" | "density_brozek" | "device";
export interface FollowupConfiguration {
  version: 1;
  entry: "indicators" | "measurements";
  measurements: string[];
  indicators: IndicatorCode[];
  methods: CompositionMethod[];
  deviceId: string | null;
  protocol: string;
  scale: string;
  caliper: string;
  biaProtocol: string;
}
export interface PatientMeasurementTemplate {
  patient_id: string;
  professional_id: string;
  revision: number;
  configuration: FollowupConfiguration;
  created_at: string;
  updated_at: string;
}
export interface RegisteredMeasurement {
  id: string;
  patient_id: string;
  consultation_id: string;
  measurement_type_id: string;
  code: string;
  name: string;
  value: number;
  unit: MeasurementUnit;
  source_type: MeasurementSource;
  device_id: string | null;
  device: MeasurementDevice | null;
  measured_at: string;
  created_at: string;
  created_by: string;
  notes: string;
  protocol: string;
  reused_from_id?: string;
  original_measured_at?: string;
}
export interface CalculationInput {
  measurement_id?: string;
  calculation_id?: string;
  value: number;
  unit: string;
  measured_at?: string;
}
export interface CalculatedMeasurement extends Result {
  calculation_id: string;
  calculation_code: string;
  raw_value: number;
  display_value: number;
  decimal_places: number;
  source_type: "calculated";
  patient_id: string;
  consultation_id: string;
  calculated_at: string;
  recalculated_at?: string;
  inputs_json: Record<string, CalculationInput>;
  dependency_ids: string[];
  formula_metadata: Record<string, unknown>;
}
export interface MeasurementWorkflow {
  version: 2;
  configuration: FollowupConfiguration;
  entries: Record<string, RegisteredMeasurement>;
  calculations: CalculatedMeasurement[];
  calculated_at: string | null;
  calculation_signature: string | null;
  context: {
    birthDate: string | null;
    sex: AssessmentInput["sex"];
    age: number | null;
    consultationDate: string;
    timezone: string;
    fromPatient: boolean;
  };
  templateRevision: number;
  templateScope: "habitual" | "today";
}
export interface CalculationDefinition {
  code: string;
  name: string;
  category: CalculationCategory;
  status: "implemented" | "not_implemented";
  version: string;
  requiredInputs: string[];
  dependencies: string[];
  optionalInputs: string[];
  applicableSex: string[];
  applicableAgeRange: [number, number] | null;
  description: string;
  calculation: string;
  unit: MeasurementUnit;
  decimalPlaces: number;
  limitations: string;
  referenceUrls: string[];
}
export const emptyConfiguration = (): FollowupConfiguration => ({
  version: 1,
  entry: "indicators",
  measurements: [],
  indicators: [],
  methods: ["jp7_siri"],
  deviceId: null,
  protocol: "",
  scale: "",
  caliper: "",
  biaProtocol: "",
});
