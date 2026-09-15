import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem } from "@/src/types/domain";

const db = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { from: db.from, auth: { getUser: db.getUser } } }));
import { createCustomRecipe } from "./foodCatalog";

const milk = { id: "milk", name: "Leche", group_code: "MILK_SKIM", portion_amount: 240, portion_unit: "ml", portion_description: "240 ml", attributes: { milk: "contains" }, source: "FIXTURE", source_version: "1", is_custom: false } as FoodItem;
function queries(itemError: object | null = null) {
  let recipeValue: Record<string, unknown> = {};
  const recipe = { insert: vi.fn((value) => { recipeValue = value; return recipe; }), select: vi.fn(), single: vi.fn(async () => ({ data: { ...recipeValue, id: "new-recipe" }, error: null })) };
  recipe.select.mockReturnValue(recipe);
  const items = { insert: vi.fn(), select: vi.fn(async () => ({ data: [], error: itemError })) };
  items.insert.mockReturnValue(items);
  const cleanup = { delete: vi.fn(), eq: vi.fn(), error: null };
  cleanup.delete.mockReturnValue(cleanup); cleanup.eq.mockReturnValue(cleanup);
  db.from.mockReturnValueOnce(recipe).mockReturnValueOnce(items).mockReturnValueOnce(cleanup);
  return { recipe, items, cleanup };
}

describe("personal recipe persistence contract", () => {
  beforeEach(() => { vi.resetAllMocks(); db.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null }); });
  it("stores beverage type, total yield and owner-bound ingredient snapshots", async () => {
    const q = queries();
    await createCustomRecipe({ name: "Bebida personal", kind: "drink", servings: 2, items: [{ food: milk, amount: 480 }] });
    expect(q.recipe.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "owner", servings: 2, tags: ["nuthrick:drink"] }));
    expect(q.items.insert).toHaveBeenCalledWith([expect.objectContaining({ owner_id: "owner", recipe_id: "new-recipe", amount: 480, exchange_contribution: [{ group_code: "MILK_SKIM", portions: 2 }], food_snapshot: expect.objectContaining({ source: "FIXTURE", attributes: { milk: "contains" } }) })]);
  });
  it("rejects empty, unknown or invalid contributions before sending any request", async () => {
    await expect(createCustomRecipe({ name: "Desconocida", items: [] })).rejects.toThrow("desconocido");
    await expect(createCustomRecipe({ name: "Desconocida", items: [{ food: { ...milk, portion_amount: 0 }, amount: 10 }] })).rejects.toThrow("desconocido");
    await expect(createCustomRecipe({ name: "Desconocida", servings: 0, items: [{ food: milk, amount: 10 }] })).rejects.toThrow("rendimiento");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("compensates only its newly created owner-bound row after an ingredient failure", async () => {
    const q = queries({ message: "write failed" });
    await expect(createCustomRecipe({ name: "Bebida personal", items: [{ food: milk, amount: 240 }] })).rejects.toThrow("reintentar");
    expect(q.cleanup.eq.mock.calls).toEqual([["id", "new-recipe"], ["owner_id", "owner"]]);
  });
});
