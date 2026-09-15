import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const query = {
    data: [], error: null,
    select: vi.fn(), or: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
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

import { foodMatchesSearch, listFoodItems, listRecipes, normalizeFoodName, recipeMatchesSearch } from "@/src/services/foodCatalog";

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

  it("keeps catalog aliases searchable without creating a second food identity", () => {
    const food = {
      normalized_name: "galletas de maiz horneadas sin grasa",
      aliases: ["salmas", "galletas salmas"],
    };
    expect(foodMatchesSearch(food, "Salmas")).toBe(true);
    expect(foodMatchesSearch(food, "galletas salmas")).toBe(true);
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

  it("finds a name, alias and exact group beyond the first 250 available foods", async () => {
    const records = Array.from({length:301},(_,id)=>({id:String(id),normalized_name:id===300?"queso asadero":"alimento",aliases:id===300?["queso para fundir"]:[],group_code:"AOA_HIGH_FAT"}));
    database.query.range.mockImplementation((from:number,to:number)=>Promise.resolve({data:records.slice(from,to+1),error:null}));
    expect(await listFoodItems({search:"asadero",groupCode:"AOA_HIGH_FAT"})).toHaveLength(1);
    expect(await listFoodItems({search:"fundir"})).toHaveLength(1);
    expect(await listFoodItems({search:"altos en grasa"})).toHaveLength(301);
    expect(await listFoodItems()).toHaveLength(301);
    expect(database.query.range).toHaveBeenCalledWith(250,499);
    expect(database.query.order).toHaveBeenCalledWith("id",{ascending:true});
    expect(database.query.eq).toHaveBeenCalledWith("group_code","AOA_HIGH_FAT");
  });
});
