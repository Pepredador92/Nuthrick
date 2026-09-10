import type {
  MacroCode,
  MacroDistribution,
  MacroInputMode,
  MacroReferenceWeightSource,
  PlanMacro,
} from "@/src/types/domain";
import {
  getMacroCatalogEntry,
  MACRO_ENERGY_TOLERANCE_KCAL,
  MACRO_PERCENTAGE_TOLERANCE,
  macroCatalog,
} from "./catalog";

const macroCodes = macroCatalog.map((item) => item.code) as MacroCode[];

const finiteNonNegative = (value: number | null | undefined) =>
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0;

function blankMacro(code: MacroCode): PlanMacro {
  return {
    code,
    input_mode: "percentage",
    input_value: null,
    percentage: null,
    kcal: null,
    grams: null,
    grams_per_kg: null,
  };
}

export function createMacroDistribution(targetEnergyKcal: number, energyWeightKg: number | null): MacroDistribution {
  const referenceWeight = finiteNonNegative(energyWeightKg) && energyWeightKg! > 0 ? energyWeightKg! : null;
  return calculateMacroDistribution({
    version: 1,
    target_energy_kcal: targetEnergyKcal,
    reference_weight_kg: referenceWeight,
    reference_weight_source: referenceWeight === null ? "unavailable" : "energy_calculation",
    reference_weight_override_kg: null,
    macros: Object.fromEntries(macroCodes.map((code) => [code, blankMacro(code)])) as Record<MacroCode, PlanMacro>,
    totals: { percentage: 0, kcal: 0, difference_kcal: targetEnergyKcal },
    complete: false,
    updated_at: new Date().toISOString(),
  });
}

function calculatedMacro(macro: PlanMacro, targetEnergyKcal: number, referenceWeightKg: number | null): PlanMacro {
  const factor = getMacroCatalogEntry(macro.code).kcalPerGram;
  const input = finiteNonNegative(macro.input_value) ? macro.input_value! : null;
  if (input === null || targetEnergyKcal <= 0) return { ...macro, input_value: input, percentage: null, kcal: null, grams: null, grams_per_kg: null };

  let kcal: number | null = null;
  if (macro.input_mode === "percentage") kcal = targetEnergyKcal * input / 100;
  if (macro.input_mode === "grams") kcal = input * factor;
  if (macro.input_mode === "grams_per_kg" && referenceWeightKg !== null) kcal = input * referenceWeightKg * factor;
  if (kcal === null) return { ...macro, input_value: input, percentage: null, kcal: null, grams: null, grams_per_kg: null };

  const grams = kcal / factor;
  return {
    ...macro,
    input_value: input,
    kcal,
    grams,
    percentage: kcal / targetEnergyKcal * 100,
    grams_per_kg: referenceWeightKg && referenceWeightKg > 0 ? grams / referenceWeightKg : null,
  };
}

export function calculateMacroDistribution(draft: MacroDistribution): MacroDistribution {
  const target = finiteNonNegative(draft.target_energy_kcal) ? draft.target_energy_kcal : 0;
  const referenceWeight = finiteNonNegative(draft.reference_weight_kg) && draft.reference_weight_kg! > 0 ? draft.reference_weight_kg! : null;
  const macros = Object.fromEntries(
    macroCodes.map((code) => [code, calculatedMacro(draft.macros[code] ?? blankMacro(code), target, referenceWeight)]),
  ) as Record<MacroCode, PlanMacro>;
  const entries = macroCodes.map((code) => macros[code]);
  const allCalculated = entries.every((macro) => macro.kcal !== null && macro.percentage !== null);
  const totalKcal = entries.reduce((sum, macro) => sum + (macro.kcal ?? 0), 0);
  const totalPercentage = entries.reduce((sum, macro) => sum + (macro.percentage ?? 0), 0);
  const allPercentage = entries.every((macro) => macro.input_mode === "percentage");
  const complete = allCalculated
    && Math.abs(target - totalKcal) <= MACRO_ENERGY_TOLERANCE_KCAL
    && (!allPercentage || Math.abs(totalPercentage - 100) <= MACRO_PERCENTAGE_TOLERANCE);
  return {
    ...draft,
    target_energy_kcal: target,
    reference_weight_kg: referenceWeight,
    reference_weight_source: referenceWeight === null ? "unavailable" : draft.reference_weight_source,
    macros,
    totals: { percentage: totalPercentage, kcal: totalKcal, difference_kcal: target - totalKcal },
    complete,
    updated_at: new Date().toISOString(),
  };
}

export function patchMacroInput(
  distribution: MacroDistribution,
  code: MacroCode,
  inputMode: MacroInputMode,
  inputValue: number | null,
): MacroDistribution {
  return calculateMacroDistribution({
    ...distribution,
    macros: { ...distribution.macros, [code]: { ...distribution.macros[code], input_mode: inputMode, input_value: inputValue } },
  });
}

export function setMacroReferenceWeight(distribution: MacroDistribution, value: number | null): MacroDistribution {
  const valid = finiteNonNegative(value) && value! > 0 ? value! : null;
  return calculateMacroDistribution({
    ...distribution,
    reference_weight_kg: valid,
    reference_weight_source: valid === null ? "unavailable" : "manual",
    reference_weight_override_kg: valid,
  });
}

export function reconcileMacroDistribution(
  distribution: MacroDistribution,
  targetEnergyKcal: number,
  energyWeightKg: number | null,
): MacroDistribution {
  const retainsManualWeight = distribution.reference_weight_source === "manual" && finiteNonNegative(distribution.reference_weight_override_kg) && distribution.reference_weight_override_kg! > 0;
  const referenceWeight = retainsManualWeight
    ? distribution.reference_weight_override_kg
    : (finiteNonNegative(energyWeightKg) && energyWeightKg! > 0 ? energyWeightKg : null);
  const source: MacroReferenceWeightSource = retainsManualWeight ? "manual" : referenceWeight === null ? "unavailable" : "energy_calculation";
  return calculateMacroDistribution({
    ...distribution,
    target_energy_kcal: targetEnergyKcal,
    reference_weight_kg: referenceWeight,
    reference_weight_source: source,
    reference_weight_override_kg: retainsManualWeight ? distribution.reference_weight_override_kg : null,
  });
}

export function restoreEnergyReferenceWeight(distribution: MacroDistribution, energyWeightKg: number | null): MacroDistribution {
  return reconcileMacroDistribution({ ...distribution, reference_weight_source: "energy_calculation", reference_weight_override_kg: null }, distribution.target_energy_kcal, energyWeightKg);
}
