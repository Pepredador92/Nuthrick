import type { FoodItem, FoodUnitCode } from "@/src/types/domain";

export const foodUnitLabels: Record<FoodUnitCode | "recipe_serving", string> = {
  g: "g", ml: "ml", piece: "pieza", half: "mitades", cup: "taza", tablespoon: "cucharada", teaspoon: "cucharadita", slice: "rebanada", tortilla: "tortilla", glass: "vaso", serving: "porción", unit: "unidad", recipe_serving: "porción",
};
export function formatFoodQuantity(value: number) {
  const whole = Math.floor(value);
  const remainder = value - whole;
  const fractions = [[1/4,"¼"],[1/3,"⅓"],[1/2,"½"],[2/3,"⅔"],[3/4,"¾"]] as const;
  const fraction = fractions.find(([number])=>Math.abs(number-remainder)<0.000002);
  return fraction ? `${whole || ""}${whole ? " " : ""}${fraction[1]}` : Number(value.toFixed(3)).toLocaleString("es-MX");
}
/** Rational source value is used for new calculations; stored clinical snapshots remain unchanged. */
export function normalizeCatalogPortion(food: FoodItem): FoodItem {
  const fraction = food.portion_fraction;
  return fraction && fraction.numerator > 0 && fraction.denominator > 0
    ? { ...food, portion_amount: fraction.numerator / fraction.denominator } : food;
}
