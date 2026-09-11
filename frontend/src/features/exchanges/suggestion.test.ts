import { describe, expect, it } from "vitest";
import { exchangeCatalog } from "./catalog";
import { calculateExchangeTotals } from "./model";
import {
  EXCHANGE_SUGGESTION_GROUP_TIERS,
  EXCHANGE_SUGGESTION_INCREMENT,
  EXCHANGE_SUGGESTION_LIMITS,
  suggestExchangePrescription,
} from "./suggestion";

const standard = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };
const portions = (result: ReturnType<typeof suggestExchangePrescription>) => new Map(result.groups.map((group) => [group.groupCode, group.portions]));

describe("exchange portion suggestions", () => {
  it("is deterministic, valid, non-negative, and uses practical half portions", () => {
    const first = suggestExchangePrescription({ targets: standard });
    const second = suggestExchangePrescription({ targets: standard });
    expect(second).toEqual(first);
    expect(first.groups).toHaveLength(exchangeCatalog.length);
    for (const group of first.groups) {
      expect(exchangeCatalog.some((item) => item.groupCode === group.groupCode)).toBe(true);
      expect(group.portions).toBeGreaterThanOrEqual(0);
      expect(group.portions / EXCHANGE_SUGGESTION_INCREMENT).toBe(Math.round(group.portions / EXCHANGE_SUGGESTION_INCREMENT));
      expect(group.portions).toBeLessThanOrEqual(EXCHANGE_SUGGESTION_LIMITS[group.groupCode]);
    }
  });

  it("returns totals that match the official catalog calculation", () => {
    const suggestion = suggestExchangePrescription({ targets: standard });
    const totals = calculateExchangeTotals(suggestion.groups.map((group) => ({ group_code: group.groupCode, portions: group.portions })));
    expect(suggestion.totals).toEqual(totals);
  });

  it("improves all four objectives substantially from the zero state", () => {
    const suggestion = suggestExchangePrescription({ targets: standard });
    expect(Math.abs(suggestion.differences.energy_kcal) / standard.energy_kcal).toBeLessThan(0.12);
    expect(Math.abs(suggestion.differences.carbohydrate_g) / standard.carbohydrate_g).toBeLessThan(0.12);
    expect(Math.abs(suggestion.differences.protein_g) / standard.protein_g).toBeLessThan(0.12);
    expect(Math.abs(suggestion.differences.fat_g) / standard.fat_g).toBeLessThan(0.12);
    expect(suggestion.score).toBeLessThan(3.5);
  });

  it.each([
    { energy_kcal: 850, carbohydrate_g: 105, protein_g: 55, fat_g: 23 },
    { energy_kcal: 3200, carbohydrate_g: 420, protein_g: 170, fat_g: 95 },
    { energy_kcal: 1800, carbohydrate_g: 130, protein_g: 180, fat_g: 62 },
    { energy_kcal: 1800, carbohydrate_g: 310, protein_g: 65, fat_g: 33 },
  ])("handles small, large, and different macro proportions: $energy_kcal kcal", (targets) => {
    const suggestion = suggestExchangePrescription({ targets });
    expect(suggestion.groups.some((group) => group.portions > 0)).toBe(true);
    expect(Number.isFinite(suggestion.score)).toBe(true);
    expect(suggestion.metadata.iterations).toBeLessThanOrEqual(500);
  });

  it("softly avoids discretionary groups and excessive concentration when alternatives exist", () => {
    const suggestion = suggestExchangePrescription({ targets: standard });
    const discretionary = suggestion.groups
      .filter((group) => EXCHANGE_SUGGESTION_GROUP_TIERS[group.groupCode] === "discretionary")
      .reduce((sum, group) => sum + group.portions, 0);
    const total = suggestion.groups.reduce((sum, group) => sum + group.portions, 0);
    const largest = Math.max(...suggestion.groups.map((group) => group.portions));
    expect(discretionary).toBeLessThan(total / 3);
    expect(largest).toBeLessThan(total * 0.65);
  });

  it("does not add sugars when the objectives can be fitted without them", () => {
    const result = portions(suggestExchangePrescription({ targets: standard }));
    expect(result.get("SUGARS_NO_FAT")).toBe(0);
    expect(result.get("SUGARS_WITH_FAT")).toBe(0);
    expect(result.get("MILK_WITH_SUGAR")).toBe(0);
  });

  it("prefers a nutritionally equivalent priority group over sugar", () => {
    const catalog = exchangeCatalog.filter((group) => group.groupCode === "FRUITS" || group.groupCode === "SUGARS_NO_FAT");
    const result = portions(suggestExchangePrescription({
      targets: { energy_kcal: 120, carbohydrate_g: 30, protein_g: 0, fat_g: 0 },
      exchangeCatalog: catalog,
    }));
    expect(result.get("FRUITS")).toBe(2);
    expect(result.get("SUGARS_NO_FAT")).toBe(0);
  });

  it("builds a varied AUTO proposal when the targets make it viable", () => {
    const result = portions(suggestExchangePrescription({ targets: standard }));
    expect(result.get("VEGETABLES")).toBeGreaterThanOrEqual(1);
    expect(result.get("FRUITS")).toBeGreaterThanOrEqual(1);
    expect(result.get("CEREALS_NO_FAT")).toBeGreaterThanOrEqual(1);
    const proteinSources = ["LEGUMES", "AOA_VERY_LOW_FAT", "AOA_LOW_FAT", "AOA_MODERATE_FAT", "AOA_HIGH_FAT"] as const;
    expect(proteinSources.reduce((sum, code) => sum + (result.get(code) ?? 0), 0)).toBeGreaterThanOrEqual(1);
    expect(result.get("LEGUMES")).toBeGreaterThan(0);
  });

  it("uses a discretionary group when the professional marks it INCLUDE", () => {
    const result = portions(suggestExchangePrescription({
      targets: standard,
      options: { groupPreferences: { SUGARS_NO_FAT: "include" } },
    }));
    expect(result.get("SUGARS_NO_FAT")).toBeGreaterThan(0);
  });

  it("uses an AUTO discretionary group only when it unlocks a relevant fit improvement", () => {
    const catalog = exchangeCatalog.filter((group) => group.groupCode === "SUGARS_NO_FAT");
    const result = portions(suggestExchangePrescription({
      targets: { energy_kcal: 400, carbohydrate_g: 100, protein_g: 0, fat_g: 0 },
      exchangeCatalog: catalog,
    }));
    expect(result.get("SUGARS_NO_FAT")).toBeGreaterThan(0);
  });

  it("strongly penalizes a group marked AVOID without treating it as excluded", () => {
    const automatic = portions(suggestExchangePrescription({ targets: standard }));
    const avoided = portions(suggestExchangePrescription({ targets: standard, options: { groupPreferences: { FRUITS: "avoid" } } }));
    expect(avoided.get("FRUITS")).toBeLessThan(automatic.get("FRUITS") ?? 0);
  });

  it("forces every milk group to zero when the professional marks them EXCLUDE", () => {
    const result = portions(suggestExchangePrescription({
      targets: standard,
      options: { groupPreferences: { MILK_SKIM: "exclude", MILK_SEMI_SKIM: "exclude", MILK_WHOLE: "exclude", MILK_WITH_SUGAR: "exclude" } },
    }));
    const milkGroups = ["MILK_SKIM", "MILK_SEMI_SKIM", "MILK_WHOLE", "MILK_WITH_SUGAR"] as const;
    expect(milkGroups.every((code) => result.get(code) === 0)).toBe(true);
  });

  it("uses legumes when AOA groups are excluded and the distribution allows it", () => {
    const result = portions(suggestExchangePrescription({
      targets: standard,
      options: { groupPreferences: {
        AOA_VERY_LOW_FAT: "exclude", AOA_LOW_FAT: "exclude", AOA_MODERATE_FAT: "exclude", AOA_HIGH_FAT: "exclude",
      } },
    }));
    expect(result.get("LEGUMES")).toBeGreaterThan(0);
    expect(result.get("AOA_VERY_LOW_FAT")).toBe(0);
    expect(result.get("AOA_LOW_FAT")).toBe(0);
    expect(result.get("AOA_MODERATE_FAT")).toBe(0);
    expect(result.get("AOA_HIGH_FAT")).toBe(0);
  });

  it("favors lean AOA over high-fat AOA for a low-fat target", () => {
    const result = portions(suggestExchangePrescription({ targets: { energy_kcal: 1800, carbohydrate_g: 160, protein_g: 180, fat_g: 30 } }));
    expect((result.get("AOA_VERY_LOW_FAT") ?? 0) + (result.get("AOA_LOW_FAT") ?? 0)).toBeGreaterThan(0);
    expect(result.get("AOA_HIGH_FAT")).toBe(0);
  });

  it("returns the best bounded result without inventing an exact fit", () => {
    const impossible = { energy_kcal: 12000, carbohydrate_g: 1800, protein_g: 700, fat_g: 400 };
    const suggestion = suggestExchangePrescription({ targets: impossible });
    expect(suggestion.differences.energy_kcal).not.toBe(0);
    expect(suggestion.groups.every((group) => group.portions <= EXCHANGE_SUGGESTION_LIMITS[group.groupCode])).toBe(true);
  });

  it("can adjust from current portions and keeps future locked groups stable", () => {
    const suggestion = suggestExchangePrescription({
      targets: standard,
      currentPortions: [{ groupCode: "LEGUMES", portions: 1 }],
      options: { startFromCurrent: true, lockedGroups: { LEGUMES: 1 } },
    });
    expect(suggestion.groups.find((group) => group.groupCode === "LEGUMES")?.portions).toBe(1);
  });
});
