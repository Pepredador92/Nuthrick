import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DietLibrary } from "./DietLibrary";
import {
  makeLibraryContent,
  type DietLibraryItem,
} from "@/src/features/diet-library/model";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import {
  createMacroDistribution,
  patchMacroInput,
} from "@/src/features/macros/model";
import type { NutritionPlan } from "@/src/types/domain";
import {
  listDietLibrary,
  saveDietLibrary,
  dietLibraryRecovery,
} from "@/src/services/dietLibrary";
vi.mock("@/src/services/dietLibrary", () => ({
  listDietLibrary: vi.fn(),
  saveDietLibrary: vi.fn(),
  dietLibraryRecovery: vi.fn(),
  archiveDietLibrary: vi.fn(),
}));
function example(owner: string | null = "owner") {
  const { menu, distribution } = weeklyFixture([1, 1, 1]);
  menu.week_plan = {
    schema_version: 1,
    days: [
      {
        day: "mon",
        assignments: menu.meal_options!.map((o) => ({
          meal_time_id: o.meal_time_id,
          option_id: o.id,
          option_snapshot: o,
          fixed: false,
        })),
      },
    ],
  };
  let macro = createMacroDistribution(2000, null);
  macro = patchMacroInput(macro, "PROTEIN", "percentage", 20);
  macro = patchMacroInput(macro, "CARBOHYDRATE", "percentage", 50);
  macro = patchMacroInput(macro, "FAT", "percentage", 30);
  const plan = {
    id: "plan",
    draft_revision: 1,
    title: "Private patient name",
    patient_id: null,
    target_calories: 2000,
    macro_distribution: macro,
    meal_distribution: distribution,
    diet_menu: menu,
  } as NutritionPlan;
  const item = {
    id: "base",
    name: "Base de prueba",
    owner_id: owner,
    content: makeLibraryContent(plan),
    revision: 1,
    archived: false,
    created_at: "",
    updated_at: "",
  } as DietLibraryItem;
  return { plan, item };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listDietLibrary).mockResolvedValue([]);
  vi.mocked(dietLibraryRecovery).mockResolvedValue(null);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
});
describe("diet library controls", () => {
  it("saves without a patient only after explicit privacy review and a neutral name", async () => {
    const { plan } = example();
    const capture = vi.fn().mockResolvedValue(plan);
    render(<DietLibrary plan={plan} capture={capture} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar en biblioteca" }),
    );
    const save = await screen.findByRole("button", {
      name: "Guardar copia privada",
    });
    expect(save).toBeDisabled();
    expect(saveDietLibrary).not.toHaveBeenCalled();
    expect(
      screen.queryByDisplayValue("Private patient name"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Revisé nombre/ }));
    fireEvent.click(save);
    await waitFor(() => expect(saveDietLibrary).toHaveBeenCalledOnce());
    expect(vi.mocked(saveDietLibrary).mock.calls[0][1]).toBe(
      "Dieta reutilizable",
    );
    expect(
      JSON.stringify(vi.mocked(saveDietLibrary).mock.calls[0][2]),
    ).not.toContain("patient_id");
  });
  it("requires a second explicit step to replace current work and shows daily differences", async () => {
    const { plan, item } = example();
    const apply = vi.fn().mockResolvedValue(undefined);
    vi.mocked(listDietLibrary).mockResolvedValue([item]);
    render(<DietLibrary plan={plan} onApply={apply} />);
    fireEvent.click(screen.getByRole("button", { name: "Mi biblioteca" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver dieta" }));
    expect(screen.getByRole("table")).toHaveTextContent("Lunes");
    expect(screen.getByRole("table")).toHaveTextContent("Objetivo 2,000");
    fireEvent.click(screen.getByRole("button", { name: "Usar como base" }));
    expect(apply).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Mantendrá paciente, consulta, energía y macros/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar respaldo y usar base" }),
    );
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
  });
  it("keeps system originals read-only and permits independent copies", async () => {
    const { item } = example(null);
    vi.mocked(listDietLibrary).mockResolvedValue([item]);
    render(<DietLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Mi biblioteca" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Biblioteca de Nuthrick" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Ver dieta" }));
    expect(screen.getByRole("button", { name: "Crear copia" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Editar textos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archivar" }),
    ).not.toBeInTheDocument();
  });
  it("reports connection errors and offers retry instead of replacing the workshop", async () => {
    vi.mocked(listDietLibrary).mockRejectedValue(new Error("Sin conexión"));
    render(<DietLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Mi biblioteca" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(
      screen.getByRole("button", { name: "Actualizar biblioteca" }),
    ).toBeEnabled();
  });
});
