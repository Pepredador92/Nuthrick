import { describe, expect, it } from "vitest";
import { calculatePlanEnergy, createPlanEnergyCalculation, isPlanEnergyTargetValid, patchEnergyInput, restoreEnergyInput } from "./model";

const reference = { weightKg: 92, heightCm: 176, ageYears: 46, equationSex: "male" as const, weightSource: "consultation" as const, heightSource: "consultation" as const };

describe("plan energy calculation", () => {
  it("uses the shared engine and preserves the full clinical fixture", () => {
    const initial = createPlanEnergyCalculation(reference);
    const result = calculatePlanEnergy({ ...initial, prescribed_target_kcal: 2000 });
    expect(result.results.basal_kcal).toBe(1795);
    expect(result.results.activity_kcal).toBeCloseTo(359, 10);
    expect(result.results.eta_kcal).toBeCloseTo(179.5, 10);
    expect(result.results.total_kcal).toBeCloseTo(2333.5, 10);
    expect(result.prescribed_target_kcal).toBe(2000);
  });

  it("requires only inputs demanded by the selected equation", () => {
    const initial = createPlanEnergyCalculation({ ...reference, heightCm: null });
    const valencia = calculatePlanEnergy({ ...initial, method_code: "VALENCIA_MEXICO" });
    expect(valencia.results.errors).toEqual([]);
    expect(valencia.results.basal_kcal).not.toBeNull();
  });

  it("keeps an override within the plan and can restore its clinical source", () => {
    const initial = createPlanEnergyCalculation(reference);
    const changed = patchEnergyInput(initial, "weight_kg", 88);
    expect(changed.inputs.weight_kg).toMatchObject({ value: 88, source: "plan_override", original_value: 92 });
    expect(restoreEnergyInput(changed, "weight_kg").inputs.weight_kg).toMatchObject({ value: 92, source: "consultation" });
  });

  it("does not add ETA twice when PAL is selected", () => {
    const initial = createPlanEnergyCalculation(reference);
    const result = calculatePlanEnergy({ ...initial, activity: { method_code: "PAL_FAO_WHO_UNU", level_code: "ACTIVE_MODERATE", factor: null, pal: 1.7 }, eta: { enabled: true, rate: null } });
    expect(result.results.total_kcal).toBeCloseTo(3051.5, 10);
    expect(result.results.eta_kcal).toBe(0);
    expect(result.results.eta_integrated).toBe(true);
  });

  it("accepts a target without a predictive calculation in manual mode", () => {
    const initial = createPlanEnergyCalculation({ weightKg: null, heightCm: null, ageYears: null, equationSex: null });
    const result = calculatePlanEnergy({ ...initial, mode: "manual", method_code: "MANUAL_ENERGY_TARGET", prescribed_target_kcal: 1800 });
    expect(result.results.total_kcal).toBeNull();
    expect(isPlanEnergyTargetValid(result.prescribed_target_kcal)).toBe(true);
  });
});
