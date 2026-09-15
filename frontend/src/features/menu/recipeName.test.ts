import { describe, expect, it } from "vitest";
import { generateRecipeName } from "@/src/features/menu/recipeName";
import type { FoodItem } from "@/src/types/domain";

const ingredient = (name: string, group_code: FoodItem["group_code"]) => ({ name, group_code });

describe("generateRecipeName", () => {
  it("prioritizes protein, cereal and legumes while excluding condiments", () => {
    expect(generateRecipeName([
      ingredient("Huevo entero", "AOA_MODERATE_FAT"),
      ingredient("Nopal", "VEGETABLES"),
      ingredient("Arroz blanco cocido", "CEREALS_NO_FAT"),
      ingredient("Frijol cocido", "LEGUMES"),
      ingredient("Aceite de oliva", "FATS_NO_PROTEIN"),
    ])).toBe("Huevo con arroz y frijoles");
  });

  it("keeps a concise three-ingredient name", () => {
    expect(generateRecipeName([
      ingredient("Pechuga de pollo cocida sin piel", "AOA_LOW_FAT"),
      ingredient("Arroz", "CEREALS_NO_FAT"),
      ingredient("Verduras mixtas", "VEGETABLES"),
      ingredient("Aceite", "FATS_NO_PROTEIN"),
    ])).toBe("Pollo con arroz y verduras");
  });

  it("keeps avocado as a meaningful accompaniment before vegetables", () => {
    expect(generateRecipeName([
      ingredient("Atún en agua", "AOA_VERY_LOW_FAT"),
      ingredient("Tostada horneada", "CEREALS_NO_FAT"),
      ingredient("Aguacate", "FATS_WITH_PROTEIN"),
      ingredient("Jitomate", "VEGETABLES"),
    ])).toBe("Atún con tostadas y aguacate");
  });

  it("uses one principal AOA and then the next prescribed groups", () => {
    expect(generateRecipeName([
      ingredient("Atún en agua", "AOA_VERY_LOW_FAT"),
      ingredient("Tostada horneada", "CEREALS_NO_FAT"),
      ingredient("Frijoles cocidos", "LEGUMES"),
      ingredient("Clara de huevo", "AOA_VERY_LOW_FAT"),
    ])).toBe("Atún con tostadas y frijoles");
  });
});
