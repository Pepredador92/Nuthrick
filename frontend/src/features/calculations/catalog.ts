export type CalculationInputSource =
  | "consultation_measurement"
  | "patient_record"
  | "patient_derived"
  | "calculation_result";

export type CalculationInputDefinition = {
  key: string;
  label: string;
  source: CalculationInputSource;
  measurementCode?: string;
  patientField?: "height_cm" | "equation_sex";
  derivation?: "age_at_consultation";
  calculationCode?: string;
};

export type CalculationDefinition = {
  catalogVersion: number;
  resultKey: string;
  resultName: string;
  methodName: string;
  summary: string;
  unit: string;
  decimalPlaces: number;
  inputs: CalculationInputDefinition[];
  dependencies: string[];
  references: string[];
  limitations: string;
};

export type CalculationCatalogItem = {
  code: string;
  name: string;
  category: string;
  method_version: string;
  status: "implemented" | "not_implemented";
  definition: CalculationDefinition;
  display_order: number;
};

export const calculationCategoryNames: Record<string, string> = {
  index: "Índices antropométricos",
  density: "Densidad corporal",
  body_fat: "Porcentaje de grasa corporal",
  compartments: "Compartimentos corporales",
  muscle_mass: "Masa muscular",
  somatotype: "Somatotipo",
  other: "Otros indicadores",
};

export const calculationCategoryOrder = [
  "index",
  "density",
  "body_fat",
  "compartments",
  "muscle_mass",
  "somatotype",
  "other",
];
