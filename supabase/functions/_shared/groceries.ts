import {
  isGroceryCategory,
  inferGroceryCategory,
  type GroceryCategory,
} from "./grocery-categories.ts";
/** A reviewed shopping list belongs to the exact published diet text. */
export type GroceryItem = {
  name: string;
  quantity: number;
  unit: string;
  category?: GroceryCategory;
};
export type GrocerySchedule = {
  diet_id: string;
  title: string;
  days: number;
}[];
export type PatientGroceries = {
  schedule: GrocerySchedule;
  items: GroceryItem[];
};
export type GroceryList = PatientGroceries & {
  schema_version: 1;
  source_key: string;
  reviewed_at: string;
};
type Diet = { id: string; title: string; text: string };
export const grocerySourceKey = (diets: Diet[]) =>
  JSON.stringify(diets.map((d) => [d.id, d.title, d.text]));
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const short = (v: unknown, max: number): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= max &&
  !v.includes("\u0000");
export function isGroceryList(
  value: unknown,
  diets: Diet[],
): value is GroceryList {
  if (
    !record(value) ||
    value.schema_version !== 1 ||
    value.source_key !== grocerySourceKey(diets) ||
    !short(value.reviewed_at, 50) ||
    !Number.isFinite(Date.parse(value.reviewed_at)) ||
    !Array.isArray(value.schedule) ||
    value.schedule.length !== diets.length ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 400
  )
    return false;
  const schedule = value.schedule;
  return (
    schedule.every(
      (row, i) =>
        record(row) &&
        row.diet_id === diets[i].id &&
        row.title === diets[i].title &&
        Number.isInteger(row.days) &&
        Number(row.days) >= 0 &&
        Number(row.days) <= 31,
    ) &&
    schedule.reduce((total, row) => total + Number(row.days), 0) >= 1 &&
    schedule.reduce((total, row) => total + Number(row.days), 0) <= 31 &&
    value.items.every(
      (row) =>
        record(row) &&
        short(row.name, 180) &&
        short(row.unit, 40) &&
        (row.category === undefined || isGroceryCategory(row.category)) &&
        typeof row.quantity === "number" &&
        Number.isFinite(row.quantity) &&
        row.quantity > 0 &&
        row.quantity <= 1000000,
    )
  );
}
/** Explicit allowlist; source diet text and internal review metadata never enter the patient projection. */
export function patientGroceries(
  value: unknown,
  diets: Diet[],
): PatientGroceries | undefined {
  if (!isGroceryList(value, diets)) return;
  return {
    schedule: value.schedule.map(({ diet_id, title, days }) => ({
      diet_id,
      title,
      days,
    })),
    items: value.items.map(({ name, quantity, unit, category }) => ({
      name,
      quantity,
      unit,
      category: category ?? inferGroceryCategory(name),
    })),
  };
}
