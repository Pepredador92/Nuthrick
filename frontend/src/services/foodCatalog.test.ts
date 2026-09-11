import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const query = {
    data: [], error: null,
    select: vi.fn(), or: vi.fn(), eq: vi.fn(), order: vi.fn(),
  };
  for (const method of [query.select, query.or, query.eq, query.order]) method.mockReturnValue(query);
  return {
    query,
    from: vi.fn(() => query),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "professional" } }, error: null }),
  };
});

vi.mock("@/src/lib/supabase", () => ({
  supabase: { auth: { getUser: database.getUser }, from: database.from },
}));

import { foodMatchesSearch, listRecipes, normalizeFoodName, recipeMatchesSearch } from "@/src/services/foodCatalog";

describe("starter food and recipe catalog search", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("uses the direct recipe foreign key when embedding ingredients", async () => {
    await listRecipes();
    expect(database.query.select).toHaveBeenCalledWith("*, recipe_items!recipe_items_recipe_id_fkey(*)");
  });
});
