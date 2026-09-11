import { EXCHANGE_CATALOG_VERSION, EXCHANGE_SYSTEM_CODE } from "@/src/features/exchanges/catalog";
import { createFoodSnapshot, exchangeContributionForFood } from "@/src/features/menu/model";
import { supabase } from "@/src/lib/supabase";
import type { ExchangeGroupCode, FoodAttributeValue, FoodItem, FoodUnitCode, MealType, Recipe, RecipeItem } from "@/src/types/domain";

export type CustomFoodInput = {
  name: string;
  group_code: ExchangeGroupCode;
  portion_amount: number;
  portion_unit: FoodUnitCode;
  portion_description: string;
  energy_kcal?: number | null;
  carbohydrate_g?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  attributes?: FoodItem["attributes"];
};

export type RecipeDraftItem = { food: FoodItem; amount: number };

export type CustomRecipeInput = {
  name: string;
  description?: string;
  instructions?: string;
  meal_types?: MealType[];
  items: RecipeDraftItem[];
};

export function normalizeFoodName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-MX").replace(/\s+/g, " ");
}

export function foodMatchesSearch(food: Pick<FoodItem, "normalized_name" | "aliases">, search: string) {
  const normalized = normalizeFoodName(search);
  if (!normalized) return true;
  return [food.normalized_name, ...(food.aliases ?? [])]
    .some((term) => normalizeFoodName(term).includes(normalized));
}

export function recipeMatchesSearch(recipe: Pick<Recipe, "normalized_name" | "tags">, search: string) {
  const normalized = normalizeFoodName(search);
  if (!normalized) return true;
  return [recipe.normalized_name, ...(recipe.tags ?? [])]
    .some((term) => normalizeFoodName(term).includes(normalized));
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  return data.user.id;
}

export async function listFoodItems(options: { search?: string; groupCode?: ExchangeGroupCode } = {}) {
  const ownerId = await currentUserId();
  let query = supabase
    .from("food_items")
    .select("*")
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    .eq("active", true)
    .order("use_count", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(250);
  if (options.groupCode) query = query.eq("group_code", options.groupCode);
  const { data, error } = await query;
  if (error) throw new Error("No pudimos cargar el catálogo de alimentos.");
  const foods = (data ?? []) as FoodItem[];
  return options.search?.trim() ? foods.filter((food) => foodMatchesSearch(food, options.search ?? "")) : foods;
}

export async function createCustomFood(input: CustomFoodInput) {
  const ownerId = await currentUserId();
  const payload = {
    owner_id: ownerId,
    stable_code: null,
    catalog_code: null,
    name: input.name.trim(),
    normalized_name: normalizeFoodName(input.name),
    aliases: [],
    brand: null,
    category: null,
    exchange_system_code: EXCHANGE_SYSTEM_CODE,
    exchange_catalog_version: EXCHANGE_CATALOG_VERSION,
    group_code: input.group_code,
    portion_amount: input.portion_amount,
    portion_unit: input.portion_unit,
    portion_description: input.portion_description.trim(),
    alternate_portions: [],
    edible_grams: null,
    energy_kcal: input.energy_kcal ?? null,
    carbohydrate_g: input.carbohydrate_g ?? null,
    protein_g: input.protein_g ?? null,
    fat_g: input.fat_g ?? null,
    fiber_g: input.fiber_g ?? null,
    sodium_mg: input.sodium_mg ?? null,
    attributes: input.attributes ?? {},
    source: "PROFESSIONAL_CUSTOM",
    source_version: "1",
    source_reference: null,
    is_custom: true,
    active: true,
  };
  const { data, error } = await supabase.from("food_items").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un alimento personalizado con ese nombre, grupo y unidad.");
    throw new Error("No pudimos guardar el alimento personalizado.");
  }
  return data as FoodItem;
}

export async function listRecipes() {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_items(*)")
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    .eq("active", true)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("No pudimos cargar tus recetas.");
  return (data ?? []).map((row) => {
    const { recipe_items, ...recipe } = row as typeof row & { recipe_items: RecipeItem[] };
    return { ...recipe, items: [...(recipe_items ?? [])].sort((a, b) => a.display_order - b.display_order) } as Recipe;
  });
}

export async function createCustomRecipe(input: CustomRecipeInput) {
  const ownerId = await currentUserId();
  const { data: recipeRow, error: recipeError } = await supabase.from("recipes").insert({
    owner_id: ownerId,
    stable_code: null,
    name: input.name.trim(),
    normalized_name: normalizeFoodName(input.name),
    description: input.description?.trim() || null,
    meal_types: input.meal_types ?? [],
    servings: 1,
    instructions: input.instructions?.trim() || null,
    image_path: null,
    tags: [],
    substitution_notes: null,
    source: "PROFESSIONAL_CUSTOM",
    source_version: "1",
    source_reference: null,
    is_custom: true,
    active: true,
  }).select("*").single();
  if (recipeError || !recipeRow) {
    if (recipeError?.code === "23505") throw new Error("Ya existe una receta personal con ese nombre.");
    throw new Error("No pudimos crear la receta.");
  }
  const items = input.items.map((item, index) => ({
    owner_id: ownerId,
    recipe_id: recipeRow.id,
    food_item_id: item.food.id,
    amount: item.amount,
    unit: item.food.portion_unit,
    display_order: index,
    food_snapshot: createFoodSnapshot(item.food),
    exchange_contribution: exchangeContributionForFood(item.food, item.amount),
  }));
  const { data: itemRows, error: itemsError } = await supabase.from("recipe_items").insert(items).select("*");
  if (itemsError) throw new Error("La receta se creó, pero no pudimos guardar sus ingredientes.");
  return { ...recipeRow, items: (itemRows ?? []) as RecipeItem[] } as Recipe;
}

export const foodAttributeLabels: Record<keyof FoodItem["attributes"], string> = {
  gluten: "Gluten",
  lactose: "Lactosa",
  milk: "Leche",
  egg: "Huevo",
  peanut: "Cacahuate",
  tree_nuts: "Frutos secos",
  soy: "Soya",
  fish: "Pescado",
  crustaceans: "Crustáceos",
  other: "Otro",
};

export const foodAttributeValueLabels: Record<FoodAttributeValue, string> = {
  contains: "Contiene",
  free: "Libre",
  unknown: "Sin verificar",
};
