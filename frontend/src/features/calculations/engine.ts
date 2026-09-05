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
import { calculateFormula } from "./mathematics";

export type CalculationState =
  | "insufficient"
  | "partial"
  | "calculated"
  | "not_implemented";

export type CalculationInputState = "empty" | "partial" | "complete";
export type CalculationImplementationState = "implemented" | "pending";

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
  inputState: CalculationInputState;
  implementationState: CalculationImplementationState;
  inputs: ResolvedCalculationInput[];
  activeVariant?: string;
  activeEquation?: string;
  activePopulation?: string;
  availableCount: number;
  requiredCount: number;
  availableMeasurementCount: number;
  requiredMeasurementCount: number;
  automaticInputs: ResolvedCalculationInput[];
  measurementInputs: ResolvedCalculationInput[];
  missingLabels: string[];
  missingMeasurementIdsOutsideWorkspace: string[];
  rawResult?: number;
  resultValues?: Record<string, number>;
  displayedResult?: string;
  dependencyResults: Record<string, number>;
  dependencyLabels: string[];
  dependencyStates: Array<{
    code: string;
    label: string;
    implementationState: CalculationImplementationState;
    inputState: CalculationInputState;
    resultAvailable: boolean;
  }>;
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
  if (input.source === "patient_record" && input.patientField === "lee_population_group") {
    return { ...input, available: false };
  }
  if (input.source === "patient_derived" && input.derivation === "age_at_consultation") {
    const age = calculateAge(context.patient.birth_date, new Date(context.consultation.consultation_date));
    return { ...input, available: age !== null, value: age ?? undefined, unit: "años" };
  }
  return { ...input, available: false };
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
      const cyclic: CalculationEvaluation = { item, state: "not_implemented", inputState: "empty", implementationState: "pending", inputs: [], availableCount: 0, requiredCount: 0, availableMeasurementCount: 0, requiredMeasurementCount: 0, automaticInputs: [], measurementInputs: [], missingLabels: ["Dependencia circular"], missingMeasurementIdsOutsideWorkspace: [], dependencyResults: {}, dependencyLabels: [], dependencyStates: [] };
      memo.set(code, cyclic);
      return cyclic;
    }
    visiting.add(code);
    const matchingVariant = item.definition.variants?.find((variant) => {
      const rule = variant.appliesWhen;
      if (!rule) return false;
      if (rule.equationSex && context.patient.equation_sex !== rule.equationSex) return false;
      const age = calculateAge(context.patient.birth_date, new Date(context.consultation.consultation_date));
      if (rule.ageMin !== undefined && (age === null || age < rule.ageMin)) return false;
      if (rule.ageMax !== undefined && (age === null || age > rule.ageMax)) return false;
      return true;
    });
    const definitionInputs = [...item.definition.inputs, ...(matchingVariant?.inputs ?? [])];
    const inputs = definitionInputs.map((input) => resolveInput(input, context));
    const dependencies = item.definition.dependencies.map((dependencyCode) => itemByCode.has(dependencyCode) ? evaluate(dependencyCode) : undefined);
    const dependencyResults = Object.fromEntries(dependencies.flatMap((dependency) => dependency?.state === "calculated" && dependency.rawResult !== undefined ? [[dependency.item.code, dependency.rawResult]] : []));
    const measurementInputs = inputs.filter((input) => input.source === "consultation_measurement");
    const automaticInputs = inputs.filter((input) => input.source === "patient_record" || input.source === "patient_derived");
    const availableCount = inputs.filter((input) => input.available).length + Object.keys(dependencyResults).length;
    const requiredCount = inputs.length + item.definition.dependencies.length;
    const missingLabels = [
      ...inputs.filter((input) => !input.available).map((input) => input.label),
      ...item.definition.dependencies.filter((dependencyCode) => dependencyResults[dependencyCode] === undefined).map((dependencyCode) => itemByCode.get(dependencyCode)?.definition.methodName ?? dependencyCode),
      ...(item.definition.variants?.length && !matchingVariant ? ["Contexto fuera del rango de aplicación"] : []),
    ];
    const missingMeasurementIdsOutsideWorkspace = inputs
      .filter((input) => input.source === "consultation_measurement" && !input.available && !input.inWorkspace)
      .flatMap((input) => {
        const measurement = context.measurementCatalog.find((item) => item.code === input.measurementCode);
        return measurement ? [measurement.id] : [];
      });
    const inputState: CalculationInputState = requiredCount > 0 && availableCount === requiredCount ? "complete" : availableCount === 0 ? "empty" : "partial";
    const implementationState: CalculationImplementationState = item.status === "implemented" ? "implemented" : "pending";
    let state: CalculationState = item.status === "not_implemented" ? "not_implemented" : availableCount === 0 ? "insufficient" : "partial";
    let rawResult: number | undefined;
    let resultValues: Record<string, number> | undefined;
    if (item.status === "implemented" && requiredCount > 0 && availableCount === requiredCount && (!item.definition.variants?.length || matchingVariant)) {
      const numericInputs = Object.fromEntries(inputs.flatMap((input) => {
        if (typeof input.value === "number") return [[input.key, input.value]];
        if (input.key === "sex" && input.value === "male") return [[input.key, 1]];
        if (input.key === "sex" && input.value === "female") return [[input.key, 0]];
        return [];
      }));
      const calculation = calculateFormula(item.code, { ...numericInputs, ...dependencyResults });
      rawResult = calculation?.rawResult;
      resultValues = calculation?.resultValues;
      if (rawResult !== undefined && Number.isFinite(rawResult)) state = "calculated";
    }
    const result: CalculationEvaluation = {
      item,
      state,
      inputState,
      implementationState,
      inputs,
      activeVariant: matchingVariant?.name,
      activeEquation: matchingVariant?.equation?.expression,
      activePopulation: matchingVariant?.applicability?.population,
      availableCount,
      requiredCount,
      availableMeasurementCount: measurementInputs.filter((input) => input.available).length,
      requiredMeasurementCount: measurementInputs.length,
      automaticInputs,
      measurementInputs,
      missingLabels,
      missingMeasurementIdsOutsideWorkspace: [...new Set(missingMeasurementIdsOutsideWorkspace)],
      rawResult,
      resultValues,
      displayedResult: rawResult === undefined ? undefined : resultValues?.x !== undefined && resultValues.y !== undefined
        ? `X: ${displayResult(resultValues.x, item.definition.decimalPlaces)} · Y: ${displayResult(resultValues.y, item.definition.decimalPlaces)}`
        : displayResult(rawResult, item.definition.decimalPlaces),
      dependencyResults,
      dependencyLabels: item.definition.dependencies.map((dependencyCode) => itemByCode.get(dependencyCode)?.definition.methodName ?? dependencyCode),
      dependencyStates: item.definition.dependencies.map((dependencyCode) => {
        const dependency = memo.get(dependencyCode);
        return {
          code: dependencyCode,
          label: itemByCode.get(dependencyCode)?.definition.methodName ?? dependencyCode,
          implementationState: dependency?.implementationState ?? "pending",
          inputState: dependency?.inputState ?? "empty",
          resultAvailable: dependency?.state === "calculated",
        };
      }),
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
      resultValues: evaluation.resultValues ?? {},
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
