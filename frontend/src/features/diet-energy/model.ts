import {
  calculateEnergyFormula,
  calculateTotalEnergyExpenditure,
  getEnergyMethod,
} from "@/src/features/energy";
import type { EnergyIssue, EnergySex, PredictiveEnergyFormulaCode } from "@/src/features/energy";
import type { PlanEnergyCalculation, PlanEnergyValue, PlanEnergyValueSource } from "@/src/types/domain";

export type EnergyReferenceContext = {
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  equationSex: EnergySex | null;
  weightSource?: "consultation" | "patient";
  heightSource?: "consultation" | "patient";
};

const sourceLabel: Record<PlanEnergyValueSource, string> = {
  consultation: "Consulta fuente",
  patient: "Ficha del paciente",
  plan_override: "Ajuste de este plan",
  manual: "Captura para este plan",
};

const predictiveMethod = (code: string) => getEnergyMethod(code)?.kind === "predictive_equation";

function sourceValue<T>(
  value: T | null,
  source: PlanEnergyValueSource,
): PlanEnergyValue<T> {
  return { value, source, source_label: sourceLabel[source] };
}

function issue(issue: EnergyIssue) {
  return { code: issue.code, message: issue.message, ...(issue.input ? { input: issue.input } : {}) };
}

export function createPlanEnergyCalculation(reference: EnergyReferenceContext): PlanEnergyCalculation {
  return calculatePlanEnergy({
    version: 1,
    mode: "predictive",
    method_code: "MIFFLIN_ST_JEOR_1990",
    inputs: {
      weight_kg: sourceValue(reference.weightKg, reference.weightKg === null ? "manual" : reference.weightSource ?? "consultation"),
      height_cm: sourceValue(reference.heightCm, reference.heightCm === null ? "manual" : reference.heightSource ?? "consultation"),
      age_years: sourceValue(reference.ageYears, reference.ageYears === null ? "manual" : "patient"),
      equation_sex: sourceValue(reference.equationSex, reference.equationSex === null ? "manual" : "patient"),
    },
    activity: { method_code: "CLINICAL_ACTIVITY_FACTOR", level_code: "SEDENTARY", factor: null, pal: null },
    eta: { enabled: true, rate: null },
    measured: { kcal_per_day: null, measured_at: null, equipment: null },
    prescribed_target_kcal: null,
    results: emptyResults(),
    calculated_at: new Date().toISOString(),
  });
}

function emptyResults(): PlanEnergyCalculation["results"] {
  return {
    basal_kcal: null,
    total_kcal: null,
    formula_version: null,
    variant: null,
    activity_kcal: null,
    eta_kcal: null,
    eta_integrated: false,
    warnings: [],
    errors: [],
  };
}

export function calculatePlanEnergy(draft: Omit<PlanEnergyCalculation, "results" | "calculated_at"> | PlanEnergyCalculation): PlanEnergyCalculation {
  const base = { ...draft, calculated_at: new Date().toISOString() };
  if (base.mode === "manual") return { ...base, results: emptyResults() };

  let basal: number | null = null;
  let formulaVersion: string | null = null;
  let variant: string | null = null;
  let warnings: EnergyIssue[] = [];
  let errors: EnergyIssue[] = [];

  if (base.mode === "measured") {
    const value = base.measured.kcal_per_day;
    if (value === null || !Number.isFinite(value) || value <= 0) {
      errors.push({ code: "MEASURED_ENERGY_REQUIRED", message: "Registra un gasto medido mayor que cero." });
    } else {
      basal = value;
      formulaVersion = "medido";
      variant = "calorimetría indirecta";
    }
  } else if (predictiveMethod(base.method_code)) {
    const formula = calculateEnergyFormula({
      formulaCode: base.method_code as PredictiveEnergyFormulaCode,
      weightKg: base.inputs.weight_kg.value,
      heightCm: base.inputs.height_cm.value,
      ageYears: base.inputs.age_years.value,
      sex: base.inputs.equation_sex.value,
    });
    warnings = [...formula.warnings];
    if (!formula.ok) errors = formula.errors;
    else {
      basal = formula.result;
      formulaVersion = formula.formulaVersion;
      variant = formula.variant;
    }
  } else {
    errors.push({ code: "INVALID_ENERGY_METHOD", message: "Selecciona una ecuación, una medición o un objetivo manual." });
  }

  if (basal === null) {
    return {
      ...base,
      results: { ...emptyResults(), formula_version: formulaVersion, variant, warnings: warnings.map(issue), errors: errors.map(issue) },
    };
  }

  const total = calculateTotalEnergyExpenditure({
    basalEnergy: basal,
    activity: base.activity.method_code === "PAL_FAO_WHO_UNU"
      ? { methodCode: "PAL_FAO_WHO_UNU", levelCode: base.activity.level_code ?? undefined, pal: base.activity.pal ?? Number.NaN }
      : { methodCode: "CLINICAL_ACTIVITY_FACTOR", levelCode: base.activity.level_code ?? undefined, ...(base.activity.factor === null ? {} : { factor: base.activity.factor }) },
    eta: { enabled: base.eta.enabled, ...(base.eta.rate === null ? {} : { rate: base.eta.rate }) },
  });
  warnings = [...warnings, ...total.warnings];
  if (!total.ok) errors = [...errors, ...total.errors];

  return {
    ...base,
    results: {
      basal_kcal: basal,
      total_kcal: total.ok ? total.total : null,
      formula_version: formulaVersion,
      variant,
      activity_kcal: total.ok ? total.activity.energy : null,
      eta_kcal: total.ok ? total.eta.value : null,
      eta_integrated: total.ok ? total.eta.integratedInActivity : false,
      warnings: warnings.map(issue),
      errors: errors.map(issue),
    },
  };
}

export function patchEnergyInput<T>(
  draft: PlanEnergyCalculation,
  key: keyof PlanEnergyCalculation["inputs"],
  value: T | null,
): PlanEnergyCalculation {
  const existing = draft.inputs[key] as PlanEnergyValue<T>;
  return calculatePlanEnergy({
    ...draft,
    inputs: {
      ...draft.inputs,
      [key]: {
        value,
        source: "plan_override",
        source_label: sourceLabel.plan_override,
        original_value: existing.original_value ?? existing.value,
        original_source: existing.original_source ?? existing.source,
        original_source_label: existing.original_source_label ?? existing.source_label,
      },
    },
  });
}

export function restoreEnergyInput(
  draft: PlanEnergyCalculation,
  key: keyof PlanEnergyCalculation["inputs"],
): PlanEnergyCalculation {
  const existing = draft.inputs[key];
  if (existing.source !== "plan_override") return draft;
  const originalSource = existing.original_source ?? (key === "age_years" || key === "equation_sex" ? "patient" : "consultation");
  return calculatePlanEnergy({
    ...draft,
    inputs: {
      ...draft.inputs,
      [key]: { value: existing.original_value ?? null, source: originalSource, source_label: existing.original_source_label ?? sourceLabel[originalSource] },
    },
  });
}

export function isPlanEnergyTargetValid(target: number | null) {
  return target !== null && Number.isFinite(target) && target > 0 && target <= 10_000;
}
