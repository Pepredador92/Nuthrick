export type InterpretationState =
  | "classified"
  | "no_reference"
  | "not_applicable"
  | "missing_context"
  | "requires_decision";
export type ContextCondition = {
  field: string;
  label: string;
  min?: number;
  max?: number;
  minInclusive?: boolean;
  maxInclusive?: boolean;
  equals?: string | boolean;
  oneOf?: string[];
};
export type InterpretationRule = {
  id: string;
  label: string;
  description: string;
  level: number;
  lower: number | null;
  upper: number | null;
  lowerInclusive: boolean;
  upperInclusive: boolean;
  conditions?: ContextCondition[];
};
export type InterpretationReference = {
  id: string;
  version: string;
  resultCode: string;
  name: string;
  organization: string;
  year: number;
  sourceVersion: string;
  title: string;
  url: string;
  locator: string;
  population: string;
  unit: string;
  valueTransform?: "nearest_half";
  isDefault: boolean;
  conditions: ContextCondition[];
  rules: InterpretationRule[];
  notes: string[];
  limitations: string[];
};
export type InterpretationContext = Record<
  string,
  string | number | boolean | null
>;
export type Interpretation = {
  state: InterpretationState;
  resultCode: string;
  value: number;
  evaluatedValue?: number;
  unit: string;
  consultationId: string;
  context: InterpretationContext;
  interpretedAt: string;
  reason: string;
  reference: InterpretationReference | null;
  rule: InterpretationRule | null;
  candidates: string[];
};
