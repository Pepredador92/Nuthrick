import { describe, expect, it } from "vitest";
import { exchangeCatalog } from "./catalog";
import { calculateExchangeTotals, confirmExchangePrescription, createExchangePrescription, reconcileExchangePrescription, setExchangePortions } from "./model";

const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };

describe("SMAE exchange prescription", () => {
  it("contains every group exactly once with the published values", () => {
    expect(exchangeCatalog).toHaveLength(17);
    expect(new Set(exchangeCatalog.map((group) => group.groupCode)).size).toBe(17);
    expect(exchangeCatalog.find((group) => group.groupCode === "VEGETABLES")).toMatchObject({ energyKcal: 25, carbohydrateG: 4, proteinG: 2, fatG: 0 });
    expect(exchangeCatalog.find((group) => group.groupCode === "FATS_WITH_PROTEIN")).toMatchObject({ energyKcal: 70, carbohydrateG: 3, proteinG: 3, fatG: 5 });
  });

  it("uses official energy values, supports decimals, and sums multiple groups", () => {
    let prescription = createExchangePrescription(targets);
    prescription = setExchangePortions(prescription, targets, "VEGETABLES", 0.5);
    prescription = setExchangePortions(prescription, targets, "FRUITS", 2);
    expect(prescription.derived_totals).toEqual({ energy_kcal: 132.5, carbohydrate_g: 32, protein_g: 1, fat_g: 0 });
    expect(prescription.differences.energy_kcal).toBe(-1867.5);
  });

  it("rejects negatives, confirms intentionally, and returns to editing after a change", () => {
    let prescription = createExchangePrescription(targets);
    const unchanged = setExchangePortions(prescription, targets, "FRUITS", -1);
    expect(unchanged).toBe(prescription);
    prescription = setExchangePortions(prescription, targets, "FRUITS", 1);
    prescription = confirmExchangePrescription(prescription, targets);
    expect(prescription.status).toBe("ready");
    prescription = setExchangePortions(prescription, targets, "FRUITS", 1.5);
    expect(prescription.status).toBe("editing");
    expect(prescription.confirmed_at).toBeNull();
  });

  it("keeps portions but updates comparison and state when targets change", () => {
    let prescription = setExchangePortions(createExchangePrescription(targets), targets, "CEREALS_NO_FAT", 4);
    prescription = confirmExchangePrescription(prescription, targets);
    const changed = reconcileExchangePrescription(prescription, { ...targets, energy_kcal: 2200 });
    expect(changed.groups.find((group) => group.group_code === "CEREALS_NO_FAT")?.portions).toBe(4);
    expect(changed.status).toBe("editing");
    expect(changed.differences.energy_kcal).toBe(-1920);
  });

  it("calculates one exchange directly from catalog values", () => {
    const totals = calculateExchangeTotals([{ group_code: "LEGUMES", portions: 1 }]);
    expect(totals).toEqual({ energy_kcal: 120, carbohydrate_g: 20, protein_g: 8, fat_g: 1 });
  });
});
