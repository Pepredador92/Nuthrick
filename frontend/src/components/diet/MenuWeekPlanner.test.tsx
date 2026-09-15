import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MenuWeekPlanner } from "./MenuWeekPlanner";
import { DietMenuStep } from "./DietMenuStep";
import { clearProposalSession } from "./useProposalExplorer";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { organizeWeek, WEEK_DAYS } from "@/src/features/menu/week";
import type { DietMenu, NutritionPlan } from "@/src/types/domain";

const fixturePlan = (menu: DietMenu, distribution: NutritionPlan["meal_distribution"]): NutritionPlan => ({
  id: "weekly-plan", professional_id: "fixture", patient_id: null, consultation_id: null, title: "Prueba", assigned_at: "2026-09-15", review_date: null, plan_type: null, category: null, target_calories: null, energy_calculation: null, macro_distribution: null, exchange_prescription: null, meal_distribution: distribution, diet_menu: menu, status: "draft", created_at: "", updated_at: "",
});
beforeEach(clearProposalSession);
describe("weekly preview and option editing", () => {
  it("explores, edits, locks, recovers, discards, applies and undoes without premature writes", () => {
    const f = weeklyFixture(); const onChange = vi.fn();
    function Harness() { const [menu, setMenu] = useState(f.menu); return <MenuWeekPlanner planId="test" menu={menu} distribution={f.distribution} onChange={next => { onChange(next); setMenu(next); }} onEditMeal={vi.fn()} onVariant={vi.fn()}/>; }
    render(<Harness/>);
    fireEvent.click(screen.getByRole("button", { name: "Organizar días" }));
    const first = within(screen.getByRole("table")).getByRole("combobox", { name: "Opción de Desayuno para Lunes" });
    fireEvent.change(first, { target: { value: "breakfast-1" } });
    fireEvent.click(within(screen.getByRole("table")).getByRole("checkbox", { name: "Fijar Lunes Desayuno" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver a organizar" }));
    expect(within(screen.getByRole("table")).getByRole("combobox", { name: "Opción de Desayuno para Lunes" })).toHaveValue("breakfast-1");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar calendario" }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar organización" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar calendario" }));
    expect(onChange).toHaveBeenCalledTimes(1); expect(onChange.mock.calls[0][0].week_plan.days).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer calendario" }));
    expect(onChange.mock.calls[1][0].week_plan).toBeNull();
  });
  it("requires an explicit subset when fewer days are chosen", () => {
    const f = weeklyFixture(); const onChange = vi.fn();
    render(<MenuWeekPlanner planId="subset" {...f} onChange={onChange} onEditMeal={vi.fn()} onVariant={vi.fn()}/>);
    fireEvent.click(screen.getByLabelText("Elegir días"));
    fireEvent.change(screen.getByRole("combobox", { name: "Duración del plan" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Organizar días" }));
    expect(screen.getByText(/Comida: 5 opciones no caben/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar calendario" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Elegir opciones participantes"));
    fireEvent.click(screen.getByLabelText(/Comida 4 ·/)); fireEvent.click(screen.getByLabelText(/Comida 5 ·/));
    fireEvent.click(screen.getByRole("button", { name: "Organizar días" }));
    expect(screen.getByRole("button", { name: "Aplicar calendario" })).toBeEnabled(); expect(onChange).not.toHaveBeenCalled();
  });
  it("keeps applied snapshots and previews an explicit all-appearances update", () => {
    const f = weeklyFixture([1, 1, 1]); f.menu.week_plan = organizeWeek({ ...f, days: WEEK_DAYS.slice(0, 3).map(d => d.id) });
    f.menu.meal_options![0].name = "Desayuno actualizado"; f.menu.meal_options![0].revision++;
    const onChange = vi.fn();
    render(<MenuWeekPlanner planId="updates" {...f} onChange={onChange} onEditMeal={vi.fn()} onVariant={vi.fn()}/>);
    fireEvent.click(screen.getByText("Opciones con una versión nueva en el banco"));
    fireEvent.click(screen.getByRole("button", { name: /Actualizar apariciones de Desayuno actualizado/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar calendario" }));
    const week = onChange.mock.calls[0][0].week_plan;
    expect(week.days.every((d: { assignments: { option_snapshot: { name: string } }[] }) => d.assignments[0].option_snapshot.name === "Desayuno actualizado")).toBe(true);
    expect(f.menu.week_plan.days[0].assignments[0].option_snapshot.name).not.toBe("Desayuno actualizado");
  });
  it("creates independent options, preserves confirmations, and supports deleting the last option and undo", () => {
    const f = weeklyFixture([1, 1, 1]); const onDraftChange = vi.fn();
    render(<DietMenuStep plan={fixturePlan(f.menu, f.distribution)} catalog={{ foods: f.foods, recipes: [] }} onDraftChange={onDraftChange} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()}/>);
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar otra opción de desayuno" }));
    expect(screen.queryByRole("spinbutton", { name: "Cantidad de Papaya fresca" })).not.toBeInTheDocument();
    const bank = onDraftChange.mock.calls.at(-1)![0].meal_options;
    expect(bank.filter((o: { meal_time_id: string }) => o.meal_time_id === "breakfast")).toHaveLength(2);
    expect(bank[0]).toEqual(f.menu.meal_options![0]); expect(bank.at(-1).entries).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar opción" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar opción" }));
    expect(screen.queryByRole("button", { name: "Proponer opción" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer eliminación de opción" }));
    expect(screen.getByRole("spinbutton", { name: "Cantidad de Papaya fresca" })).toHaveValue(1);
  });
  it("creates and confirms a separate variant that updates only its target day", () => {
    const f = weeklyFixture([1, 1, 1]); f.menu.week_plan = organizeWeek({ ...f, days: WEEK_DAYS.slice(0, 3).map(d => d.id) });
    const before = structuredClone(f.menu.week_plan); const onDraftChange = vi.fn();
    render(<DietMenuStep plan={fixturePlan(f.menu, f.distribution)} catalog={{ foods: f.foods, recipes: [] }} onDraftChange={onDraftChange} onSave={vi.fn().mockResolvedValue(undefined)} onGoToMeals={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Plan por días" }));
    fireEvent.click(within(screen.getByRole("table")).getAllByRole("button", { name: "Variante para este día" })[0]);
    expect((screen.getByRole("textbox", { name: "Nombre de la opción" }) as HTMLInputElement).value).toContain("Lunes");
    expect(onDraftChange.mock.calls.at(-1)![0].week_plan).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar opción" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar variante en Lunes" }));
    const after = onDraftChange.mock.calls.at(-1)![0].week_plan;
    expect(after.days[0].assignments[0].option_id).not.toBe(before.days[0].assignments[0].option_id);
    expect(after.days.slice(1)).toEqual(before.days.slice(1)); expect(after.days[0].assignments.slice(1)).toEqual(before.days[0].assignments.slice(1));
  });
});
