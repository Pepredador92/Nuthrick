// Isolated in-memory visual fixture. Never communicates with Supabase.
import {
  makeLibraryContent,
  type DietLibraryItem,
} from "@/src/features/diet-library/model";
import { weeklyFixture } from "../fixtures/weeklyMenu";
import {
  createMacroDistribution,
  patchMacroInput,
} from "@/src/features/macros/model";
import type { NutritionPlan } from "@/src/types/domain";
const { menu, distribution } = weeklyFixture([2, 2, 2]);
menu.week_plan = {
  schema_version: 1,
  days: [
    {
      day: "mon",
      assignments: distribution.meal_times.map((m) => {
        const o = menu.meal_options!.find((o) => o.meal_time_id === m.id)!;
        return {
          meal_time_id: m.id,
          option_id: o.id,
          option_snapshot: o,
          fixed: false,
        };
      }),
    },
  ],
};
let macros = createMacroDistribution(2000, null);
macros = patchMacroInput(macros, "PROTEIN", "percentage", 20);
macros = patchMacroInput(macros, "CARBOHYDRATE", "percentage", 50);
macros = patchMacroInput(macros, "FAT", "percentage", 30);
export const plan = {
  id: "visual",
  title: "Caso ficticio",
  target_calories: 2000,
  macro_distribution: macros,
  meal_distribution: distribution,
  diet_menu: menu,
} as NutritionPlan;
let items: DietLibraryItem[] = [
  {
    id: "example",
    owner_id: "visual",
    name: "Dieta de prueba visual",
    content: makeLibraryContent(plan),
    revision: 1,
    archived: false,
    created_at: "",
    updated_at: "",
  },
];
export async function listDietLibrary() {
  return structuredClone(items);
}
export async function saveDietLibrary(
  id: string,
  name: string,
  content: DietLibraryItem["content"],
) {
  const item = {
    id,
    name,
    content,
    owner_id: "visual",
    revision: 1,
    archived: false,
    created_at: "",
    updated_at: "",
  };
  items = [...items.filter((i) => i.id !== id), item];
  return item;
}
export async function archiveDietLibrary(
  item: DietLibraryItem,
  archived: boolean,
) {
  items = items.map((i) => (i.id === item.id ? { ...i, archived } : i));
}
export async function dietLibraryRecovery() {
  return null;
}
export async function submitLibraryContribution() {}
export async function listLibraryContributions() { return []; }
export async function libraryContributionAccess() { return false; }
export async function reviewLibraryContribution() {}
export async function withdrawLibraryContribution() {}
