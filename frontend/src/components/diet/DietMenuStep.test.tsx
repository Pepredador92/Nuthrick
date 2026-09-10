import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DietMenuStep } from "@/src/components/diet/DietMenuStep";
import { createFoodSnapshot, exchangeContributionForFood } from "@/src/features/menu/model";
import type { FoodItem, MealDistribution, NutritionPlan, Recipe } from "@/src/types/domain";

const services = vi.hoisted(() => ({
  listFoodItems: vi.fn(), listRecipes: vi.fn(), createCustomFood: vi.fn(), createCustomRecipe: vi.fn(),
}));
vi.mock("@/src/services/foodCatalog", () => services);

const food: FoodItem = {
  id: "fruit", owner_id: "owner", name: "Papaya", normalized_name: "papaya", brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code: "FRUITS",
  portion_amount: 1, portion_unit: "cup", portion_description: "1 taza", edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: {}, source: "PROFESSIONAL_CUSTOM", source_version: "1", is_custom: true, use_count: 0, active: true,
  created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
};
const mealDistribution: MealDistribution = {
  schema_version: 1, source_exchange_snapshot: null,
  meal_times: [{ id: "breakfast", meal_type: "BREAKFAST", display_name: "Desayuno", time: "08:00", display_order: 0 }],
  distribution: [{ meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 }],
  derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
};
const recipe: Recipe = {
  id: "recipe", owner_id: "owner", name: "Papaya fresca", normalized_name: "papaya fresca", description: null,
  meal_types: ["BREAKFAST"], servings: 1, instructions: null, image_path: null, source: "PROFESSIONAL_CUSTOM",
  source_version: "1", is_custom: true, active: true, created_at: "", updated_at: "", items: [{
    id: "item", owner_id: "owner", recipe_id: "recipe", food_item_id: food.id, amount: 1, unit: "cup", display_order: 0,
    food_snapshot: createFoodSnapshot(food), exchange_contribution: exchangeContributionForFood(food, 1), created_at: "",
  }],
};
const plan: NutritionPlan = {
  id: "plan", professional_id: "owner", patient_id: null, consultation_id: null, title: "Plan", assigned_at: "2026-09-10",
  review_date: null, plan_type: null, category: null, target_calories: 1800, energy_calculation: null,
  macro_distribution: null, exchange_prescription: null, meal_distribution: mealDistribution, diet_menu: null,
  status: "draft", created_at: "", updated_at: "",
};

describe("DietMenuStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.listFoodItems.mockResolvedValue([food]);
    services.listRecipes.mockResolvedValue([recipe]);
    services.createCustomFood.mockResolvedValue(food);
    services.createCustomRecipe.mockResolvedValue(recipe);
  });

  it("guides back when no meal distribution exists", () => {
    render(<DietMenuStep plan={{ ...plan, meal_distribution: null }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    expect(screen.getByText("Distribuye primero los equivalentes entre tiempos de comida.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a Tiempos de comida" })).toBeInTheDocument();
  });

  it("shows one meal at a time with its permanent missing exchanges", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Desayuno" })).toBeInTheDocument();
    expect(screen.getByText("Falta 1")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Agregar alimento" })).toBeInTheDocument();
  });

  it("opens a contextual food search and adds a fractional-capable item", async () => {
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByText("Falta 1"));
    expect(await screen.findByText("Filtrado por Frutas")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cantidad de Papaya"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Completo")).toBeInTheDocument();
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
  });

  it("ranks and adds a reusable recipe by compatibility", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    expect(await screen.findByText(/Cubre las porciones asignadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Papaya fresca")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar menú" })).toBeEnabled();
  });

  it("creates a custom food in context and uses it immediately", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar alimento" }));
    await screen.findByText("Agregar alimento personalizado");
    fireEvent.click(screen.getByRole("button", { name: /Agregar alimento personalizado/ }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Papaya local" } });
    fireEvent.change(screen.getByLabelText("Descripción para el paciente"), { target: { value: "1 taza" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar alimento" }));
    await waitFor(() => expect(services.createCustomFood).toHaveBeenCalled());
    expect(screen.getByText("Papaya")).toBeInTheDocument();
  });

  it("confirms immediately only when every equivalent is represented", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DietMenuStep plan={plan} onSave={onSave} onGoToMeals={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Confirmar menú" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    await screen.findByText("Papaya fresca");
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar menú" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" })));
  });
});
