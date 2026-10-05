import type { NutritionPlan } from "@/src/types/domain";

export type WorkshopStage = NonNullable<NutritionPlan["last_workshop_step"]>;

export const workshopStageLabels: Record<WorkshopStage, string> = {
  energy: "Energía",
  macros: "Macros",
  equivalents: "Equivalentes",
  meals: "Tiempos de comida",
  menu: "Menú",
  review: "Revisión",
};

export const workshopStageOrder: WorkshopStage[] = [
  "energy", "macros", "equivalents", "meals", "menu", "review",
];

export function workshopStage(plan: NutritionPlan): WorkshopStage {
  const saved = plan.last_workshop_step;
  if (saved && workshopStageOrder.includes(saved)) return saved;
  if (plan.current_version_id || plan.text_diet || plan.diet_menu?.status === "ready") return "review";
  if (plan.diet_menu) return "menu";
  if (plan.meal_distribution) return "meals";
  if (plan.exchange_prescription) return "equivalents";
  if (plan.macro_distribution) return "macros";
  return "energy";
}
