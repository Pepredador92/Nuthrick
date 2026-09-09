export type EnergySex = "male" | "female";

export type EnergyInputKey =
  | "weightKg"
  | "heightCm"
  | "ageYears"
  | "sex";

export type PredictiveEnergyFormulaCode =
  | "MIFFLIN_ST_JEOR_1990"
  | "HARRIS_BENEDICT_ORIGINAL_1919"
  | "HARRIS_BENEDICT_ROZA_SHIZGAL_1984"
  | "VALENCIA_MEXICO"
  | "SCHOFIELD_WEIGHT_1985";

export type EnergyMethodCode =
  | PredictiveEnergyFormulaCode
  | "FAO_WHO_UNU_FRAMEWORK"
  | "MANUAL_ENERGY_TARGET"
  | "MEASURED_INDIRECT_CALORIMETRY";

export type EnergyMethodKind =
  | "predictive_equation"
  | "reference_framework"
  | "manual_target"
  | "measured";

export type EnergyReference = {
  authors: string;
  year: number;
  title: string;
  source: string;
  pmid?: string;
  doi?: string;
  url: string;
};

export type EnergyApplicability = {
  population: string;
  minAge?: number;
  maxAge?: number;
  sexScope: "male_and_female";
};

export type EnergyVariantCondition = {
  sex?: EnergySex;
  minAge?: number;
  maxAge?: number;
  minAgeInclusive?: boolean;
  maxAgeInclusive?: boolean;
};

export type LinearEnergyEquation = {
  kind: "linear";
  intercept: number;
  coefficients: Partial<Record<Exclude<EnergyInputKey, "sex">, number>>;
  sourceUnit: "kcal/day" | "MJ/day";
  expression: string;
};

export type EnergyFormulaVariant = {
  code: string;
  label: string;
  when: EnergyVariantCondition;
  equation: LinearEnergyEquation;
};

export type EnergyMethodDefinition = {
  code: EnergyMethodCode;
  name: string;
  shortName: string;
  author: string;
  year: number | null;
  catalogVersion: 1;
  methodVersion: string;
  kind: EnergyMethodKind;
  resultType: "REE" | "BMR" | "energy_target" | "framework";
  resultUnit: "kcal/day" | null;
  requiredInputs: EnergyInputKey[];
  applicability: EnergyApplicability;
  variants: EnergyFormulaVariant[];
  references: EnergyReference[];
  relatedMethodCode?: EnergyMethodCode;
  notes: string[];
  warnings: string[];
  active: boolean;
};

export type EnergyFormulaInput = {
  formulaCode: PredictiveEnergyFormulaCode;
  weightKg?: number | null;
  heightCm?: number | null;
  ageYears?: number | null;
  sex?: EnergySex | null;
};

export type EnergyIssue = {
  code: string;
  message: string;
  input?: EnergyInputKey;
};

export type EnergyFormulaSuccess = {
  ok: true;
  formulaCode: PredictiveEnergyFormulaCode;
  formulaVersion: string;
  variant: string;
  result: number;
  unit: "kcal/day";
  sourceResult?: { value: number; unit: "MJ/day" };
  sourceInputs: Partial<Record<EnergyInputKey, number | EnergySex>>;
  constants: Record<string, number>;
  warnings: EnergyIssue[];
  reference: EnergyReference[];
};

export type EnergyFormulaFailure = {
  ok: false;
  formulaCode: EnergyMethodCode;
  formulaVersion?: string;
  errors: EnergyIssue[];
  warnings: EnergyIssue[];
};

export type EnergyFormulaResult = EnergyFormulaSuccess | EnergyFormulaFailure;

export type ActivityMethodCode =
  | "CLINICAL_ACTIVITY_FACTOR"
  | "PAL_FAO_WHO_UNU";

export type ActivityMethodDefinition = {
  code: ActivityMethodCode;
  name: string;
  methodVersion: string;
  kind: "factor" | "pal";
  includesEta: boolean;
  description: string;
  reference?: EnergyReference;
};

export type ActivityLevelDefinition = {
  methodCode: ActivityMethodCode;
  code: string;
  label: string;
  suggestedFactor?: number;
  minFactor?: number;
  maxFactor?: number;
  displayOrder: number;
};

export type EtaMethodCode = "PERCENT_OF_BASAL";

export type EtaMethodDefinition = {
  code: EtaMethodCode;
  name: string;
  methodVersion: string;
  base: "basal";
  defaultRate: number;
  configurable: true;
};

export type ClinicalActivitySelection = {
  methodCode: "CLINICAL_ACTIVITY_FACTOR";
  levelCode?: string;
  factor?: number;
};

export type PalActivitySelection = {
  methodCode: "PAL_FAO_WHO_UNU";
  levelCode?: string;
  pal: number;
};

export type ActivitySelection = ClinicalActivitySelection | PalActivitySelection;

export type EtaSelection = {
  enabled: boolean;
  methodCode?: EtaMethodCode;
  rate?: number;
};

export type TotalEnergyInput = {
  basalEnergy: number;
  activity: ActivitySelection;
  eta?: EtaSelection;
};

export type TotalEnergySuccess = {
  ok: true;
  basal: number;
  activity: {
    methodCode: ActivityMethodCode;
    methodVersion: string;
    levelCode?: string;
    factorSuggested?: number;
    factorUsed: number;
    factorWasOverridden: boolean;
    energy: number;
    subtotal: number;
    includesEta: boolean;
  };
  eta: {
    methodCode: EtaMethodCode;
    methodVersion: string;
    enabled: boolean;
    applied: boolean;
    integratedInActivity: boolean;
    base: "basal";
    defaultRate: number;
    rateUsed: number;
    rateWasOverridden: boolean;
    value: number;
  };
  total: number;
  calculationMethod: "components" | "pal";
  warnings: EnergyIssue[];
  trace: {
    equation: string;
    inputs: Record<string, string | number | boolean | undefined>;
  };
};

export type TotalEnergyFailure = {
  ok: false;
  errors: EnergyIssue[];
  warnings: EnergyIssue[];
};

export type TotalEnergyResult = TotalEnergySuccess | TotalEnergyFailure;
