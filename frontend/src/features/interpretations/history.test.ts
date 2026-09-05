import { describe, expect, it } from "vitest";
import { restoreSavedCalculations, type SavedCalculationResult } from "./history";

const resultCodes = [
  "bmi",
  "waist_hip_ratio",
  "waist_height_ratio",
  "body_fat_jp3_siri",
  "body_fat_jp7_siri",
  "body_fat_durnin_siri",
  "body_fat_jp7_brozek",
  "fat_mass_jp3_siri",
  "fat_mass_jp7_siri",
  "fat_mass_jp7_brozek",
  "fat_mass_durnin_siri",
  "fat_free_mass_jp3_siri",
  "fat_free_mass_jp7_siri",
  "fat_free_mass_jp7_brozek",
  "fat_free_mass_durnin_siri",
  "somatotype_endomorphy",
  "somatotype_mesomorphy",
  "somatotype_ectomorphy",
  "somatochart_coordinates",
];

const liveEvaluation = (code: string, rawResult = 20) =>
  ({
    item: {
      code,
      name: code,
      category: "other",
      method_version: "current",
      status: "implemented",
      display_order: 1,
      definition: {
        resultName: code,
        methodName: code,
        unit: "%",
        inputs: [],
        dependencies: [],
      },
    },
    state: "calculated",
    inputState: "complete",
    implementationState: "implemented",
    inputs: [],
    rawResult,
    displayedResult: String(rawResult),
    resultValues: { value: rawResult },
    availableCount: 0,
    requiredCount: 0,
    availableMeasurementCount: 0,
    requiredMeasurementCount: 0,
    automaticInputs: [],
    measurementInputs: [],
    missingLabels: [],
    missingMeasurementIdsOutsideWorkspace: [],
    dependencyResults: {},
    dependencyLabels: [],
    dependencyStates: [],
  }) as never;

const savedResult = (code: string, rawResult = 27.8) =>
  ({
    id: `saved-${code}`,
    consultation_id: "consultation",
    calculation_code: code,
    result_key: code,
    method_name: `Histórico ${code}`,
    method_version: "historical",
    raw_result: rawResult,
    displayed_result: String(rawResult),
    unit: "%",
    input_snapshot: {},
    dependency_snapshot: {},
    result_values: { value: rawResult },
    definition_snapshot: {
      resultName: code,
      methodName: `Histórico ${code}`,
      unit: "%",
      inputs: [],
      dependencies: [],
    },
    interpretation_snapshot: null,
  }) as never as SavedCalculationResult;

describe("restoreSavedCalculations", () => {
  const allLive = resultCodes.map((code, index) => liveEvaluation(code, index + 1));

  it("keeps every live valid result when there are no saved calculations", () => {
    const restored = restoreSavedCalculations(allLive, []);

    expect(restored.map((result) => result.item.code)).toEqual(resultCodes);
    expect(restored.every((result) => result.state === "calculated")).toBe(true);
    expect(restored.every((result) => result.rawResult !== undefined)).toBe(true);
  });

  it("keeps JP3, JP7, Durnin, masses and somatotype live when only BMI has a snapshot", () => {
    const restored = restoreSavedCalculations(allLive, [savedResult("bmi")]);

    expect(restored).toHaveLength(resultCodes.length);
    expect(restored.find((result) => result.item.code === "bmi")).toMatchObject({
      rawResult: 27.8,
      displayedResult: "27.8",
      item: { method_version: "historical" },
    });
    expect(
      restored
        .filter((result) => result.item.code !== "bmi")
        .every(
          (result) =>
            result.state === "calculated" && result.rawResult !== undefined,
        ),
    ).toBe(true);
  });

  it("restores complete historical snapshots without changing their values", () => {
    const saved = resultCodes.map((code, index) => savedResult(code, index + 100));
    const restored = restoreSavedCalculations(allLive, saved);

    expect(restored.map((result) => result.rawResult)).toEqual(
      resultCodes.map((_, index) => index + 100),
    );
    expect(restored.every((result) => result.state === "calculated")).toBe(true);
  });
});
