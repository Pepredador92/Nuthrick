import { calculateExchangeTotals } from "@/src/features/exchanges/model";
import { macroCatalog } from "@/src/features/macros/catalog";
import { exchangeContributionForFood } from "@/src/features/menu/model";
import type { RecallSavedItem } from "./clinicalCopilot";

/** Same catalog calculation for the interview, history and server AI context. */
export function calculateRecall(items: RecallSavedItem[]) {
  const groups = items.flatMap((item) => exchangeContributionForFood(item.food, item.quantity));
  const total = calculateExchangeTotals(groups);
  const meals = [...new Set(items.map((item) => item.mealLabel))].map((mealLabel) => {
    const totals = calculateExchangeTotals(items.filter((item) => item.mealLabel === mealLabel)
      .flatMap((item) => exchangeContributionForFood(item.food, item.quantity)));
    return { mealLabel, ...totals, energyPercent: total.energy_kcal > 0 ? totals.energy_kcal / total.energy_kcal * 100 : 0 };
  });
  const grams = { CARBOHYDRATE: total.carbohydrate_g, PROTEIN: total.protein_g, FAT: total.fat_g };
  const macroEnergy = macroCatalog.reduce((sum, macro) => sum + grams[macro.code] * macro.kcalPerGram, 0);
  const macros = macroCatalog.map((macro) => ({
    ...macro,
    grams: grams[macro.code],
    percentage: macroEnergy > 0 ? grams[macro.code] * macro.kcalPerGram / macroEnergy * 100 : null,
  }));
  return { total, meals, groups, macros };
}
