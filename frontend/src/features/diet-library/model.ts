import type {
  DietMenu,
  DietMenuEntry,
  ExchangePrescription,
  ExchangeTargetSnapshot,
  FoodSnapshot,
  MealDistribution,
  MealOption,
  NutritionPlan,
  PatientFoodAlternative,
} from "@/src/types/domain";
import {
  createExchangePrescription,
  calculateExchangeTotals,
  reconcileExchangePrescription,
} from "@/src/features/exchanges/model";
import {
  createMealDistribution,
  calculateDerivedMealTotals,
} from "@/src/features/meal-distribution/model";
import {
  createDietMenu,
  activeMenu,
  exchangeContributionForFood,
  calculateMenuUsage,
} from "@/src/features/menu/model";
import { ensureOptionBank } from "@/src/features/menu/options";
import { patientPreparation } from "@/src/features/diet-review/preparation";
import {
  EXCHANGE_CATALOG_VERSION,
  EXCHANGE_SYSTEM_CODE,
  exchangeCatalog,
} from "@/src/features/exchanges/catalog";
import { patientPlanViewFromDraft } from "@/src/features/diet-review/model";
import { createMacroDistribution, patchMacroInput } from "@/src/features/macros/model";

export type LibraryTargetMode = "preserve" | "reference";
export function referenceMacros(target: ExchangeTargetSnapshot | null) {
  if (!target || !Object.values(target).every(v => Number.isFinite(v) && v >= 0) || target.energy_kcal <= 0 || target.energy_kcal > 10000) return null;
  // nutrition_plans.target_calories stores whole kcal. Keep every goal in sync.
  let result = createMacroDistribution(Math.round(target.energy_kcal), null);
  result = patchMacroInput(result, "PROTEIN", "grams", target.protein_g);
  result = patchMacroInput(result, "CARBOHYDRATE", "grams", target.carbohydrate_g);
  result = patchMacroInput(result, "FAT", "grams", target.fat_g);
  return result.complete ? result : null;
}

export type LibraryContent = {
  schema_version: 1;
  estimation?: DietMenu["library_estimation"];
  reference_targets: ExchangeTargetSnapshot | null;
  exchange_groups: ExchangePrescription["groups"];
  distribution: MealDistribution;
  menu: DietMenu;
};
export type DietLibraryItem = {
  id: string;
  owner_id: string | null;
  name: string;
  content: LibraryContent;
  revision: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  provenance?: { kind: string; label: string; notes?: string[]; declared_energy?: string; target_basis?: string } | null;
};
const zero = (): ExchangeTargetSnapshot => ({
  energy_kcal: 0,
  carbohydrate_g: 0,
  protein_g: 0,
  fat_g: 0,
});
export const libraryKind = (days: number) =>
  days > 1 ? "Plan de alimentación" : "Dieta";
export const libraryDays = (content: LibraryContent) =>
  content.menu.week_plan?.days.length ?? 0;
export function currentTargets(
  plan: Pick<NutritionPlan, "target_calories" | "macro_distribution">,
): ExchangeTargetSnapshot | null {
  const m = plan.macro_distribution;
  if (
    !m?.complete ||
    !m.macros?.PROTEIN ||
    !m.macros?.CARBOHYDRATE ||
    !m.macros?.FAT ||
    !plan.target_calories ||
    plan.target_calories <= 0 ||
    m.target_energy_kcal !== plan.target_calories
  )
    return null;
  const result = {
    energy_kcal: plan.target_calories,
    protein_g: m.macros.PROTEIN.grams!,
    carbohydrate_g: m.macros.CARBOHYDRATE.grams!,
    fat_g: m.macros.FAT.grams!,
  };
  return Object.values(result).every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  )
    ? result
    : null;
}
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b, "en")),
        )
      : v,
  );
const contributions = (rows: DietMenuEntry["exchange_contributions"]) =>
  rows.map((r) => ({ group_code: r.group_code, portions: r.portions }));

/** Allow-list projection, not a clone of a clinical record. Free text still requires human review. */
function cleanFood(f: FoodSnapshot): FoodSnapshot {
  return {
    id: f.id,
    name: f.name,
    group_code: f.group_code,
    portion_amount: f.portion_amount,
    portion_unit: f.portion_unit,
    portion_description: f.portion_description,
    exchange_system_code: f.exchange_system_code,
    exchange_catalog_version: f.exchange_catalog_version,
    source: f.source,
    source_version: f.source_version,
    is_custom: f.is_custom,
    attributes: Object.fromEntries(
      Object.entries(f.attributes ?? {}).filter(
        ([k, v]) =>
          [
            "gluten",
            "lactose",
            "milk",
            "egg",
            "peanut",
            "tree_nuts",
            "soy",
            "fish",
            "crustaceans",
            "other",
          ].includes(k) && ["contains", "free", "unknown"].includes(v),
      ),
    ),
  };
}
function cleanEntry(e: DietMenuEntry, id: string): DietMenuEntry {
  return {
    id,
    type: e.type,
    source_id: e.source_id,
    name_snapshot: e.name_snapshot,
    quantity: e.quantity,
    unit: e.unit,
    ...(e.culinary_role ? { culinary_role: e.culinary_role } : {}),
    exchange_contributions: contributions(e.exchange_contributions),
    ...(e.food_snapshot ? { food_snapshot: cleanFood(e.food_snapshot) } : {}),
    ...(e.recipe_snapshot
      ? {
          recipe_snapshot: {
            recipe_id: e.recipe_snapshot.recipe_id,
            name: e.recipe_snapshot.name,
            servings: e.recipe_snapshot.servings,
            instructions: e.recipe_snapshot.instructions,
            source: e.recipe_snapshot.source,
            tags: e.recipe_snapshot.tags?.filter((t) =>
              ["nuthrick:drink", "nuthrick:verified-water"].includes(t),
            ),
            items: e.recipe_snapshot.items.map((i) => ({
              amount: i.amount,
              unit: i.unit,
              food_snapshot: cleanFood(i.food_snapshot),
              exchange_contribution: contributions(i.exchange_contribution),
            })),
          },
        }
      : {}),
  };
}
function cleanOption(
  option: MealOption,
  id: string,
  mealId: string,
): MealOption {
  const entries = option.entries.map((e, i) => cleanEntry(e, `${id}-e${i}`));
  const clean: MealOption = {
    id,
    meal_time_id: mealId,
    name: option.name,
    entries,
    status: "draft",
    confirmed_at: null,
    prescription_key: null,
    revision: 1,
  };
  const previous = patientPreparation(option);
  if (previous.substitutionsReviewed) {
    const next = patientPreparation(clean);
    const ingredients: Record<string, PatientFoodAlternative[]> = {};
    next.ingredients.forEach((ingredient, i) => {
      ingredients[ingredient.key] = previous.ingredients[i].alternatives.map(
        (a) => ({
          food: cleanFood(a.food),
          amount: a.amount,
          unit: a.unit,
          equivalents: a.equivalents,
          source_reference: null,
        }),
      );
    });
    clean.patient_substitutions = {
      schema_version: 1,
      source_key: canonical(entries),
      ingredients,
    };
  }
  return clean;
}

export function makeLibraryContent(
  plan: Pick<
    NutritionPlan,
    | "target_calories"
    | "macro_distribution"
    | "exchange_prescription"
    | "meal_distribution"
    | "diet_menu"
  >,
  includeAlternatives = true,
): LibraryContent {
  const original = plan.meal_distribution ?? createMealDistribution();
  const meals = new Map(original.meal_times.map((m, i) => [m.id, `meal-${i}`]));
  const distribution: MealDistribution = {
    ...createMealDistribution(),
    meal_times: original.meal_times.map((m, i) => ({
      id: meals.get(m.id)!,
      meal_type: m.meal_type,
      display_name: m.display_name,
      time: m.time,
      display_order: i,
    })),
    distribution: original.distribution
      .filter((r) => meals.has(r.meal_time_id))
      .map((r) => ({
        meal_time_id: meals.get(r.meal_time_id)!,
        group_code: r.group_code,
        portions: r.portions,
      })),
    status: "editing",
    confirmed_at: null,
    updated_at: "",
  };
  const menu = {
    ...createDietMenu(distribution, () => "library-menu"),
    updated_at: "",
  };
  if (plan.diet_menu) {
    const source = ensureOptionBank(plan.diet_menu, original);
    const ids = new Map(
      (source.meal_options ?? []).map((o, i) => [o.id, `option-${i}`]),
    );
    menu.meal_options = includeAlternatives
      ? (source.meal_options ?? [])
          .filter((o) => meals.has(o.meal_time_id))
          .map((o) =>
            cleanOption(o, ids.get(o.id)!, meals.get(o.meal_time_id)!),
          )
      : [];
    menu.week_plan = source.week_plan
      ? {
          schema_version: 1,
          days: source.week_plan.days.map((d, di) => ({
            day: d.day,
            assignments: d.assignments
              .filter((a) => meals.has(a.meal_time_id))
              .map((a, ai) => {
                const id = ids.get(a.option_id) ?? `applied-${di}-${ai}`;
                const option = cleanOption(
                  a.option_snapshot,
                  id,
                  meals.get(a.meal_time_id)!,
                );
                if (!menu.meal_options!.some((o) => o.id === id))
                  menu.meal_options!.push(option);
                return {
                  meal_time_id: option.meal_time_id,
                  option_id: id,
                  option_snapshot: option,
                  fixed: false,
                };
              }),
          })),
        }
      : null;
    const active = activeMenu(source);
    menu.menus[0].meal_menus = original.meal_times.map((m) => ({
      meal_time_id: meals.get(m.id)!,
      entries: (
        active.meal_menus.find((mm) => mm.meal_time_id === m.id)?.entries ?? []
      ).map((e, i) => cleanEntry(e, `${meals.get(m.id)}-active-${i}`)),
    }));
  }
  return {
    schema_version: 1,
    reference_targets: currentTargets(plan),
    ...(plan.diet_menu?.library_estimation ? { estimation: structuredClone(plan.diet_menu.library_estimation) } : {}),
    exchange_groups: contributions(plan.exchange_prescription?.groups ?? []),
    distribution,
    menu,
  };
}

const editableKeys = new Set([
  "name",
  "name_snapshot",
  "display_name",
  "instructions",
  "portion_description",
  "source",
  "source_version",
]);
export function libraryTexts(content: LibraryContent): string[] {
  const values = new Set<string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, val]) => {
        if (editableKeys.has(k) && typeof val === "string" && val.trim())
          values.add(val);
        else visit(val);
      });
  };
  visit(content);
  return [...values];
}
export function editLibraryTexts(
  content: LibraryContent,
  replacements: Record<string, string>,
): LibraryContent {
  const visit = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(visit)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v).map(([k, val]) => [
              k,
              editableKeys.has(k) && typeof val === "string"
                ? (replacements[val] ?? val)
                : visit(val),
            ]),
          )
        : v;
  const next = visit(content) as LibraryContent;
  for (const option of [
    ...(next.menu.meal_options ?? []),
    ...(next.menu.week_plan?.days.flatMap((d) =>
      d.assignments.map((a) => a.option_snapshot),
    ) ?? []),
  ]) {
    if (option.patient_substitutions)
      option.patient_substitutions.source_key = canonical(option.entries);
  }
  return next;
}

export function libraryNutrition(content: LibraryContent) {
  const groups = new Set(exchangeCatalog.map((g) => g.groupCode));
  return (content.menu.week_plan?.days ?? []).map((day) => {
    let complete =
      day.assignments.length > 0 &&
      new Set(day.assignments.map((a) => a.meal_time_id)).size ===
        day.assignments.length;
    for (const meal of content.distribution.meal_times)
      if (
        content.distribution.distribution.some(
          (r) => r.meal_time_id === meal.id && r.portions > 0,
        ) &&
        !day.assignments.some((a) => a.meal_time_id === meal.id)
      )
        complete = false;
    const entries = day.assignments.flatMap((a) => a.option_snapshot.entries);
    if (!entries.length) complete = false;
    for (const entry of entries) {
      const foods = entry.food_snapshot
        ? [entry.food_snapshot]
        : (entry.recipe_snapshot?.items.map((i) => i.food_snapshot) ?? []);
      const water =
        entry.recipe_snapshot?.recipe_id === "nuthrick-water-v1" &&
        entry.recipe_snapshot.tags?.includes("nuthrick:verified-water") &&
        entry.recipe_snapshot.items.length === 0;
      if (
        !(entry.quantity > 0) ||
        !Number.isFinite(entry.quantity) ||
        (!water && (!foods.length || !entry.exchange_contributions.length))
      )
        complete = false;
      if (
        foods.some(
          (f) =>
            f.exchange_system_code !== EXCHANGE_SYSTEM_CODE ||
            f.exchange_catalog_version !== EXCHANGE_CATALOG_VERSION,
        )
      )
        complete = false;
      if (
        foods.some(
          (f) =>
            !Number.isFinite(f.portion_amount) ||
            f.portion_amount <= 0 ||
            !groups.has(f.group_code),
        )
      )
        complete = false;
      if (
        entry.food_snapshot &&
        entry.unit !== entry.food_snapshot.portion_unit
      )
        complete = false;
      const recipe = entry.recipe_snapshot;
      if (
        recipe &&
        (!(recipe.servings > 0) ||
          !Number.isFinite(recipe.servings) ||
          recipe.items.some(
            (i) =>
              !Number.isFinite(i.amount) ||
              i.amount <= 0 ||
              i.unit !== i.food_snapshot.portion_unit,
          ))
      )
        complete = false;
      const expected = entry.food_snapshot
        ? exchangeContributionForFood(entry.food_snapshot, entry.quantity)
        : recipe
          ? recipe.items.flatMap((i) =>
              exchangeContributionForFood(i.food_snapshot, i.amount).map(
                (r) => ({
                  ...r,
                  portions: (r.portions * entry.quantity) / recipe.servings,
                }),
              ),
            )
          : [];
      const expectedTotals = calculateExchangeTotals(expected),
        recordedTotals = calculateExchangeTotals(entry.exchange_contributions);
      if (
        Object.keys(expectedTotals).some(
          (key) =>
            Math.abs(
              expectedTotals[key as keyof ExchangeTargetSnapshot] -
                recordedTotals[key as keyof ExchangeTargetSnapshot],
            ) > 0.2,
        )
      )
        complete = false;
    }
    const rows = entries.flatMap((e) => e.exchange_contributions);
    if (
      rows.some(
        (r) =>
          !groups.has(r.group_code) ||
          !Number.isFinite(r.portions) ||
          r.portions < 0,
      )
    )
      complete = false;
    const totals = complete ? calculateExchangeTotals(rows) : null;
    return { day: day.day, totals, complete };
  });
}
export function libraryReady(content: LibraryContent) {
  const days = libraryNutrition(content);
  return (
    days.length > 0 &&
    days.length <= 7 &&
    new Set(days.map((d) => d.day)).size === days.length &&
    days.every((d) => d.complete)
  );
}
export function compareLibrary(
  content: LibraryContent,
  target: ExchangeTargetSnapshot,
) {
  const days = libraryNutrition(content).map((d) => ({
    ...d,
    differences: d.totals
      ? (Object.fromEntries(
          Object.keys(target).map((k) => [
            k,
            d.totals![k as keyof ExchangeTargetSnapshot] -
              target[k as keyof ExchangeTargetSnapshot],
          ]),
        ) as ExchangeTargetSnapshot)
      : null,
  }));
  // Retrieval-only distance v1: equal mean relative error across four quantities; worst day first.
  // Zero target: exact zero has distance 0, any positive amount is unrankable (Infinity).
  const scores = days.map((d) =>
    d.totals
      ? Object.keys(target).reduce((n, k) => {
          const key = k as keyof ExchangeTargetSnapshot;
          return (
            n +
            (target[key] > 0
              ? Math.abs(d.totals![key] - target[key]) / target[key]
              : d.totals![key] === 0
                ? 0
                : Infinity)
          );
        }, 0) / 4
      : Infinity,
  );
  return {
    days,
    worst: scores.length ? Math.max(...scores) : Infinity,
    mean: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : Infinity,
  };
}
export function libraryRestrictions(
  content: LibraryContent,
  preferences: DietMenu["food_preferences"] = {},
) {
  const excluded = new Set<string>(),
    avoided = new Set<string>();
  for (const option of [
    ...(content.menu.meal_options ?? []),
    ...(content.menu.week_plan?.days.flatMap((d) =>
      d.assignments.map((a) => a.option_snapshot),
    ) ?? []),
  ]) {
    for (const ingredient of patientPreparation(option).ingredients) {
      if (ingredient.food && preferences[ingredient.food.id] === "exclude")
        excluded.add(ingredient.name);
      if (ingredient.food && preferences[ingredient.food.id] === "avoid")
        avoided.add(ingredient.name);
    }
  }
  return { excluded: [...excluded], avoided: [...avoided] };
}
export function prepareLibraryBase(
  item: DietLibraryItem,
  current: NutritionPlan,
  idFactory = () => crypto.randomUUID(),
  targetMode: LibraryTargetMode = "preserve",
) {
  const reference = referenceMacros(item.content.reference_targets);
  const target = targetMode === "reference"
    ? (reference && item.content.reference_targets ? { ...item.content.reference_targets, energy_kcal: reference.target_energy_kcal } : null)
    : currentTargets(current);
  if (!target)
    throw new Error(targetMode === "reference" ? "La base no tiene objetivos de referencia completos y coherentes." : "Completa Energía y Macros antes de usar una base.");
  if (
    libraryRestrictions(item.content, current.diet_menu?.food_preferences)
      .excluded.length
  )
    throw new Error(
      "La base incluye alimentos excluidos. Revísala antes de aplicarla.",
    );
  return copyLibraryWorkspace(
    item.content,
    target,
    current.diet_menu?.food_preferences,
    idFactory,
  );
}
/** Editing a reusable base is an unassigned draft; missing reference targets stay missing. */
export function copyLibraryWorkspace(
  content: LibraryContent,
  target: ExchangeTargetSnapshot = zero(),
  preferences: DietMenu["food_preferences"] = {},
  idFactory = () => crypto.randomUUID(),
) {
  const copy = structuredClone(content);
  const ids = new Map<string, string>();
  const id = (value: string) => {
    if (!ids.has(value)) ids.set(value, idFactory());
    return ids.get(value)!;
  };
  const distribution = copy.distribution;
  distribution.meal_times = distribution.meal_times.map((m) => ({
    ...m,
    id: id(m.id),
  }));
  distribution.distribution = distribution.distribution.map((r) => ({
    ...r,
    meal_time_id: id(r.meal_time_id),
  }));
  const remap = (o: MealOption): MealOption => ({
    id: id(o.id),
    meal_time_id: id(o.meal_time_id),
    name: o.name,
    entries: o.entries.map((e) => ({ ...e, id: id(e.id) })),
    revision: 1,
    status: "draft",
    confirmed_at: null,
    prescription_key: null,
  });
  copy.menu.meal_options = copy.menu.meal_options?.map(remap);
  copy.menu.week_plan = copy.menu.week_plan
    ? {
        schema_version: 1,
        days: copy.menu.week_plan.days.map((d) => ({
          day: d.day,
          assignments: d.assignments.map((a) => ({
            meal_time_id: id(a.meal_time_id),
            option_id: id(a.option_id),
            option_snapshot: remap(a.option_snapshot),
            fixed: false,
          })),
        })),
      }
    : null;
  copy.menu.menus = copy.menu.menus.map((v) => ({
    ...v,
    id: id(v.id),
    meal_menus: v.meal_menus.map((m) => ({
      meal_time_id: id(m.meal_time_id),
      entries: m.entries.map((e) => ({ ...e, id: id(e.id) })),
    })),
  }));
  copy.menu.active_menu_id = id(copy.menu.active_menu_id);
  copy.menu.food_preferences = structuredClone(preferences);
  copy.menu.library_estimation = structuredClone(copy.estimation);
  copy.menu.status = "editing";
  copy.menu.confirmed_at = null;
  copy.menu.source_meal_distribution_snapshot = null;
  const exchange = reconcileExchangePrescription(
    {
      ...createExchangePrescription(target),
      groups: copy.exchange_groups,
      status: "editing",
      target_snapshot: zero(),
    },
    target,
  );
  const meal: MealDistribution = {
    ...distribution,
    status: "editing",
    confirmed_at: null,
    source_exchange_snapshot: null,
    derived_meal_totals: calculateDerivedMealTotals(
      distribution.distribution,
      distribution.meal_times,
    ),
  };
  copy.menu.derived_exchange_usage = calculateMenuUsage(copy.menu);
  return {
    exchange_prescription: exchange,
    meal_distribution: meal,
    diet_menu: copy.menu,
  };
}
export function libraryPreview(
  item: Pick<DietLibraryItem, "name" | "content">,
) {
  return patientPlanViewFromDraft(
    {
      title: item.name,
      meal_distribution: item.content.distribution,
      diet_menu: item.content.menu,
    } as NutritionPlan,
    "Base reutilizable · sin paciente",
  );
}
