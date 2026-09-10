import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createExchangePrescription, setExchangePortions } from "@/src/features/exchanges/model";
import { applyMealDistributionSuggestion, createMealDistribution, suggestMealDistribution } from "@/src/features/meal-distribution/model";
import type { ExchangePrescription, NutritionPlan } from "@/src/types/domain";
import { DietMealDistributionStep } from "./DietMealDistributionStep";

const targets = { energy_kcal: 1800, carbohydrate_g: 225, protein_g: 90, fat_g: 60 };
let exchange: ExchangePrescription = createExchangePrescription(targets);
exchange = setExchangePortions(exchange, targets, "VEGETABLES", 3);
exchange = setExchangePortions(exchange, targets, "FRUITS", 2);
exchange = setExchangePortions(exchange, targets, "CEREALS_NO_FAT", 4);

const plan: NutritionPlan = {
  id: "plan", professional_id: "professional", patient_id: "patient", consultation_id: "consultation", title: "Plan",
  assigned_at: "2026-09-10", review_date: null, plan_type: null, category: null, target_calories: 1800,
  energy_calculation: null, macro_distribution: null, exchange_prescription: exchange, meal_distribution: null, diet_menu: null, status: "draft",
  created_at: "2026-09-10T12:00:00Z", updated_at: "2026-09-10T12:00:00Z",
};

describe("DietMealDistributionStep", () => {
  it("asks for equivalents when the inventory is empty", () => {
    const emptyPlan = { ...plan, exchange_prescription: createExchangePrescription(targets) };
    render(<DietMealDistributionStep plan={emptyPlan} onSave={vi.fn()} onDraftChange={vi.fn()} onGoToEquivalents={vi.fn()} />);
    expect(screen.getByText("Define primero los equivalentes del día.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a Equivalentes" })).toBeInTheDocument();
  });

  it("shows default times, edits a decimal cell and autosaves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietMealDistributionStep plan={plan} onSave={onSave} onDraftChange={onDraftChange} onGoToEquivalents={vi.fn()} />);
    expect(screen.getByLabelText("Nombre de Desayuno")).toHaveValue("Desayuno");
    expect(screen.getByLabelText("Nombre de Colación 1")).toHaveValue("Colación 1");
    fireEvent.change(screen.getAllByLabelText("Verduras en Desayuno")[0], { target: { value: "1.5" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ distribution: expect.arrayContaining([expect.objectContaining({ group_code: "VEGETABLES", portions: 1.5 })]), status: "editing" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1200 });
  });

  it("adds, renames, schedules and removes an empty meal time inline", () => {
    const onDraftChange = vi.fn();
    render(<DietMealDistributionStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToEquivalents={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar tiempo" }));
    fireEvent.change(screen.getByLabelText("Nombre del nuevo tiempo"), { target: { value: "Preentreno" } });
    fireEvent.change(screen.getByLabelText("Hora del nuevo tiempo"), { target: { value: "17:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByDisplayValue("Preentreno")).toBeInTheDocument();
    expect(screen.getByDisplayValue("17:30")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre de Preentreno"), { target: { value: "Postentreno" } });
    expect(screen.getByDisplayValue("Postentreno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Postentreno" }));
    expect(screen.queryByDisplayValue("Postentreno")).not.toBeInTheDocument();
  });

  it("warns before deleting a meal with assigned exchanges", () => {
    const existing = createMealDistribution(() => `meal-${Math.random()}`);
    const breakfastId = existing.meal_times[0].id;
    const withValue = applyMealDistributionSuggestion(existing, {
      distribution: [{ group_code: "VEGETABLES", meal_time_id: breakfastId, portions: 1 }],
      derived_meal_totals: [],
      metadata: { algorithm: "MEAL_DISTRIBUTION_V1", generated_at: "2026-09-10T12:00:00Z", base: "zero" },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DietMealDistributionStep plan={{ ...plan, meal_distribution: withValue }} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={vi.fn()} onGoToEquivalents={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Desayuno" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("volverán a quedar pendientes"));
    expect(screen.getByLabelText("Nombre de Desayuno")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("previews, discards and applies a deterministic proposal without confirming it", () => {
    const onDraftChange = vi.fn();
    render(<DietMealDistributionStep plan={plan} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToEquivalents={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer distribución" }));
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Sin aplicar")).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conservar mi distribución" }));
    expect(screen.queryByText("Vista previa")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Proponer distribución" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "editing", suggestion_metadata: expect.objectContaining({ algorithm: "MEAL_DISTRIBUTION_V1" }) }));
  });

  it("confirms a complete applied proposal immediately with a snapshot", async () => {
    const base = createMealDistribution(() => `meal-${Math.random()}`);
    const complete = applyMealDistributionSuggestion(base, suggestMealDistribution(base, exchange));
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<DietMealDistributionStep plan={{ ...plan, meal_distribution: complete }} onSave={onSave} onDraftChange={vi.fn()} onGoToEquivalents={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar distribución" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", source_exchange_snapshot: expect.any(Object) }), true));
  });
});
