import { describe, expect, it } from "vitest";
import {
  MJ_TO_KCAL,
  activityLevelCatalog,
  energyMethodCatalog,
  getEnergyMethod,
  etaMethodCatalog,
} from "./catalog";
import {
  calculateEnergyDefinition,
  calculateEnergyFormula,
  calculateTotalEnergyExpenditure,
} from "./engine";
import type { EnergyFormulaSuccess, TotalEnergyInput } from "./types";

function success(result: ReturnType<typeof calculateEnergyFormula>) {
  expect(result.ok).toBe(true);
  return result as EnergyFormulaSuccess;
}

describe("energy formula catalog", () => {
  it("keeps predictive, framework, manual and measured methods conceptually separate", () => {
    expect(energyMethodCatalog.filter((item) => item.kind === "predictive_equation")).toHaveLength(5);
    expect(getEnergyMethod("FAO_WHO_UNU_FRAMEWORK")?.relatedMethodCode).toBe("SCHOFIELD_WEIGHT_1985");
    expect(getEnergyMethod("MANUAL_ENERGY_TARGET")?.resultType).toBe("energy_target");
    expect(getEnergyMethod("MEASURED_INDIRECT_CALORIMETRY")?.kind).toBe("measured");
  });

  it("does not treat a manual target as a predictive equation", () => {
    const definition = getEnergyMethod("MANUAL_ENERGY_TARGET")!;
    const result = calculateEnergyDefinition(definition, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe("METHOD_DOES_NOT_PREDICT_BASAL_ENERGY");
  });
});

describe("Mifflin–St Jeor 1990", () => {
  it("returns 1795 kcal/day for the required male fixture without rounding", () => {
    const result = success(calculateEnergyFormula({
      formulaCode: "MIFFLIN_ST_JEOR_1990",
      sex: "male",
      ageYears: 46,
      weightKg: 92,
      heightCm: 176,
    }));
    expect(result.result).toBe(1795);
    expect(result.variant).toBe("male");
    expect(result.unit).toBe("kcal/day");
    expect(result.sourceInputs).toEqual({ weightKg: 92, heightCm: 176, ageYears: 46, sex: "male" });
    expect(result.warnings).toEqual([]);
  });

  it("uses the female intercept independently", () => {
    const result = success(calculateEnergyFormula({
      formulaCode: "MIFFLIN_ST_JEOR_1990",
      sex: "female",
      ageYears: 30,
      weightKg: 60,
      heightCm: 165,
    }));
    expect(result.result).toBeCloseTo(1320.25, 10);
    expect(result.variant).toBe("female");
  });

  it.each([19, 78])("accepts original sample boundary age %s without a warning", (ageYears) => {
    const result = success(calculateEnergyFormula({
      formulaCode: "MIFFLIN_ST_JEOR_1990",
      sex: "male",
      ageYears,
      weightKg: 70,
      heightCm: 170,
    }));
    expect(result.warnings).toEqual([]);
  });

  it.each([18, 79])("calculates but warns outside the original age range at %s", (ageYears) => {
    const result = success(calculateEnergyFormula({
      formulaCode: "MIFFLIN_ST_JEOR_1990",
      sex: "female",
      ageYears,
      weightKg: 60,
      heightCm: 165,
    }));
    expect(result.warnings.map((warning) => warning.code)).toContain("AGE_OUTSIDE_ORIGINAL_POPULATION");
  });

  it("returns errors for missing inputs instead of calculating silently", () => {
    const result = calculateEnergyFormula({ formulaCode: "MIFFLIN_ST_JEOR_1990", weightKg: 70 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.input)).toEqual(["heightCm", "ageYears", "sex"]);
  });

  it("rejects invalid weight", () => {
    const result = calculateEnergyFormula({
      formulaCode: "MIFFLIN_ST_JEOR_1990",
      sex: "male",
      ageYears: 30,
      weightKg: 0,
      heightCm: 175,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("VALUE_MUST_BE_POSITIVE");
  });
});

describe("Harris–Benedict methods", () => {
  it.each([
    ["HARRIS_BENEDICT_ORIGINAL_1919", "male", 66.473 + 13.7516 * 92 + 5.0033 * 176 - 6.755 * 46],
    ["HARRIS_BENEDICT_ORIGINAL_1919", "female", 655.0955 + 9.5634 * 92 + 1.8496 * 176 - 4.6756 * 46],
    ["HARRIS_BENEDICT_ROZA_SHIZGAL_1984", "male", 88.362 + 13.397 * 92 + 4.799 * 176 - 5.677 * 46],
    ["HARRIS_BENEDICT_ROZA_SHIZGAL_1984", "female", 447.593 + 9.247 * 92 + 3.098 * 176 - 4.33 * 46],
  ] as const)("calculates %s for %s with its own coefficients", (formulaCode, sex, expected) => {
    const result = success(calculateEnergyFormula({ formulaCode, sex, ageYears: 46, weightKg: 92, heightCm: 176 }));
    expect(result.result).toBeCloseTo(expected, 10);
    expect(result.variant).toBe(sex);
  });
});

describe("Valencia Mexico variants", () => {
  it.each([
    ["male", 18, "MALE_18_30", 13.37, 747],
    ["male", 30, "MALE_30_60", 13.08, 693],
    ["male", 61, "MALE_OVER_60", 14.21, 429],
    ["female", 18, "FEMALE_18_30", 11.02, 679],
    ["female", 30, "FEMALE_30_60", 10.92, 677],
    ["female", 61, "FEMALE_OVER_60", 10.98, 520],
  ] as const)("selects %s age %s as %s", (sex, ageYears, variant, coefficient, intercept) => {
    const result = success(calculateEnergyFormula({
      formulaCode: "VALENCIA_MEXICO",
      sex,
      ageYears,
      weightKg: 70,
    }));
    expect(result.variant).toBe(variant);
    expect(result.result).toBeCloseTo(coefficient * 70 + intercept, 10);
  });

  it("does not extrapolate an adult variant to a minor", () => {
    const result = calculateEnergyFormula({
      formulaCode: "VALENCIA_MEXICO",
      sex: "female",
      ageYears: 17,
      weightKg: 55,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe("NO_APPLICABLE_VARIANT");
  });
});

describe("Schofield weight 1985", () => {
  it.each([
    ["male", 2.9, "MALE_0_3", 0.249, -0.127],
    ["male", 3, "MALE_3_10", 0.095, 2.11],
    ["male", 10, "MALE_10_18", 0.074, 2.754],
    ["male", 18, "MALE_18_30", 0.063, 2.896],
    ["male", 30, "MALE_30_60", 0.048, 3.653],
    ["male", 60, "MALE_60_PLUS", 0.049, 2.459],
    ["female", 2.9, "FEMALE_0_3", 0.244, -0.13],
    ["female", 3, "FEMALE_3_10", 0.085, 2.033],
    ["female", 10, "FEMALE_10_18", 0.056, 2.898],
    ["female", 18, "FEMALE_18_30", 0.062, 2.036],
    ["female", 30, "FEMALE_30_60", 0.034, 3.538],
    ["female", 60, "FEMALE_60_PLUS", 0.038, 2.755],
  ] as const)("selects %s age %s as %s", (sex, ageYears, variant, coefficient, intercept) => {
    const result = success(calculateEnergyFormula({
      formulaCode: "SCHOFIELD_WEIGHT_1985",
      sex,
      ageYears,
      weightKg: 50,
    }));
    const expectedMj = coefficient * 50 + intercept;
    expect(result.variant).toBe(variant);
    expect(result.sourceResult).toEqual({ value: expectedMj, unit: "MJ/day" });
    expect(result.result).toBeCloseTo(expectedMj * MJ_TO_KCAL, 10);
    expect(result.constants.MJ_TO_KCAL).toBe(MJ_TO_KCAL);
  });
});

describe("activity, ETA and total expenditure", () => {
  it("keeps configurable defaults in catalogs", () => {
    expect(activityLevelCatalog.find((level) => level.code === "SEDENTARY")?.suggestedFactor).toBe(1.2);
    expect(etaMethodCatalog[0].defaultRate).toBe(0.1);
    expect(activityLevelCatalog.filter((level) => level.methodCode === "PAL_FAO_WHO_UNU").every((level) => level.suggestedFactor === undefined)).toBe(true);
    expect(activityLevelCatalog.filter((level) => level.methodCode === "PAL_FAO_WHO_UNU").map((level) => [level.minFactor, level.maxFactor])).toEqual([
      [1.4, 1.69],
      [1.7, 1.99],
      [2, 2.4],
    ]);
  });

  it("calculates the required clinical example by components", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1795,
      activity: { methodCode: "CLINICAL_ACTIVITY_FACTOR", levelCode: "SEDENTARY" },
      eta: { enabled: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.factorSuggested).toBe(1.2);
    expect(result.activity.factorUsed).toBe(1.2);
    expect(result.activity.factorWasOverridden).toBe(false);
    expect(result.activity.energy).toBeCloseTo(359, 10);
    expect(result.activity.subtotal).toBeCloseTo(2154, 10);
    expect(result.eta.rateUsed).toBe(0.1);
    expect(result.eta.value).toBeCloseTo(179.5, 10);
    expect(result.total).toBeCloseTo(2333.5, 10);
    expect(result.calculationMethod).toBe("components");
  });

  it("records suggested, used and overridden activity factors", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1500,
      activity: { methodCode: "CLINICAL_ACTIVITY_FACTOR", levelCode: "LIGHT", factor: 1.4 },
      eta: { enabled: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activity.factorSuggested).toBe(1.375);
    expect(result.activity.factorUsed).toBe(1.4);
    expect(result.activity.factorWasOverridden).toBe(true);
  });

  it("uses an explicit PAL without choosing a hidden midpoint", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1795,
      activity: { methodCode: "PAL_FAO_WHO_UNU", levelCode: "ACTIVE_MODERATE", pal: 1.7 },
      eta: { enabled: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBeCloseTo(3051.5, 10);
    expect(result.calculationMethod).toBe("pal");
    expect(result.activity.includesEta).toBe(true);
    expect(result.activity.levelCode).toBe("ACTIVE_MODERATE");
  });

  it("warns when an explicit PAL does not belong to its selected catalog range", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1600,
      activity: { methodCode: "PAL_FAO_WHO_UNU", levelCode: "SEDENTARY_LIGHT", pal: 1.8 },
      eta: { enabled: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.code)).toContain("PAL_OUTSIDE_SELECTED_LEVEL");
  });

  it("rejects unknown activity levels instead of losing their provenance", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1600,
      activity: { methodCode: "CLINICAL_ACTIVITY_FACTOR", levelCode: "UNKNOWN", factor: 1.3 },
      eta: { enabled: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe("UNKNOWN_ACTIVITY_LEVEL");
  });

  it("prevents double ETA when PAL already includes it", () => {
    const result = calculateTotalEnergyExpenditure({
      basalEnergy: 1795,
      activity: { methodCode: "PAL_FAO_WHO_UNU", pal: 1.7 },
      eta: { enabled: true, rate: 0.1 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eta.enabled).toBe(true);
    expect(result.eta.applied).toBe(false);
    expect(result.eta.integratedInActivity).toBe(true);
    expect(result.eta.value).toBe(0);
    expect(result.total).toBeCloseTo(1795 * 1.7, 10);
    expect(result.warnings.map((warning) => warning.code)).toContain("ETA_ALREADY_INCLUDED");
  });

  it("rejects a runtime payload that tries to mix factor and PAL", () => {
    const invalid = {
      basalEnergy: 1795,
      activity: { methodCode: "PAL_FAO_WHO_UNU", pal: 1.7, factor: 1.2 },
      eta: { enabled: true },
    } as unknown as TotalEnergyInput;
    const result = calculateTotalEnergyExpenditure(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].code).toBe("MULTIPLE_ACTIVITY_METHODS");
  });
});
