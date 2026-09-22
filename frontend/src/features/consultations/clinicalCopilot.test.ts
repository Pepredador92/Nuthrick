import { describe, it, expect } from "vitest";
import {
  calculateRecall,
  canonicalRecallItem,
  matchRecallFoods,
  recallRows,
} from "./clinicalCopilot";
import type { FoodItem } from "@/src/types/domain";
const egg = {
  id: "egg",
  name: "Huevo entero",
  normalized_name: "huevo entero",
  aliases: ["huevo"],
  active: true,
  is_custom: false,
  portion_amount: 1,
  portion_unit: "piece",
  edible_grams: 50,
  group_code: "AOA_MODERATE_FAT",
} as FoodItem;
const tortilla = {
  ...egg,
  id: "tortilla",
  name: "Tortilla de maíz",
  normalized_name: "tortilla de maiz",
  aliases: ["tortilla"],
  portion_unit: "tortilla",
  group_code: "CEREALS_NO_FAT",
} as FoodItem;
describe("clinical recall deterministic model", () => {
  it("does not match agua inside aguacate or automatically choose a partial food", () => {
    const avocado = {
      ...egg,
      id: "avocado",
      name: "Aguacate",
      normalized_name: "aguacate",
      aliases: [],
    };
    expect(matchRecallFoods("agua", [avocado])).toEqual([]);
    const cookie = {
      ...egg,
      id: "cookie",
      name: "Galleta de maíz",
      normalized_name: "galleta de maiz",
      aliases: [],
    };
    const row = recallRows(
      {
        meals: [
          {
            mealLabel: "Colación",
            approximateTime: null,
            items: [
              {
                rawText: "una galleta",
                normalizedName: "galleta",
                quantity: 1,
                unit: null,
                confidence: 1,
                needsConfirmation: false,
              },
            ],
          },
        ],
        unresolvedItems: [],
        ambiguities: [],
      },
      [cookie],
    )[0];
    expect(matchRecallFoods("galleta", [cookie])).toEqual([cookie]);
    expect(row.foodId).toBe("");
  });
  it("never substitutes a catalog cup for an unspecified or incompatible fruit unit", () => {
    const orange = {
      ...egg,
      id: "orange",
      name: "Naranja en gajos",
      normalized_name: "naranja en gajos",
      aliases: ["naranja"],
      portion_unit: "cup",
    } as FoodItem;
    for (const unit of [null, "piece"]) {
      const row = recallRows(
        {
          meals: [
            {
              mealLabel: "Comida",
              approximateTime: null,
              items: [
                {
                  rawText: "una naranja",
                  normalizedName: "naranja",
                  quantity: 1,
                  unit,
                  confidence: 1,
                  needsConfirmation: true,
                },
              ],
            },
          ],
          unresolvedItems: [],
          ambiguities: [],
        },
        [orange],
      )[0];
      expect(row.unit).toBe(unit ?? "");
      expect(
        canonicalRecallItem({ ...row, confirmed: true }, [orange]),
      ).toBeNull();
    }
  });
  it("matches canonical and aliases before partial names", () => {
    expect(matchRecallFoods("huevo entero", [egg, tortilla])).toEqual([egg]);
    expect(matchRecallFoods("huevo", [egg, tortilla])).toEqual([egg]);
  });
  it("keeps own and global candidates without autochoosing ambiguous matches", () => {
    const own = { ...egg, id: "own", is_custom: true };
    expect(matchRecallFoods("huevo", [own, egg])).toEqual([egg, own]);
  });
  it("unknown/inactive items are never confirmed", () => {
    expect(matchRecallFoods("pizza", [egg])).toEqual([]);
    expect(matchRecallFoods("huevo", [{ ...egg, active: false }])).toEqual([]);
  });
  it("provider confidence never makes clinical data confirmed", () => {
    const rows = recallRows(
      {
        meals: [
          {
            mealLabel: "Desayuno",
            approximateTime: null,
            items: [
              {
                rawText: "2 huevos",
                normalizedName: "huevo",
                quantity: 2,
                unit: "piece",
                confidence: 1,
                needsConfirmation: false,
              },
            ],
          },
        ],
        unresolvedItems: [],
        ambiguities: [],
      },
      [egg],
    );
    expect(rows[0].confirmed).toBe(false);
    expect(canonicalRecallItem(rows[0], [egg])).toBeNull();
  });
  it("amounts and units recalculate from the existing exchange catalog", () => {
    const row = {
      id: "1",
      mealLabel: "Desayuno",
      rawText: "2 huevos",
      search: "huevo",
      foodId: "egg",
      quantity: "2",
      unit: "piece",
      confirmed: true,
    };
    const item = canonicalRecallItem(row, [egg])!;
    expect(calculateRecall([item]).total).toEqual({
      energy_kcal: 150,
      protein_g: 14,
      carbohydrate_g: 0,
      fat_g: 10,
    });
    expect(
      calculateRecall([
        canonicalRecallItem({ ...row, quantity: "100", unit: "g" }, [egg])!,
      ]).total,
    ).toEqual(calculateRecall([item]).total);
    expect(
      calculateRecall([canonicalRecallItem({ ...row, quantity: "1" }, [egg])!])
        .total.energy_kcal,
    ).toBe(75);
    expect(
      calculateRecall([
        canonicalRecallItem(
          { ...row, foodId: "tortilla", unit: "tortilla", quantity: "3" },
          [tortilla],
        )!,
      ]).total.energy_kcal,
    ).toBe(210);
    expect(canonicalRecallItem({ ...row, unit: "plato" }, [egg])).toBeNull();
  });
  it("rejects missing quantities and reports meal energy shares", () => {
    const row = {
      id: "1",
      mealLabel: "Desayuno",
      rawText: "huevo",
      search: "huevo",
      foodId: "egg",
      quantity: "",
      unit: "piece",
      confirmed: true,
    };
    expect(canonicalRecallItem(row, [egg])).toBeNull();
    const a = canonicalRecallItem({ ...row, quantity: "1" }, [egg])!;
    const r = calculateRecall([a, { ...a, mealLabel: "Cena" }]);
    expect(r.meals.map((m) => m.energyPercent)).toEqual([50, 50]);
  });
});
