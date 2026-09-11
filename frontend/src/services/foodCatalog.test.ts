import { describe, expect, it } from "vitest";
import { foodMatchesSearch, normalizeFoodName, recipeMatchesSearch } from "@/src/services/foodCatalog";

describe("starter food and recipe catalog search", () => {
  it("normalizes accents, casing and repeated whitespace", () => {
    expect(normalizeFoodName("  ATÚN   en Agua ")).toBe("atun en agua");
  });

  it("finds a canonical food through a normalized alias", () => {
    const food = {
      normalized_name: "pechuga de pollo cocida sin piel",
      aliases: ["pollo", "pollo cocido", "pollo deshebrado"],
    };
    expect(foodMatchesSearch(food, "deshebrado")).toBe(true);
    expect(foodMatchesSearch(food, "POLLO")).toBe(true);
    expect(foodMatchesSearch(food, "atún")).toBe(false);
  });

  it("finds recipes by name or descriptive tag", () => {
    const recipe = { normalized_name: "ceviche sencillo de pescado", tags: ["mexicana", "rápida"] };
    expect(recipeMatchesSearch(recipe, "ceviche")).toBe(true);
    expect(recipeMatchesSearch(recipe, "rapida")).toBe(true);
    expect(recipeMatchesSearch(recipe, "avena")).toBe(false);
  });
});
