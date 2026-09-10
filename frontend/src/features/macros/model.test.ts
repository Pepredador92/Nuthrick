import { describe, expect, it } from "vitest";
import { createMacroDistribution, patchMacroInput, reconcileMacroDistribution, setMacroReferenceWeight } from "./model";

describe("macro distribution model", () => {
  it("derives all values from an authoritative percentage without intermediate rounding", () => {
    const draft = createMacroDistribution(2000, 80);
    const result = patchMacroInput(draft, "CARBOHYDRATE", "percentage", 45);
    expect(result.macros.CARBOHYDRATE.kcal).toBe(900);
    expect(result.macros.CARBOHYDRATE.grams).toBe(225);
    expect(result.macros.CARBOHYDRATE.grams_per_kg).toBe(2.8125);
  });

  it("does not redistribute the other macros when one value changes", () => {
    let result = createMacroDistribution(2000, 80);
    result = patchMacroInput(result, "CARBOHYDRATE", "grams", 200);
    result = patchMacroInput(result, "PROTEIN", "grams", 100);
    expect(result.macros.FAT.input_value).toBeNull();
    expect(result.totals.difference_kcal).toBe(800);
  });

  it("recalculates g/kg authority when its reference weight changes", () => {
    let result = createMacroDistribution(2000, 80);
    result = patchMacroInput(result, "PROTEIN", "grams_per_kg", 1.5);
    expect(result.macros.PROTEIN.grams).toBe(120);
    result = setMacroReferenceWeight(result, 70);
    expect(result.macros.PROTEIN.grams).toBe(105);
  });

  it("preserves grams authority when energy target changes", () => {
    let result = createMacroDistribution(2000, 80);
    result = patchMacroInput(result, "FAT", "grams", 60);
    result = reconcileMacroDistribution(result, 2400, 80);
    expect(result.macros.FAT.grams).toBe(60);
    expect(result.macros.FAT.percentage).toBe(22.5);
  });
});
