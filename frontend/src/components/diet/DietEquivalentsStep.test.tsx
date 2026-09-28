import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProposalSession } from "./useProposalExplorer";
vi.mock("./usePreparationCatalog", () => ({ usePreparationCatalog: () => ({ loading: false }) }));
beforeEach(clearProposalSession);
import { DietEquivalentsStep } from "./DietEquivalentsStep";
import { createExchangePrescription, setExchangePortions } from "@/src/features/exchanges/model";
import type { NutritionPlan } from "@/src/types/domain";

const plan: NutritionPlan = {
  id: "plan", professional_id: "professional", patient_id: "patient", consultation_id: "consultation", title: "Plan nutricional",
  assigned_at: "2026-09-09", review_date: null, plan_type: null, category: null, target_calories: 2000,
  energy_calculation: null, macro_distribution: null, exchange_prescription: null, meal_distribution: null, diet_menu: null, status: "draft",
  created_at: "2026-09-09T12:00:00Z", updated_at: "2026-09-09T12:00:00Z",
};
const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };

describe("DietEquivalentsStep", () => {
  it("explores A-B-A without saving, applies, and restores manual portions", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={{ ...plan, id: "history-plan" }} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={vi.fn()} />);
    fireEvent.click(screen.getByText("Agregar grupo"));
    fireEvent.click(screen.getByRole("button", { name: /Verduras.*Agregar/ }));
    fireEvent.change(screen.getByLabelText("Porciones de Verduras"), { target: { value: "1.33" } });
    const manual = onDraftChange.mock.calls.at(-1)![0];
    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1200 });
    onSave.mockClear(); onDraftChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    const first = screen.getByLabelText("Porciones de Verduras").getAttribute("value");
    fireEvent.click(screen.getByRole("button", { name: "Volver a proponer porciones" }));
    expect(screen.getByText("Propuesta 2 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Propuesta anterior" }));
    expect(screen.getByLabelText("Porciones de Verduras")).toHaveAttribute("value", first);
    expect(onSave).not.toHaveBeenCalled(); expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Deshacer aplicación" }));
    expect(onDraftChange.mock.calls.at(-1)![0].groups).toEqual(manual.groups);
  });
  it("edits decimal portions, keeps the contribution secondary, and confirms without requiring an exact match", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={() => undefined} />);

    expect(screen.queryByText("Ver aporte")).not.toBeInTheDocument();
    expect(screen.getByText("Aún no has definido equivalentes.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Agregar grupo"));
    fireEvent.click(screen.getByRole("button", { name: /Verduras.*Agregar/ }));
    expect(screen.getAllByText("1 equivalente:", { selector: "span" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Porciones de Verduras"), { target: { value: "0.5" } });
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      derived_totals: expect.objectContaining({ energy_kcal: 12.5, carbohydrate_g: 2, protein_g: 1 }),
      status: "editing",
    }));
    expect(screen.getByText(/supera ±100 kcal/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar equivalentes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", confirmed_at: expect.any(String) }), true));
  });

  it("recognizes the 35 kcal difference as within margin and lets a confirmed plan continue", async () => {
    const patientTargets = { energy_kcal: 1600, carbohydrate_g: 200, protein_g: 140, fat_g: 26.7 };
    const portions = [
      ["VEGETABLES", 1], ["FRUITS", 2], ["CEREALS_NO_FAT", 4],
      ["LEGUMES", 4], ["AOA_VERY_LOW_FAT", 10], ["MILK_SEMI_SKIM", 3],
    ] as const;
    const prescription = portions.reduce(
      (current, [code, amount]) => setExchangePortions(current, patientTargets, code, amount),
      createExchangePrescription(patientTargets),
    );
    expect(prescription.derived_totals.energy_kcal).toBe(1635);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onContinue = vi.fn();
    render(<DietEquivalentsStep plan={{ ...plan, exchange_prescription: prescription }} targets={patientTargets} onSave={onSave} onDraftChange={vi.fn()} onGoToMacros={vi.fn()} onContinue={onContinue} />);

    expect(screen.getByText(/dentro de ±100 kcal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar equivalentes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "ready", confirmed_at: expect.any(String) }), true));
    expect(await screen.findByText("Cuadro confirmado")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar a Tiempos" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows a save failure next to confirmation and permits retry", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(undefined);
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={onSave} onDraftChange={vi.fn()} onGoToMacros={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar equivalentes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el cuadro");
    expect(screen.getByText("No guardado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar equivalentes" }));
    expect(await screen.findByRole("button", { name: "Continuar a Tiempos" })).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("previews a mathematical proposal without applying or confirming it", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDraftChange = vi.fn();
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    expect(screen.getByText(/Propuesta lista/)).toBeInTheDocument();
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
      suggestion_algorithm: "EXCHANGE_SUGGESTION_V3",
    }));
    expect(screen.getAllByLabelText(/^Porciones de /).length).toBeLessThan(17);
    expect(screen.queryByLabelText("Porciones de Azúcares sin grasa")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Porciones de Azúcares con grasa")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar equivalentes" })).toBeInTheDocument();
  });

  it("keeps preferences secondary and sends an explicit INCLUDE preference to the proposal", () => {
    render(<DietEquivalentsStep plan={plan} targets={targets} onSave={vi.fn().mockResolvedValue(undefined)} onDraftChange={() => undefined} onGoToMacros={() => undefined} />);

    fireEvent.click(screen.getByText("Preferencias"));
    fireEvent.change(screen.getByLabelText("Preferencia de Azúcares sin grasa"), { target: { value: "include" } });
    fireEvent.click(screen.getByRole("button", { name: "Proponer porciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar propuesta" }));

    expect(screen.getByLabelText("Porciones de Azúcares sin grasa")).toBeInTheDocument();
  });

  it("asks for macronutrients when the inherited targets are unavailable", () => {
    render(<DietEquivalentsStep plan={plan} targets={null} onSave={async () => undefined} onDraftChange={() => undefined} onGoToMacros={() => undefined} />);
    expect(screen.getByRole("button", { name: "Ir a macronutrientes" })).toBeInTheDocument();
  });
});
