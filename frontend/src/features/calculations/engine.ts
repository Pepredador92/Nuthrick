import type { Consultation, Patient } from "@/src/types/domain";
import type {
  CatalogMeasurement,
  ConsultationMeasurement,
} from "@/src/services/consultationMeasurements";
import { calculateAge } from "@/src/features/patients/patientUtils";
import type {
  CalculationCatalogItem,
  CalculationInputDefinition,
  CalculationInputSource,
} from "./catalog";

export type CalculationState =
  | "insufficient"
  | "partial"
  | "calculated"
  | "not_implemented";

export type ResolvedCalculationInput = CalculationInputDefinition & {
  available: boolean;
  value?: string | number | boolean;
  unit?: string | null;
  measurementId?: string;
  inWorkspace?: boolean;
};

export type CalculationEvaluation = {
  item: CalculationCatalogItem;
  state: CalculationState;
  inputs: ResolvedCalculationInput[];
  availableCount: number;
  requiredCount: number;
  missingLabels: string[];
  missingMeasurementIdsOutsideWorkspace: string[];
  rawResult?: number;
  displayedResult?: string;
  dependencyResults: Record<string, number>;
  dependencyLabels: string[];
};

type EvaluationContext = {
  catalog: CalculationCatalogItem[];
  measurementCatalog: CatalogMeasurement[];
  values: Record<string, string | boolean>;
  workspaceIds: string[];
  consultation: Consultation;
  patient: Patient;
  savedMeasurements?: ConsultationMeasurement[];
};

function usableNumber(value: unknown) {
  if (value === "" || value === undefined || value === null || typeof value === "boolean") return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveInput(input: CalculationInputDefinition, context: EvaluationContext): ResolvedCalculationInput {
  if (input.source === "consultation_measurement") {
    const measurement = context.measurementCatalog.find((item) => item.code === input.measurementCode);
    const parsed = measurement ? usableNumber(context.values[measurement.id]) : undefined;
    const saved = context.savedMeasurements?.find((item) => item.measurement_type_id === measurement?.id);
    return {
      ...input,
      available: parsed !== undefined,
      value: parsed,
      unit: measurement?.unit,
      measurementId: saved?.id,
      inWorkspace: measurement ? context.workspaceIds.includes(measurement.id) : false,
    };
  }
  if (input.source === "patient_record" && input.patientField === "height_cm") {
    const parsed = usableNumber(context.patient.height_cm);
    return { ...input, available: parsed !== undefined, value: parsed, unit: "cm" };
  }
  if (input.source === "patient_record" && input.patientField === "equation_sex") {
    return { ...input, available: Boolean(context.patient.equation_sex), value: context.patient.equation_sex ?? undefined };
  }
  if (input.source === "patient_derived" && input.derivation === "age_at_consultation") {
    const age = calculateAge(context.patient.birth_date, new Date(context.consultation.consultation_date));
    return { ...input, available: age !== null, value: age ?? undefined, unit: "años" };
  }
  return { ...input, available: false };
}

function compute(code: string, values: Record<string, number>) {
  if (code === "bmi") return values.weight / (values.height / 100) ** 2;
  if (code === "waist_hip_ratio") return values.waist / values.hip;
  if (code === "waist_height_ratio") return values.waist / values.height;
  return undefined;
}

function displayResult(value: number, decimalPlaces: number) {
  return Number(value.toFixed(decimalPlaces)).toLocaleString("es-MX", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

export function evaluateCalculationCatalog(context: EvaluationContext): CalculationEvaluation[] {
  const itemByCode = new Map(context.catalog.map((item) => [item.code, item]));
  const memo = new Map<string, CalculationEvaluation>();
  const visiting = new Set<string>();

  const evaluate = (code: string): CalculationEvaluation => {
    const cached = memo.get(code);
    if (cached) return cached;
    const item = itemByCode.get(code)!;
    if (visiting.has(code)) {
      const cyclic: CalculationEvaluation = { item, state: "not_implemented", inputs: [], availableCount: 0, requiredCount: 0, missingLabels: ["Dependencia circular"], missingMeasurementIdsOutsideWorkspace: [], dependencyResults: {}, dependencyLabels: [] };
      memo.set(code, cyclic);
      return cyclic;
    }
    visiting.add(code);
    const inputs = item.definition.inputs.map((input) => resolveInput(input, context));
    const dependencies = item.definition.dependencies.map((dependencyCode) => itemByCode.has(dependencyCode) ? evaluate(dependencyCode) : undefined);
    const dependencyResults = Object.fromEntries(dependencies.flatMap((dependency) => dependency?.state === "calculated" && dependency.rawResult !== undefined ? [[dependency.item.code, dependency.rawResult]] : []));
    const availableCount = inputs.filter((input) => input.available).length + Object.keys(dependencyResults).length;
    const requiredCount = inputs.length + item.definition.dependencies.length;
    const missingLabels = [
      ...inputs.filter((input) => !input.available).map((input) => input.label),
      ...item.definition.dependencies.filter((dependencyCode) => dependencyResults[dependencyCode] === undefined).map((dependencyCode) => itemByCode.get(dependencyCode)?.definition.methodName ?? dependencyCode),
    ];
    const missingMeasurementIdsOutsideWorkspace = inputs
      .filter((input) => input.source === "consultation_measurement" && !input.available && !input.inWorkspace)
      .flatMap((input) => {
        const measurement = context.measurementCatalog.find((item) => item.code === input.measurementCode);
        return measurement ? [measurement.id] : [];
      });
    let state: CalculationState = item.status === "not_implemented" ? "not_implemented" : availableCount === 0 ? "insufficient" : "partial";
    let rawResult: number | undefined;
    if (item.status === "implemented" && requiredCount > 0 && availableCount === requiredCount) {
      const numericInputs = Object.fromEntries(inputs.filter((input) => typeof input.value === "number").map((input) => [input.key, input.value as number]));
      rawResult = compute(item.code, { ...numericInputs, ...dependencyResults });
      if (rawResult !== undefined && Number.isFinite(rawResult)) state = "calculated";
    }
    const result: CalculationEvaluation = {
      item,
      state,
      inputs,
      availableCount,
      requiredCount,
      missingLabels,
      missingMeasurementIdsOutsideWorkspace: [...new Set(missingMeasurementIdsOutsideWorkspace)],
      rawResult,
      displayedResult: rawResult === undefined ? undefined : displayResult(rawResult, item.definition.decimalPlaces),
      dependencyResults,
      dependencyLabels: item.definition.dependencies.map((dependencyCode) => itemByCode.get(dependencyCode)?.definition.methodName ?? dependencyCode),
    };
    visiting.delete(code);
    memo.set(code, result);
    return result;
  };
  return context.catalog.map((item) => evaluate(item.code));
}

export function calculationResultPayload(
  evaluations: CalculationEvaluation[],
  patient: Patient,
  consultation: Consultation,
) {
  const age = calculateAge(patient.birth_date, new Date(consultation.consultation_date));
  return Object.fromEntries(evaluations.flatMap((evaluation) => {
    if (evaluation.state !== "calculated" || evaluation.rawResult === undefined || !evaluation.displayedResult) return [];
    const inputs = Object.fromEntries(evaluation.inputs.map((input) => [input.key, {
      label: input.label,
      source: input.source as CalculationInputSource,
      value: String(input.value),
      unit: input.unit ?? null,
      measurementCode: input.measurementCode,
      measurementId: input.measurementId,
      patientField: input.patientField,
      derivation: input.derivation,
    }]));
    return [[evaluation.item.code, {
      rawResult: evaluation.rawResult,
      displayedResult: evaluation.displayedResult,
      inputs,
      dependencies: evaluation.dependencyResults,
      patientContext: {
        birthDate: patient.birth_date,
        equationSex: patient.equation_sex ?? null,
        age,
        consultationDate: consultation.consultation_date,
      },
    }]];
  }));
}
