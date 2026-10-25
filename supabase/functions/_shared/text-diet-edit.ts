import type { TextDiet } from "./text-diet.ts";

export type TextDietEdit = {
  version: 1;
  dietId: string;
  scope: "diet" | "meals";
  mealIndexes: number[];
};
export type EstimatedNutrition = {
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
};
export const estimatedNutrientKeys = [
  "energy_kcal",
  "protein_g",
  "carbohydrate_g",
  "fat_g",
] as const;
export type TextDietEditReport = {
  version: 1;
  dietId: string;
  dietTitle: string;
  scope: TextDietEdit["scope"];
  selectedMeals: number[];
  before: EstimatedNutrition;
  after: EstimatedNutrition;
  target: EstimatedNutrition;
  meals: Array<{
    index: number;
    name: string;
    before: EstimatedNutrition;
    after: EstimatedNutrition;
    assumptions: string[];
  }>;
  explanation: string;
  beforeText: string;
};
export function isTextDietEdit(value: unknown): value is TextDietEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every((key) =>
      ["version", "dietId", "scope", "mealIndexes"].includes(key),
    ) &&
    v.version === 1 &&
    typeof v.dietId === "string" &&
    !!v.dietId.trim() &&
    v.dietId.length <= 60 &&
    ["diet", "meals"].includes(String(v.scope)) &&
    Array.isArray(v.mealIndexes) &&
    v.mealIndexes.length <= 6 &&
    v.mealIndexes.every(
      (i) => Number.isInteger(i) && Number(i) >= 0 && Number(i) < 6,
    ) &&
    new Set(v.mealIndexes).size === v.mealIndexes.length &&
    (v.scope === "diet" ? v.mealIndexes.length === 0 : v.mealIndexes.length > 0)
  );
}
const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");
export type TextMealSegment = {
  index: number;
  start: number;
  contentStart: number;
  end: number;
};
/** Match only an unambiguous heading. Offsets remain in the original JS string
 * so slicing never rewrites another meal, even after manual edits or emoji. */
export function textDietMealSegments(
  text: string,
  meals: TextDiet["meals"],
): TextMealSegment[] | null {
  const found: Array<{ index: number; start: number; contentStart: number }> =
    [];
  let start = 0;
  for (const line of text.split("\n")) {
    const heading = normalized(
      line
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/[*_`]/g, "")
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(
          /\s*(?:[·:|–—-]\s*)?\d{1,2}:\d{2}(?:\s*(?:am|pm|h|hrs))?\s*$/i,
          "",
        )
        .replace(/[:·|–—-]\s*$/, ""),
    );
    const index = meals.findIndex((meal) => normalized(meal.name) === heading);
    if (index >= 0)
      found.push({
        index,
        start,
        contentStart: Math.min(text.length, start + line.length + 1),
      });
    start += line.length + 1;
  }
  if (
    found.length !== meals.length ||
    new Set(found.map((item) => item.index)).size !== meals.length
  )
    return null;
  return found
    .map((item, i) => {
      const boundary = found[i + 1]?.start ?? text.length;
      const trailing =
        text.slice(item.contentStart, boundary).match(/\s*$/)?.[0].length ?? 0;
      return { ...item, end: boundary - trailing };
    })
    .sort((a, b) => a.index - b.index);
}
export function estimatedTotal(
  values: EstimatedNutrition[],
): EstimatedNutrition {
  return Object.fromEntries(
    estimatedNutrientKeys.map((key) => [
      key,
      values.some((value) => value[key] === null)
        ? null
        : Math.round(values.reduce((sum, value) => sum + value[key]!, 0) * 10) /
          10,
    ]),
  ) as EstimatedNutrition;
}
export function isTextDietEditReport(
  value: unknown,
): value is TextDietEditReport {
  if (!value || typeof value !== "object") return false;
  const report = value as TextDietEditReport;
  const nutrition = (v: EstimatedNutrition) =>
    v &&
    estimatedNutrientKeys.every(
      (key) =>
        v[key] === null ||
        (typeof v[key] === "number" && Number.isFinite(v[key]) && v[key]! >= 0),
    );
  return (
    report.version === 1 &&
    typeof report.dietId === "string" &&
    typeof report.dietTitle === "string" &&
    ["diet", "meals"].includes(report.scope) &&
    Array.isArray(report.selectedMeals) &&
    report.selectedMeals.length > 0 &&
    report.selectedMeals.every((i) => Number.isInteger(i) && i >= 0 && i < 6) &&
    nutrition(report.before) &&
    nutrition(report.after) &&
    nutrition(report.target) &&
    typeof report.explanation === "string" &&
    typeof report.beforeText === "string" &&
    Array.isArray(report.meals) &&
    report.meals.length > 0 &&
    report.meals.length <= 6 &&
    report.meals.every(
      (meal) =>
        meal &&
        Number.isInteger(meal.index) &&
        typeof meal.name === "string" &&
        nutrition(meal.before) &&
        nutrition(meal.after) &&
        Array.isArray(meal.assumptions) &&
        meal.assumptions.every((s) => typeof s === "string"),
    )
  );
}
