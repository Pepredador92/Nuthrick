import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanOrganization, canDeleteDraft } from "./PlanOrganization";
import type { NutritionPlan } from "@/src/types/domain";
const api = vi.hoisted(() => ({ remove: vi.fn(), update: vi.fn() }));
vi.mock("@/src/services/dietPlans", () => ({
  deleteDietDraft: api.remove,
  updateDietPlan: api.update,
}));
const plan = (id: string, props: Partial<NutritionPlan> = {}) =>
  ({
    id,
    title: id,
    status: "draft",
    updated_at: "2026-09-21",
    draft_revision: 3,
    ...props,
  }) as NutritionPlan;
function mount(initial: NutritionPlan[]) {
  function Harness() {
    const [plans, setPlans] = useState(initial);
    return (
      <PlanOrganization plans={plans} onChange={setPlans} onCreate={() => {}} />
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.remove.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
describe("plan organization", () => {
  it.each([false, true])(
    "deletes only after confirmation, assigned=%s",
    async (assigned) => {
      mount([
        plan(
          "Prueba",
          assigned ? { patient_id: "p", patient_name: "María López" } : {},
        ),
      ]);
      fireEvent.click(screen.getByLabelText("Acciones de Prueba"));
      fireEvent.click(
        screen.getByRole("button", { name: "Eliminar borrador" }),
      );
      expect(api.remove).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toHaveTextContent(
        assigned ? "María López" : "todavía no ha sido publicado",
      );
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("link", { name: "Prueba" }),
        ).not.toBeInTheDocument(),
      );
      expect(api.remove).toHaveBeenCalledWith("Prueba", 3);
      expect(
        screen.getByText("No tienes borradores pendientes."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Borradores 0" }),
      ).toBeInTheDocument();
    },
  );
  it("cancels without deleting", () => {
    mount([plan("Prueba")]);
    fireEvent.click(screen.getByLabelText("Acciones de Prueba"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Prueba" })).toBeInTheDocument();
  });
  it("keeps card when server rejects a newly published draft", async () => {
    api.remove.mockRejectedValue(new Error("Historial protegido"));
    mount([plan("Prueba")]);
    fireEvent.click(screen.getByLabelText("Acciones de Prueba"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Historial protegido",
    );
    expect(screen.getByRole("link", { name: "Prueba" })).toBeInTheDocument();
  });
  it("separates relation, publication, archive and filters", () => {
    mount([
      plan("Libre"),
      plan("Asignado", { patient_id: "p", patient_name: "María López" }),
      plan("Publicado", {
        has_published_versions: true,
        published_version_number: 2,
      }),
      plan("Archivo", { status: "archived" }),
    ]);
    expect(
      screen.getByText("Paciente asignado · María López"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Libres" }));
    expect(
      screen.queryByRole("link", { name: "Asignado" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todos los destinos" }));
    fireEvent.click(screen.getByRole("button", { name: "Publicados 1" }));
    expect(screen.getByText("Publicado · v2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Acciones de Publicado"));
    expect(
      screen.queryByRole("button", { name: "Eliminar borrador" }),
    ).not.toBeInTheDocument();
  });
  it.each([
    { current_version_id: "v" },
    { has_published_versions: true },
    { published_version_number: 1 },
    { status: "active" },
    { status: "archived" },
  ])("protects historical plans %o", (props) =>
    expect(canDeleteDraft(plan("p", props as Partial<NutritionPlan>))).toBe(
      false,
    ),
  );
});
