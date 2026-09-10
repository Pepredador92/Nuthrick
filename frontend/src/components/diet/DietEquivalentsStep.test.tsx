import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DietEquivalentsStep } from "./DietEquivalentsStep";
import type { NutritionPlan } from "@/src/types/domain";

const plan: NutritionPlan = {
  id: "plan", professional_id: "professional", patient_id: "patient", consultation_id: "consultation", title: "Plan nutricional",
  assigned_at: "2026-09-09", review_date: null, plan_type: null, category: null, target_calories: 2000,
  energy_calculation: null, macro_distribution: null, exchange_prescription: null, meal_distribution: null, diet_menu: null, status: "draft",
  created_at: "2026-09-09T12:00:00Z", updated_at: "2026-09-09T12:00:00Z",
};
const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };

describe("DietEquivalentsStep", () => {
  it("edits decimal portions, keeps the contribution secondary, and confirms without requiring an exact match", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={() => undefined} />);

    expect(screen.getAllByText("Ver aporte")).toHaveLength(17);
    expect(screen.getAllByText("1 equivalente:", { selector: "span" })).toHaveLength(17);
    fireEvent.change(screen.getAllByLabelText("Porciones de Verduras")[0], { target: { value: "0.5" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      derived_totals: expect.objectContaining({ energy_kcal: 12.5, carbohydrate_g: 2, protein_g: 1 }),
      status: "editing",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Confirmar equivalentes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", confirmed_at: expect.any(String) }), true));
  });

  it("previews a mathematical proposal without applying or confirming it", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    expect(screen.getByText("Vista previa de propuesta")).toBeInTheDocument();
    expect(screen.getByText("Sin aplicar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar propuesta" })).toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("applies a proposal as an editable draft and allows discarding the preview", () => {
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={onDraftChange} onGoToMacros={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Conservar mis porciones" }));
    expect(screen.queryByText("Vista previa de propuesta")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "editing",
      confirmed_at: null,
      suggestion_source: "automatic",
      suggestion_algorithm: "EXCHANGE_SUGGESTION_V1",
    }));
    expect(screen.getByRole("button", { name: "Confirmar equivalentes" })).toBeInTheDocument();
  });

  it("asks for macronutrients when the inherited targets are unavailable", () => {
    render(<DietEquivalentsStep plan={plan} targets={null} onSave={async () => undefined} onDraftChange={() => undefined} onGoToMacros={() => undefined} />);
    expect(screen.getByRole("button", { name: "Ir a macronutrientes" })).toBeInTheDocument();
  });
});
