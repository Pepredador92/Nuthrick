export type CalculationInputSource =
  | "consultation_measurement"
  | "patient_record"
  | "patient_derived"
  | "calculation_result";

export type CalculationValidationStatus =
  | "validated"
  | "requires_decision"
  | "pending_evidence";

export type CalculationPatientField =
  | "height_cm"
  | "equation_sex"
  | "lee_population_group";

export type CalculationInputDefinition = {
  key: string;
  label: string;
  source: CalculationInputSource;
  expectedUnit?: string;
  measurementCode?: string;
  patientField?: CalculationPatientField;
  derivation?: "age_at_consultation";
  calculationCode?: string;
};

export type CalculationReference = {
  authors: string;
  year: number;
  title: string;
  source: string;
  doi?: string;
  url: string;
  evidence?: "original" | "technical_manual" | "secondary_scholarly";
};

export type CalculationApplicability = {
  sexes?: Array<"male" | "female">;
  ageMin?: number;
  ageMax?: number;
  population: string;
  exclusions?: string[];
  notes?: string[];
};

export type CalculationEquation = {
  expression: string;
  variables?: Record<string, string>;
  coefficients?: Record<string, number | string>;
  conditions?: string[];
  transformations?: string[];
};

export type CalculationVariant = {
  code: string;
  name: string;
  appliesWhen?: {
    equationSex?: "male" | "female";
    ageMin?: number;
    ageMax?: number;
  };
  inputs?: CalculationInputDefinition[];
  equation?: CalculationEquation;
  applicability?: CalculationApplicability;
  note?: string;
};

export type CalculationProvenance = {
  sourceCalculationCode: string;
  sourceResultKey: "body_fat_percentage";
  preservesMethod: true;
};

export type CalculationDefinition = {
  catalogVersion: number;
  resultKey: string;
  resultName: string;
  methodName: string;
  method?: string;
  variant?: string;
  summary: string;
  unit: string;
  decimalPlaces: number;
  inputs: CalculationInputDefinition[];
  optionalInputs?: CalculationInputDefinition[];
  dependencies: string[];
  equation?: CalculationEquation;
  variants?: CalculationVariant[];
  applicability?: CalculationApplicability;
  references: CalculationReference[] | string[];
  validationStatus?: CalculationValidationStatus;
  validationNote?: string;
  methodologicalNotes?: string[];
  provenance?: CalculationProvenance;
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
