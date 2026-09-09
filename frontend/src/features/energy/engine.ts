import {
  MJ_TO_KCAL,
  getActivityLevel,
  getActivityMethod,
  getEnergyMethod,
  getEtaMethod,
} from "./catalog";
import type {
  EnergyFormulaFailure,
  EnergyFormulaInput,
  EnergyFormulaResult,
  EnergyFormulaSuccess,
  EnergyInputKey,
  EnergyIssue,
  EnergyMethodDefinition,
  EnergySex,
  EnergyVariantCondition,
  TotalEnergyInput,
  TotalEnergyResult,
} from "./types";

const inputLabels: Record<EnergyInputKey, string> = {
  weightKg: "peso",
  heightCm: "talla",
  ageYears: "edad",
  sex: "sexo para la ecuación",
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function conditionMatches(
  condition: EnergyVariantCondition,
  sex: EnergySex,
  ageYears: number,
) {
  if (condition.sex && condition.sex !== sex) return false;
  if (condition.minAge !== undefined) {
    const inclusive = condition.minAgeInclusive !== false;
    if (inclusive ? ageYears < condition.minAge : ageYears <= condition.minAge) return false;
  }
  if (condition.maxAge !== undefined) {
    const inclusive = condition.maxAgeInclusive !== false;
    if (inclusive ? ageYears > condition.maxAge : ageYears >= condition.maxAge) return false;
  }
  return true;
}

function validateFormulaInputs(
  definition: EnergyMethodDefinition,
  input: Omit<EnergyFormulaInput, "formulaCode">,
) {
  const errors: EnergyIssue[] = [];
  for (const key of definition.requiredInputs) {
    const value = input[key];
    if (value === null || value === undefined) {
      errors.push({ code: "REQUIRED_INPUT_MISSING", input: key, message: `Falta ${inputLabels[key]}.` });
      continue;
    }
    if (key === "sex") {
      if (value !== "male" && value !== "female")
        errors.push({ code: "INVALID_SEX", input: key, message: "El sexo para la ecuación debe ser hombre o mujer." });
      continue;
    }
    if (!finiteNumber(value)) {
      errors.push({ code: "INVALID_NUMBER", input: key, message: `${inputLabels[key]} debe ser un número válido.` });
      continue;
    }
    if ((key === "weightKg" || key === "heightCm") && value <= 0)
      errors.push({ code: "VALUE_MUST_BE_POSITIVE", input: key, message: `${inputLabels[key]} debe ser mayor que cero.` });
    if (key === "ageYears" && value < 0)
      errors.push({ code: "INVALID_AGE", input: key, message: "La edad no puede ser negativa." });
  }
  return errors;
}

function applicabilityWarnings(definition: EnergyMethodDefinition, ageYears: number) {
  const warnings: EnergyIssue[] = [];
  const { minAge, maxAge } = definition.applicability;
  if ((minAge !== undefined && ageYears < minAge) || (maxAge !== undefined && ageYears > maxAge)) {
    warnings.push({
      code: "AGE_OUTSIDE_ORIGINAL_POPULATION",
      input: "ageYears",
      message: `Edad fuera de la población original de validación de ${definition.shortName}.`,
    });
  }
  return warnings;
}

function failure(
  definition: EnergyMethodDefinition,
  errors: EnergyIssue[],
  warnings: EnergyIssue[] = [],
): EnergyFormulaFailure {
  return {
    ok: false,
    formulaCode: definition.code,
    formulaVersion: definition.methodVersion,
    errors,
    warnings,
  };
}

/**
 * Interprets a predictive catalog definition. Adding another linear equation
 * or age/sex variant only requires a catalog entry, not another engine branch.
 */
export function calculateEnergyDefinition(
  definition: EnergyMethodDefinition,
  input: Omit<EnergyFormulaInput, "formulaCode">,
): EnergyFormulaResult {
  if (definition.kind !== "predictive_equation") {
    return failure(definition, [{
      code: "METHOD_DOES_NOT_PREDICT_BASAL_ENERGY",
      message: `${definition.shortName} no es una ecuación predictiva de gasto basal.`,
    }]);
  }
  const errors = validateFormulaInputs(definition, input);
  if (errors.length) return failure(definition, errors);

  const sex = input.sex as EnergySex;
  const ageYears = input.ageYears as number;
  const variant = definition.variants.find((candidate) => conditionMatches(candidate.when, sex, ageYears));
  if (!variant) {
    return failure(definition, [{
      code: "NO_APPLICABLE_VARIANT",
      message: `No existe una variante de ${definition.shortName} para la edad y sexo indicados.`,
    }]);
  }

  let sourceResult = variant.equation.intercept;
  for (const [key, coefficient] of Object.entries(variant.equation.coefficients)) {
    const value = input[key as EnergyInputKey];
    if (!finiteNumber(value)) {
      return failure(definition, [{
        code: "EQUATION_INPUT_UNAVAILABLE",
        input: key as EnergyInputKey,
        message: `No se pudo resolver ${inputLabels[key as EnergyInputKey]} para la ecuación.`,
      }]);
    }
    sourceResult += coefficient * value;
  }

  if (!Number.isFinite(sourceResult) || sourceResult <= 0) {
    return failure(definition, [{
      code: "INVALID_CALCULATION_RESULT",
      message: "La ecuación produjo un resultado no válido con los datos proporcionados.",
    }]);
  }

  const converted = variant.equation.sourceUnit === "MJ/day";
  const result = converted ? sourceResult * MJ_TO_KCAL : sourceResult;
  const sourceInputs = Object.fromEntries(
    definition.requiredInputs.map((key) => [key, input[key] as number | EnergySex]),
  ) as EnergyFormulaSuccess["sourceInputs"];

  return {
    ok: true,
    formulaCode: definition.code as EnergyFormulaSuccess["formulaCode"],
    formulaVersion: definition.methodVersion,
    variant: variant.code,
    result,
    unit: "kcal/day",
    sourceResult: converted ? { value: sourceResult, unit: "MJ/day" } : undefined,
    sourceInputs,
    constants: converted ? { MJ_TO_KCAL } : {},
    warnings: applicabilityWarnings(definition, ageYears),
    reference: definition.references,
  };
}

export function calculateEnergyFormula(input: EnergyFormulaInput): EnergyFormulaResult {
  const definition = getEnergyMethod(input.formulaCode);
  if (!definition) {
    return {
      ok: false,
      formulaCode: input.formulaCode,
      errors: [{ code: "UNKNOWN_FORMULA", message: "La fórmula energética no existe en el catálogo." }],
      warnings: [],
    };
  }
  return calculateEnergyDefinition(definition, input);
}

function totalFailure(errors: EnergyIssue[], warnings: EnergyIssue[] = []): TotalEnergyResult {
  return { ok: false, errors, warnings };
}

/**
 * Calculates expenditure after basal energy. Activity is a discriminated union,
 * so factor and PAL cannot be supplied as two simultaneous methods.
 */
export function calculateTotalEnergyExpenditure(input: TotalEnergyInput): TotalEnergyResult {
  if (!finiteNumber(input.basalEnergy) || input.basalEnergy <= 0)
    return totalFailure([{ code: "INVALID_BASAL_ENERGY", message: "El gasto basal debe ser mayor que cero." }]);

  const activityMethod = getActivityMethod(input.activity.methodCode);
  const etaMethod = getEtaMethod(input.eta?.methodCode);
  if (!activityMethod)
    return totalFailure([{ code: "UNKNOWN_ACTIVITY_METHOD", message: "El método de actividad no existe en el catálogo." }]);
  if (!etaMethod)
    return totalFailure([{ code: "UNKNOWN_ETA_METHOD", message: "El método de ETA no existe en el catálogo." }]);

  const activityRecord = input.activity as unknown as Record<string, unknown>;
  if (activityRecord.factor !== undefined && activityRecord.pal !== undefined) {
    return totalFailure([{ code: "MULTIPLE_ACTIVITY_METHODS", message: "No se puede aplicar factor clínico y PAL simultáneamente." }]);
  }

  const etaEnabled = input.eta?.enabled ?? false;
  const etaRate = input.eta?.rate ?? etaMethod.defaultRate;
  if (!finiteNumber(etaRate) || etaRate < 0 || etaRate > 1)
    return totalFailure([{ code: "INVALID_ETA_RATE", message: "La tasa de ETA debe estar entre 0 y 1." }]);

  const warnings: EnergyIssue[] = [];
  let factorUsed: number;
  let factorSuggested: number | undefined;
  let factorWasOverridden = false;
  let levelCode: string | undefined;

  if (input.activity.methodCode === "CLINICAL_ACTIVITY_FACTOR") {
    levelCode = input.activity.levelCode;
    const level = getActivityLevel(input.activity.methodCode, levelCode);
    if (levelCode && !level)
      return totalFailure([{ code: "UNKNOWN_ACTIVITY_LEVEL", message: "El nivel de actividad no existe en el catálogo del método seleccionado." }]);
    factorSuggested = level?.suggestedFactor;
    factorUsed = input.activity.factor ?? factorSuggested ?? Number.NaN;
    if (!finiteNumber(factorUsed) || factorUsed < 1)
      return totalFailure([{ code: "INVALID_ACTIVITY_FACTOR", message: "El factor clínico debe ser igual o mayor que 1." }]);
    factorWasOverridden = factorSuggested !== undefined && input.activity.factor !== undefined && input.activity.factor !== factorSuggested;
  } else {
    levelCode = input.activity.levelCode;
    const level = getActivityLevel(input.activity.methodCode, levelCode);
    if (levelCode && !level)
      return totalFailure([{ code: "UNKNOWN_ACTIVITY_LEVEL", message: "El rango PAL no existe en el catálogo del método seleccionado." }]);
    factorUsed = input.activity.pal;
    if (!finiteNumber(factorUsed) || factorUsed < 1)
      return totalFailure([{ code: "INVALID_PAL", message: "El PAL debe ser un número igual o mayor que 1." }]);
    if (factorUsed < 1.4 || factorUsed > 2.4) {
      warnings.push({
        code: "PAL_OUTSIDE_GENERAL_ADULT_RANGE",
        message: "El PAL está fuera del rango general 1.40–2.40 descrito para adultos; revisa su aplicabilidad.",
      });
    }
    if (
      level
      && level.minFactor !== undefined
      && level.maxFactor !== undefined
      && (factorUsed < level.minFactor || factorUsed > level.maxFactor)
    ) {
      warnings.push({
        code: "PAL_OUTSIDE_SELECTED_LEVEL",
        message: `El PAL introducido está fuera del rango ${level.minFactor.toFixed(2)}–${level.maxFactor.toFixed(2)} del nivel seleccionado.`,
      });
    }
  }

  const subtotal = input.basalEnergy * factorUsed;
  const activityEnergy = subtotal - input.basalEnergy;
  const etaIntegrated = activityMethod.includesEta;
  const etaApplied = etaEnabled && !etaIntegrated;
  const etaValue = etaApplied ? input.basalEnergy * etaRate : 0;
  if (etaEnabled && etaIntegrated) {
    warnings.push({
      code: "ETA_ALREADY_INCLUDED",
      message: "No se sumó ETA porque el método PAL ya representa TEE/BMR y la integra.",
    });
  }
  const total = subtotal + etaValue;

  return {
    ok: true,
    basal: input.basalEnergy,
    activity: {
      methodCode: activityMethod.code,
      methodVersion: activityMethod.methodVersion,
      levelCode,
      factorSuggested,
      factorUsed,
      factorWasOverridden,
      energy: activityEnergy,
      subtotal,
      includesEta: activityMethod.includesEta,
    },
    eta: {
      methodCode: etaMethod.code,
      methodVersion: etaMethod.methodVersion,
      enabled: etaEnabled,
      applied: etaApplied,
      integratedInActivity: etaIntegrated,
      base: etaMethod.base,
      defaultRate: etaMethod.defaultRate,
      rateUsed: etaRate,
      rateWasOverridden: input.eta?.rate !== undefined && input.eta.rate !== etaMethod.defaultRate,
      value: etaValue,
    },
    total,
    calculationMethod: activityMethod.kind === "pal" ? "pal" : "components",
    warnings,
    trace: {
      equation: activityMethod.kind === "pal"
        ? "GET = gasto_basal × PAL"
        : etaApplied
          ? "GET = gasto_basal + actividad + ETA"
          : "GET = gasto_basal + actividad",
      inputs: {
        basalEnergy: input.basalEnergy,
        activityMethod: activityMethod.code,
        levelCode,
        factorSuggested,
        factorUsed,
        factorWasOverridden,
        etaMethod: etaMethod.code,
        etaEnabled,
        etaRate,
        etaIntegrated,
      },
    },
  };
}
