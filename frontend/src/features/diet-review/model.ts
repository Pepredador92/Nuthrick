import { optionIsEligible, optionPortionDifferences } from "@/src/features/menu/options";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import { assignment, dayName, weekProblems } from "@/src/features/menu/week";
import { patientPreparation, type PatientPreparation } from "./preparation";
import type { DietMenu, DietMenuEntry, MealDistribution, NutritionPlan, NutritionPlanVersionSnapshot } from "@/src/types/domain";

export type PublicationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  step?: "energy" | "macros" | "equivalents" | "meals" | "menu";
  day?: string;
  mealTimeId?: string;
};

export type PublicationValidation = {
  canPublish: boolean;
  errors: PublicationIssue[];
  warnings: PublicationIssue[];
  info: PublicationIssue[];
};

const error = (code: string, message: string, location: Omit<PublicationIssue, "code" | "message" | "severity"> = {}): PublicationIssue => ({ code, message, severity: "error", ...location });

function validEntry(entry: DietMenuEntry) {
  const quantityValid = Number.isFinite(entry.quantity) && entry.quantity > 0;
  if (!quantityValid || !entry.unit) return false;
  if (entry.type === "food") return Boolean(entry.food_snapshot);
  return Boolean(entry.recipe_snapshot && (entry.recipe_snapshot.items.length || entry.recipe_snapshot.tags?.includes("nuthrick:verified-water")));
}

/**
 * The client counterpart of the publication checks. It makes the review useful
 * before a request is sent; the protected RPC repeats the critical structural
 * checks against the persisted revision and remains authoritative.
 */
export function validateNutritionPlanForPublication(plan: NutritionPlan): PublicationValidation {
  const errors: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];
  const info: PublicationIssue[] = [];
  if (!plan.patient_id) errors.push(error("PATIENT_REQUIRED", "Asigna un paciente antes de publicar."));
  if (!Number.isFinite(plan.target_calories) || !plan.target_calories || plan.target_calories <= 0)
    errors.push(error("ENERGY_TARGET_REQUIRED", "Define un objetivo energético válido.", { step: "energy" }));
  if (!plan.macro_distribution?.complete)
    errors.push(error("MACROS_INCOMPLETE", "Completa y confirma los macronutrientes.", { step: "macros" }));
  if (plan.exchange_prescription?.status !== "ready" || !plan.exchange_prescription.confirmed_at)
    errors.push(error("EXCHANGES_UNCONFIRMED", "Completa y confirma los equivalentes.", { step: "equivalents" }));
  if (!plan.meal_distribution || plan.meal_distribution.status !== "ready" || !plan.meal_distribution.confirmed_at)
    errors.push(error("MEAL_DISTRIBUTION_INCOMPLETE", "Completa y confirma los tiempos de comida.", { step: "meals" }));

  const distribution = plan.meal_distribution;
  const menu = plan.diet_menu;
  const week = menu?.week_plan;
  if (!distribution || !menu || !week) {
    errors.push(error("CALENDAR_REQUIRED", "Organiza y aplica al menos un día del calendario.", { step: "menu" }));
    return { canPublish: false, errors, warnings, info };
  }
  if (menu.status !== "ready" || !menu.confirmed_at)
    errors.push(error("MENU_UNCONFIRMED", "Confirma el menú aplicado antes de publicarlo.", { step: "menu" }));
  for (const message of weekProblems(menu, distribution, week))
    errors.push(error("CALENDAR_INCOMPATIBLE", message, { step: "menu" }));
  for (const day of week.days) {
    const used = new Set<string>();
    for (const applied of day.assignments) {
      if (used.has(applied.meal_time_id))
        errors.push(error("DAY_ASSIGNMENT_DUPLICATED", `${dayName(day.day)} tiene un tiempo duplicado.`, { step: "menu", day: day.day, mealTimeId: applied.meal_time_id }));
      used.add(applied.meal_time_id);
      const differences = optionPortionDifferences(menu, distribution, applied.option_snapshot);
      if (differences.length) {
        const mealName = distribution.meal_times.find(meal => meal.id === applied.meal_time_id)?.display_name ?? "Tiempo de comida";
        warnings.push({
          code: "APPLIED_PORTION_DIFFERENCES", severity: "warning", step: "menu", day: day.day, mealTimeId: applied.meal_time_id,
          message: `${dayName(day.day)} · ${mealName}: porciones distintas a la distribución (${differences.map(row => `${getExchangeGroup(row.group_code).shortName}: ${row.used} de ${row.portions} eq`).join("; ")}).`,
        });
      }
      if (applied.option_snapshot.meal_time_id !== applied.meal_time_id || !optionIsEligible(menu, distribution, applied.option_snapshot))
        errors.push(error("APPLIED_OPTION_INVALID", `${dayName(day.day)} tiene una opción que necesita revisión.`, { step: "menu", day: day.day, mealTimeId: applied.meal_time_id }));
      if (!applied.option_snapshot.entries.length || applied.option_snapshot.entries.some((entry) => !validEntry(entry)))
        errors.push(error("APPLIED_SNAPSHOT_INVALID", `${dayName(day.day)} contiene una comida con cantidades o snapshots incompletos.`, { step: "menu", day: day.day, mealTimeId: applied.meal_time_id }));
    }
  }
  if (!plan.current_version_id) info.push({ code: "FIRST_PUBLICATION", message: "Al publicar se conservará la primera versión clínica del plan.", severity: "info" });
  else info.push({ code: "DRAFT_AFTER_PUBLICATION", message: "El borrador puede seguir editándose; la versión vigente no cambiará.", severity: "info" });
  return { canPublish: errors.length === 0, errors, warnings, info };
}

/** Explicitly prepares a legacy one-day plan. It never invents a week or edits foods. */
export function prepareSingleDayForReview(menu: DietMenu, distribution: MealDistribution): DietMenu | null {
  if (menu.week_plan) return menu;
  const assignments = distribution.meal_times
    .filter((meal) => distribution.distribution.some((entry) => entry.meal_time_id === meal.id && entry.portions > 0))
    .map((meal) => (menu.meal_options ?? []).find((option) => option.meal_time_id === meal.id && optionIsEligible(menu, distribution, option)))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .map((option) => assignment(option));
  if (!assignments.length) return null;
  return {
    ...menu,
    week_plan: { schema_version: 1, days: [{ day: "mon", assignments }] },
    status: "ready",
    confirmed_at: new Date().toISOString(),
    source_meal_distribution_snapshot: structuredClone(distribution),
    updated_at: new Date().toISOString(),
  };
}

export type PatientPlanMeal = { name: string; time: string | null; entries: DietMenuEntry[]; preparation: PatientPreparation };
export type PatientPlanDay = { name: string; meals: PatientPlanMeal[] };
export type PatientPlanView = { title: string; patientName: string; days: PatientPlanDay[] };

function patientView(title: string, patientName: string, distribution: MealDistribution | null, calendar: DietMenu["week_plan"]): PatientPlanView {
  const byId = new Map((distribution?.meal_times ?? []).map((meal) => [meal.id, meal]));
  return {
    title,
    patientName,
    days: (calendar?.days ?? []).map((day) => ({
      name: dayName(day.day),
      meals: [...day.assignments]
        .sort((a, b) => (byId.get(a.meal_time_id)?.display_order ?? 0) - (byId.get(b.meal_time_id)?.display_order ?? 0))
        .map((applied) => ({
          name: byId.get(applied.meal_time_id)?.display_name ?? "Tiempo de comida",
          time: byId.get(applied.meal_time_id)?.time ?? null,
          entries: applied.option_snapshot.entries,
          preparation: patientPreparation(applied.option_snapshot),
        })),
    })),
  };
}

export function patientPlanViewFromDraft(plan: NutritionPlan, patientName = "Paciente"): PatientPlanView {
  return patientView(plan.title, patientName, plan.meal_distribution, plan.diet_menu?.week_plan ?? null);
}

export function patientPlanViewFromVersion(snapshot: NutritionPlanVersionSnapshot): PatientPlanView {
  return patientView(snapshot.plan.title, snapshot.patient.full_name, snapshot.prescription.meal_distribution, { schema_version: 1, days: snapshot.calendar });
}
