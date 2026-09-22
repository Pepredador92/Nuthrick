import { calculateExchangeTotals } from "@/src/features/exchanges/model";
import { exchangeContributionForFood } from "@/src/features/menu/model";
import { normalizeFoodName } from "@/src/services/foodCatalog";
import type { FoodItem, FoodSnapshot } from "@/src/types/domain";

export type PesDraft = {
  problem: string;
  etiology: string;
  signsSymptoms: string[];
  pesStatement: string;
  evidence: { source: string; finding: string }[];
  missingContext: string[];
  uncertainties: string[];
};
export type RecallExtraction = {
  meals: {
    mealLabel: string;
    approximateTime: string | null;
    items: {
      rawText: string;
      normalizedName: string;
      quantity: number | null;
      unit: string | null;
      confidence: number;
      needsConfirmation: boolean;
    }[];
  }[];
  unresolvedItems: string[];
  ambiguities: string[];
};
export type RecallRow = {
  id: string;
  mealLabel: string;
  rawText: string;
  search: string;
  foodId: string;
  quantity: string;
  unit: string;
  confirmed: boolean;
};
export type RecallSavedItem = {
  mealLabel: string;
  rawText: string;
  quantity: number;
  unit: string;
  food: FoodSnapshot;
};
export function matchRecallFoods(name: string, foods: FoodItem[]) {
  const normalized = normalizeFoodName(name);
  if (!normalized) return [];
  const score = (f: FoodItem) =>
    normalizeFoodName(f.name) === normalized || f.normalized_name === normalized
      ? 0
      : (f.aliases ?? []).some((a) => normalizeFoodName(a) === normalized)
        ? 1
        : [f.name, ...(f.aliases ?? [])].some((a) =>
              normalizeFoodName(a).includes(normalized),
            )
          ? 2
          : 3;
  return foods
    .filter((f) => f.active && score(f) < 3)
    .sort(
      (a, b) =>
        score(a) - score(b) ||
        Number(a.is_custom) - Number(b.is_custom) ||
        a.name.localeCompare(b.name),
    );
}
export function recallRows(
  extraction: RecallExtraction,
  foods: FoodItem[],
): RecallRow[] {
  return extraction.meals.flatMap((meal) =>
    meal.items.map((item) => {
      const matches = matchRecallFoods(item.normalizedName, foods);
      const food = matches.length === 1 ? matches[0] : undefined;
      return {
        id: crypto.randomUUID(),
        mealLabel: meal.mealLabel,
        rawText: item.rawText,
        search: item.normalizedName,
        foodId: food?.id ?? "",
        quantity: item.quantity === null ? "" : String(item.quantity),
        unit: item.unit ?? food?.portion_unit ?? "",
        // Every extraction is provisional, regardless of confidence or a claimed explicit quantity.
        confirmed: false,
      };
    }),
  );
}
export function canonicalRecallItem(
  row: RecallRow,
  foods: FoodItem[],
): RecallSavedItem | null {
  const food = foods.find((f) => f.id === row.foodId && f.active);
  let quantity = Number(row.quantity);
  if (
    !food ||
    !row.confirmed ||
    !row.mealLabel.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 10000
  )
    return null;
  if (row.unit === food.portion_unit) {
    /* already native */
  } else if (row.unit === "g" && food.edible_grams && food.edible_grams > 0)
    quantity = (quantity / food.edible_grams) * food.portion_amount;
  else return null;
  return {
    mealLabel: row.mealLabel,
    rawText: row.rawText,
    quantity,
    unit: food.portion_unit,
    food,
  };
}
export function calculateRecall(items: RecallSavedItem[]) {
  const groups = items.flatMap((i) =>
    exchangeContributionForFood(i.food, i.quantity),
  );
  const total = calculateExchangeTotals(groups);
  const meals = [...new Set(items.map((i) => i.mealLabel))].map((mealLabel) => {
    const totals = calculateExchangeTotals(
      items
        .filter((i) => i.mealLabel === mealLabel)
        .flatMap((i) => exchangeContributionForFood(i.food, i.quantity)),
    );
    return {
      mealLabel,
      ...totals,
      energyPercent:
        total.energy_kcal > 0
          ? (totals.energy_kcal / total.energy_kcal) * 100
          : 0,
    };
  });
  return { total, meals, groups };
}
