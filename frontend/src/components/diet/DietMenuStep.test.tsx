import { clearProposalSession } from "./useProposalExplorer";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DietMenuStep } from "@/src/components/diet/DietMenuStep";
import { activeMenu, calculateMenuUsage, createFoodSnapshot, exchangeContributionForFood } from "@/src/features/menu/model";
import type { CustomRecipeInput } from "@/src/services/foodCatalog";
import type { FoodItem, MealDistribution, NutritionPlan, Recipe } from "@/src/types/domain";

const services = vi.hoisted(() => ({
  listFoodItems: vi.fn(), listRecipes: vi.fn(), createCustomFood: vi.fn(), createCustomRecipe: vi.fn(),
}));
vi.mock("@/src/services/foodCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/services/foodCatalog")>()),
  ...services,
}));

const food: FoodItem = {
  id: "fruit", owner_id: "owner", stable_code: null, catalog_code: null, name: "Papaya", normalized_name: "papaya", aliases: [], brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code: "FRUITS",
  portion_amount: 1, portion_unit: "cup", portion_description: "1 taza", alternate_portions: [], edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: {}, source: "PROFESSIONAL_CUSTOM", source_version: "1", source_reference: null, is_custom: true, use_count: 0, active: true,
  created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
};
const cerealFood: FoodItem = {
  ...food,
  id: "cereal",
  name: "Tortilla",
  normalized_name: "tortilla",
  group_code: "CEREALS_NO_FAT",
  portion_unit: "tortilla",
  portion_description: "1 tortilla",
};
const mealDistribution: MealDistribution = {
  schema_version: 1, source_exchange_snapshot: null,
  meal_times: [{ id: "breakfast", meal_type: "BREAKFAST", display_name: "Desayuno", time: "08:00", display_order: 0 }],
  distribution: [{ meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 }],
  derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
};
const recipe: Recipe = {
  id: "recipe", owner_id: "owner", stable_code: null, name: "Papaya fresca", normalized_name: "papaya fresca", description: null,
  meal_types: ["BREAKFAST"], servings: 1, instructions: null, image_path: null, tags: [], substitution_notes: null, source: "PROFESSIONAL_CUSTOM",
  source_version: "1", source_reference: null, is_custom: true, active: true, created_at: "", updated_at: "", items: [{
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
    clearProposalSession();
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
    expect(screen.getByRole("tab", { name: /Desayuno/ })).toBeInTheDocument();
    expect(screen.getByText("Falta 1")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Agregar alimento" })).toBeInTheDocument();
  });

  it("opens a contextual food search and adds a fractional-capable item", async () => {
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByText("Falta 1"));
    expect(await screen.findByRole("heading", { name: "Alimentos · Frutas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver otros grupos" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cantidad de Papaya"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Cubierto")).toBeInTheDocument();
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
  });

  it("finds a canonical catalog food through an alias", async () => {
    const chicken = {
      ...food,
      id: "chicken",
      owner_id: null,
      stable_code: "MX_COOKED_CHICKEN_BREAST",
      name: "Pechuga de pollo cocida sin piel",
      normalized_name: "pechuga de pollo cocida sin piel",
      aliases: ["pollo", "pollo cocido", "pollo deshebrado"],
      group_code: "AOA_LOW_FAT" as const,
      portion_amount: 40,
      portion_unit: "g" as const,
      portion_description: "40 g",
      source: "NOM-037-SSA2-2012",
      source_reference: "Apéndice F.3",
      is_custom: false,
    };
    render(<DietMenuStep plan={plan} catalog={{ foods: [food, chicken], recipes: [] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar alimento" }));
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    fireEvent.change(screen.getByPlaceholderText("Buscar alimento"), { target: { value: "deshebrado" } });
    expect(screen.getByText("Pechuga de pollo cocida sin piel")).toBeInTheDocument();
    expect(screen.queryByText("Papaya")).not.toBeInTheDocument();
  });

  it("filters a pending AOA subtype exactly and still allows manual expansion", async () => {
    const veryLow = { ...food, id: "chicken", name: "Pechuga de pollo", normalized_name: "pechuga de pollo", group_code: "AOA_VERY_LOW_FAT" as const };
    const moderate = { ...food, id: "egg", name: "Huevo entero", normalized_name: "huevo entero", group_code: "AOA_MODERATE_FAT" as const };
    const aoaDistribution = { ...mealDistribution, distribution: [{ meal_time_id: "breakfast", group_code: "AOA_VERY_LOW_FAT" as const, portions: 1 }] };
    render(<DietMenuStep plan={{ ...plan, meal_distribution: aoaDistribution }} catalog={{ foods: [veryLow, moderate], recipes: [] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByText("Falta 1"));
    expect(screen.getByRole("heading", { name: "Alimentos · AOA muy bajos" })).toBeInTheDocument();
    expect(screen.getByText("Pechuga de pollo")).toBeInTheDocument();
    expect(screen.queryByText("Huevo entero")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver otros grupos" }));
    fireEvent.click(screen.getByRole("button", { name: "AOA" }));
    expect(screen.getByText("Pechuga de pollo")).toBeInTheDocument();
    expect(screen.getByText("Huevo entero")).toBeInTheDocument();
  });

  it("ranks and adds a reusable recipe by compatibility", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    expect(await screen.findByText("Dentro de tolerancia")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al menú" }));
    expect(screen.getByText("Papaya fresca")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar menú" })).toBeEnabled();
  });

  it("filters starter recipes by meal type without crowding the browser", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    await screen.findByText("Papaya fresca");
    fireEvent.click(screen.getByRole("button", { name: "Cena" }));
    expect(screen.queryByText("Papaya fresca")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desayuno" }));
    expect(screen.getByText("Papaya fresca")).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Papaya" })).toBeInTheDocument();
  });

  it("confirms immediately only when every equivalent is represented", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DietMenuStep plan={plan} onSave={onSave} onGoToMeals={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Confirmar menú" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    await screen.findByText("Papaya fresca");
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al menú" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar menú" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" })));
  });

  it("reviews ingredient amounts and keeps adjustments in the plan snapshot", async () => {
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar" }));
    fireEvent.change(screen.getByLabelText("Cantidad de Papaya"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al menú" }));
    expect(screen.getByText("¿Guardar estos ajustes como una nueva receta?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No, sólo este plan" }));
    expect(screen.getByText("Papaya fresca")).toBeInTheDocument();
    expect(recipe.items[0].amount).toBe(1);
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
  });

  it("can save adjusted ingredients as a personal copy", async () => {
    render(<DietMenuStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar" }));
    fireEvent.change(screen.getByLabelText("Cantidad de Papaya"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al menú" }));
    fireEvent.change(screen.getByLabelText("Nombre de la copia"), { target: { value: "Papaya personal" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar copia" }));
    await waitFor(() => expect(services.createCustomRecipe).toHaveBeenCalledWith(expect.objectContaining({ name: "Papaya personal" })));
  });

  it("previews and applies a deterministic proposal without saving immediately", async () => {
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} catalog={{ foods: [food], recipes: [recipe] }} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    expect(screen.getByRole("heading", { name: "Propuesta del día" })).toBeInTheDocument();
    expect(screen.getByText("Vista previa editable")).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
  });

  it("discards a proposal without changing the persisted draft", () => {
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} catalog={{ foods: [food], recipes: [recipe] }} onSave={vi.fn()} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("heading", { name: "Propuesta del día" })).not.toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("creates a personal recipe from proposed foods with ingredients prefilled", async () => {
    const twoGroupDistribution = {
      ...mealDistribution,
      distribution: [
        ...mealDistribution.distribution,
        { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 2 },
      ],
    };
    render(<DietMenuStep plan={{ ...plan, meal_distribution: twoGroupDistribution }} catalog={{ foods: [food, cerealFood], recipes: [] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear receta" }));
    const selection = screen.getByRole("dialog", {name:"Selecciona qué forma la preparación"});
    within(selection).getAllByRole("checkbox").forEach(box=>{expect(box).not.toBeChecked();fireEvent.click(box);});
    fireEvent.click(screen.getByRole("button", {name:"Continuar con selección"}));
    expect(within(screen.getByRole("dialog", {name:"Preparación"})).getByText(/1 taza · Papaya/)).toBeInTheDocument();
    expect(screen.getByText(/2 tortilla · Tortilla/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Papaya con tortillas" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar en mi biblioteca" }));
    await waitFor(() => expect(services.createCustomRecipe).toHaveBeenCalledWith(expect.objectContaining({
      name: "Papaya con tortillas",
      items: expect.arrayContaining([
        expect.objectContaining({ food: expect.objectContaining({ id: "fruit" }), amount: 1 }),
        expect.objectContaining({ food: expect.objectContaining({ id: "cereal" }), amount: 2 }),
      ]),
    })));
    expect(await screen.findByText("¿Usar “Papaya fresca” en el menú?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByRole("heading", { name: "Propuesta del día" })).toBeInTheDocument();
  });

  it("expands a proposed recipe with its additional food before creating a derived recipe", () => {
    const twoGroupDistribution = {
      ...mealDistribution,
      distribution: [
        ...mealDistribution.distribution,
        { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 2 },
      ],
    };
    render(<DietMenuStep plan={{ ...plan, meal_distribution: twoGroupDistribution }} catalog={{ foods: [food, cerealFood], recipes: [recipe] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    expect(screen.getByRole("button", {name:/Editar receta Papaya fresca/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear receta" }));
    const selection = screen.getByRole("dialog", {name:"Selecciona qué forma la preparación"});
    within(selection).getAllByRole("checkbox").forEach(box=>{expect(box).not.toBeChecked();fireEvent.click(box);});
    fireEvent.click(screen.getByRole("button", {name:"Continuar con selección"}));
    expect(screen.getByText(/Los ingredientes corresponden al rendimiento total/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Tortilla con papaya");
    expect(within(screen.getByRole("dialog", {name:"Preparación"})).getByText(/1 taza · Papaya/)).toBeInTheDocument();
    expect(screen.getByText(/2 tortilla · Tortilla/)).toBeInTheDocument();
  });

  it("can cancel recipe creation without changing the proposal", () => {
    const twoGroupDistribution = { ...mealDistribution, distribution: [
      ...mealDistribution.distribution,
      { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 2 },
    ] };
    render(<DietMenuStep plan={{ ...plan, meal_distribution: twoGroupDistribution }} catalog={{ foods: [food, cerealFood], recipes: [] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear receta" }));
    const selection = screen.getByRole("dialog", {name:"Selecciona qué forma la preparación"});
    within(selection).getAllByRole("checkbox").forEach(box=>{expect(box).not.toBeChecked();fireEvent.click(box);});
    fireEvent.click(screen.getByRole("button", {name:"Continuar con selección"}));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Propuesta del día" })).toBeInTheDocument();
    expect(services.createCustomRecipe).not.toHaveBeenCalled();
  });

  it("replaces proposed foods with the saved recipe only after choosing Sí", async () => {
    const onDraftChange = vi.fn();
    const twoGroupDistribution = { ...mealDistribution, distribution: [
      ...mealDistribution.distribution,
      { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 2 },
    ] };
    services.createCustomRecipe.mockImplementationOnce(async (input: CustomRecipeInput) => ({
      ...recipe,
      id: "personal-recipe",
      name: input.name,
      items: input.items.map((item, index) => ({
        id: `personal-item-${index}`,
        owner_id: "owner",
        recipe_id: "personal-recipe",
        food_item_id: item.food.id,
        amount: item.amount,
        unit: item.food.portion_unit,
        display_order: index,
        food_snapshot: createFoodSnapshot(item.food),
        exchange_contribution: exchangeContributionForFood(item.food, item.amount),
        created_at: "",
      })),
    }));
    render(<DietMenuStep plan={{ ...plan, meal_distribution: twoGroupDistribution }} catalog={{ foods: [food, cerealFood], recipes: [] }} onSave={vi.fn()} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear receta" }));
    const selection = screen.getByRole("dialog", {name:"Selecciona qué forma la preparación"});
    within(selection).getAllByRole("checkbox").forEach(box=>{expect(box).not.toBeChecked();fireEvent.click(box);});
    fireEvent.click(screen.getByRole("button", {name:"Continuar con selección"}));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Desayuno personal" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar en mi biblioteca" }));
    expect(await screen.findByText("¿Usar “Desayuno personal” en el menú?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(screen.getByText("Desayuno personal")).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    const savedMenu = onDraftChange.mock.calls.at(-1)?.[0];
    expect(activeMenu(savedMenu).meal_menus[0].entries).toHaveLength(1);
    expect(activeMenu(savedMenu).meal_menus[0].entries[0]).toMatchObject({ type: "recipe", source_id: "personal-recipe" });
    expect(calculateMenuUsage(savedMenu)).toEqual(expect.arrayContaining([
      { meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 },
      { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT", portions: 2 },
    ]));
  });

  it("offers only exact-group ingredient substitutes and saves them as a copy", async () => {
    const apple = { ...food, id: "apple", name: "Manzana", normalized_name: "manzana", portion_unit: "piece" as const, portion_description: "1 pieza" };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DietMenuStep plan={plan} catalog={{ foods: [food, apple, cerealFood], recipes: [recipe] }} onSave={onSave} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar receta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("button", { name: "Intercambiar Papaya" }));
    const selector = screen.getByRole("listbox", { name: "Alternativas para Papaya" });
    expect(selector).toHaveTextContent("Papaya");
    expect(selector).toHaveTextContent("Manzana");
    expect(selector).not.toHaveTextContent("Tortilla");
    fireEvent.click(within(selector).getByRole("option", { name: /Manzana/ }));
    expect(screen.getByLabelText("Cantidad de Manzana")).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: "Agregar al menú" }));
    fireEvent.change(screen.getByLabelText("Nombre de la copia"), { target: { value: "Fruta personal" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar copia" }));
    await waitFor(() => expect(services.createCustomRecipe).toHaveBeenCalledWith(expect.objectContaining({
      name: "Fruta personal",
      items: [expect.objectContaining({ food: expect.objectContaining({ id: "apple" }), amount: 1 })],
    })));
    expect(recipe.items[0].food_item_id).toBe("fruit");
    expect(await screen.findByRole("dialog", { name: "Preparación guardada" })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("distinguishes day and time proposals, and keeps a food exchange temporary until Apply", async () => {
    const preferredPapaya = { ...food, use_count: 20 };
    const guava = { ...food, id: "guava", name: "Guayaba", normalized_name: "guayaba", portion_amount: 0.5, portion_description: "½ taza" };
    const onDraftChange = vi.fn();
    render(<DietMenuStep plan={plan} catalog={{ foods: [preferredPapaya, guava], recipes: [] }} onSave={vi.fn()} onDraftChange={onDraftChange} onGoToMeals={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" })).toHaveTextContent("Proponer día");
    expect(screen.getByRole("button", { name: "Proponer alimentos y recetas para este tiempo de comida" })).toHaveTextContent("Proponer tiempo");
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Intercambiar Papaya" }));
    const alternatives = screen.getByRole("listbox", { name: "Alternativas para Papaya" });
    expect(alternatives).toHaveTextContent("Papaya");
    expect(alternatives).toHaveTextContent("Guayaba");
    fireEvent.click(screen.getByRole("option", { name: /Guayaba/ }));
    expect(screen.getByRole("button", { name: "Intercambiar Guayaba" })).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
    const savedMenu = onDraftChange.mock.calls.at(-1)?.[0];
    expect(activeMenu(savedMenu).meal_menus[0].entries[0]).toMatchObject({ name_snapshot: "Guayaba", quantity: 0.5 });
    expect(calculateMenuUsage(savedMenu)).toContainEqual({ meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 });
  });

  it("keeps an explicitly written recipe name instead of replacing it after ingredient edits", () => {
    const twoGroupDistribution = { ...mealDistribution, distribution: [
      ...mealDistribution.distribution,
      { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 2 },
    ] };
    render(<DietMenuStep plan={{ ...plan, meal_distribution: twoGroupDistribution }} catalog={{ foods: [food, cerealFood], recipes: [] }} onSave={vi.fn()} onGoToMeals={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer alimentos y recetas para todos los tiempos pendientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear receta" }));
    const selection = screen.getByRole("dialog", {name:"Selecciona qué forma la preparación"});
    within(selection).getAllByRole("checkbox").forEach(box=>{expect(box).not.toBeChecked();fireEvent.click(box);});
    fireEvent.click(screen.getByRole("button", {name:"Continuar con selección"}));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Tortilla con papaya");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Mi desayuno favorito" } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Tortilla" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Mi desayuno favorito");
  });
  it("edits A, visits B then returns to edited A without saving; applies, undoes and shares classic state", async () => {
    const apple={...food,id:"apple",name:"Manzana",normalized_name:"manzana"};
    const onSave=vi.fn().mockResolvedValue(undefined);
    const onDraftChange=vi.fn();
    render(<DietMenuStep plan={plan} catalog={{foods:[food,apple],recipes:[]}} onSave={onSave} onDraftChange={onDraftChange} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Proponer alimentos y recetas para este tiempo de comida"}));
    const originalName=screen.getByRole("spinbutton",{name:/Cantidad de/}).getAttribute("aria-label")!;
    fireEvent.change(screen.getByRole("spinbutton",{name:originalName}),{target:{value:"1.33"}});
    fireEvent.click(screen.getByRole("button",{name:"Otra propuesta"}));
    fireEvent.click(screen.getByRole("button",{name:"Propuesta anterior"}));
    expect(screen.getByRole("spinbutton",{name:originalName})).toHaveValue(1.33);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Aplicar propuesta"}));
    await waitFor(()=>expect(onSave).toHaveBeenCalled());
    expect(activeMenu(onDraftChange.mock.calls.at(-1)![0]).meal_menus[0].entries[0].quantity).toBe(1.33);
    fireEvent.click(screen.getByRole("button",{name:"Vista clásica"}));
    expect(screen.getByRole("spinbutton",{name:originalName})).toHaveValue(1.33);
    fireEvent.click(screen.getByRole("button",{name:"Deshacer aplicación"}));
    expect(activeMenu(onDraftChange.mock.calls.at(-1)![0]).meal_menus[0].entries).toHaveLength(0);
  });

  it("invalidates the preview when its prescription changes and does not save it",()=>{
    const onDraftChange=vi.fn();
    const props={plan,catalog:{foods:[food],recipes:[]},onSave:vi.fn(),onDraftChange,onGoToMeals:vi.fn()};
    const view=render(<DietMenuStep {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:"Proponer alimentos y recetas para este tiempo de comida"}));
    view.rerender(<DietMenuStep {...props} plan={{...plan,meal_distribution:{...mealDistribution,distribution:[{meal_time_id:"breakfast",group_code:"FRUITS",portions:2}]}}}/>);
    expect(screen.queryByRole("button",{name:"Aplicar propuesta"})).not.toBeInTheDocument();
    expect(screen.getByText(/Las condiciones cambiaron/)).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("conserves a proposed element while exploring other choices, without applying it",()=>{
    const d={...mealDistribution,distribution:[...mealDistribution.distribution,{meal_time_id:"breakfast",group_code:"CEREALS_NO_FAT" as const,portions:2}]};
    const otherCereal={...cerealFood,id:"bread",name:"Pan",normalized_name:"pan"};
    const onDraftChange=vi.fn();
    render(<DietMenuStep plan={{...plan,meal_distribution:d}} catalog={{foods:[food,cerealFood,otherCereal],recipes:[]}} onSave={vi.fn()} onDraftChange={onDraftChange} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Proponer alimentos y recetas para este tiempo de comida"}));
    fireEvent.click(screen.getByRole("button",{name:"Conservar Papaya"}));
    fireEvent.click(screen.getByRole("button",{name:"Otra propuesta"}));
    expect(screen.getByRole("heading",{name:"Papaya"})).toBeInTheDocument();
    expect(screen.getByRole("spinbutton",{name:"Cantidad de Papaya"})).toHaveValue(1);
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("filters exclusions from manual choices while an avoid preference remains available",()=>{
    const apple={...food,id:"apple",name:"Manzana",normalized_name:"manzana"};
    const base={schema_version:1 as const,source_meal_distribution_snapshot:null,menus:[{id:"m",name:"Menú",display_order:0,meal_menus:[{meal_time_id:"breakfast",entries:[]}]}],active_menu_id:"m",derived_exchange_usage:[],status:"not_started" as const,confirmed_at:null,updated_at:"",food_preferences:{fruit:"exclude" as const,apple:"avoid" as const}};
    render(<DietMenuStep plan={{...plan,diet_menu:base}} catalog={{foods:[food,apple],recipes:[recipe]}} onSave={vi.fn()} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Agregar alimento"}));
    expect(screen.queryByText("Papaya")).not.toBeInTheDocument();
    expect(screen.getByText("Manzana")).toBeInTheDocument();
    expect(screen.getByText(/Prefiere evitar/)).toBeInTheDocument();
  });

  it("adds plain water inside an exploration, then discards without clinical writes",()=>{
    const onDraftChange=vi.fn();
    render(<DietMenuStep plan={plan} catalog={{foods:[food],recipes:[]}} onSave={vi.fn()} onDraftChange={onDraftChange} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Proponer alimentos y recetas para este tiempo de comida"}));
    fireEvent.click(screen.getByRole("button",{name:"Agregar bebida"}));
    expect(screen.getByText(/Bebida opcional · sin aporte en equivalentes/)).toBeInTheDocument();
    expect(screen.queryByText("Poco compatible")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Revisar"}));
    fireEvent.click(screen.getByRole("button",{name:"Agregar al menú"}));
    expect(screen.getByRole("heading",{name:"Agua natural · vaso de 240 ml"})).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Descartar"}));
    expect(screen.queryByRole("heading",{name:"Agua natural · vaso de 240 ml"})).not.toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("keeps a failed autosave visible and retries explicitly",async()=>{
    const onSave=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<DietMenuStep plan={plan} catalog={{foods:[food],recipes:[]}} onSave={onSave} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Agregar alimento"}));
    fireEvent.click(screen.getByRole("button",{name:"Agregar"}));
    fireEvent.click(await screen.findByRole("button",{name:"Reintentar guardado"}));
    await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading",{name:"Papaya"})).toBeInTheDocument();
  });

});
