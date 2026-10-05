import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanOrganization, canDeleteDraft } from "./PlanOrganization";
import type { NutritionPlan } from "@/src/types/domain";
const api = vi.hoisted(() => ({ remove: vi.fn(), removePublished: vi.fn(), update: vi.fn() }));
vi.mock("@/src/services/dietPlans", () => ({
  deleteDietDraft: api.remove,
  removePublishedDietPlan: api.removePublished,
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
  api.removePublished.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
describe("plan organization", () => {
  it("shows plans as a list with the last saved step and a resume action", () => {
    mount([plan("Dieta de seguimiento", { last_workshop_step: "menu" })]);
    expect(screen.getByRole("list", { name: "Planes del Taller" })).toBeInTheDocument();
    expect(screen.getByText("Paso 5 de 6 · Menú")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reanudar" })).toHaveAttribute(
      "href", "/app/diet-workshop/Dieta de seguimiento",
    );
  });
  it("keeps an active plan without a published version in the draft list", () => {
    mount([plan("En preparación", { status: "active", current_version_id: null })]);
    expect(screen.getByRole("button", { name: "Borradores 1" })).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });
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
  it("offers sharing and removes a published plan only after confirmation", async () => {
    mount([plan("Publicado", {
      patient_id: "patient",
      current_version_id: "version",
      published_version_number: 3,
      status: "active",
    })]);
    fireEvent.click(screen.getByRole("button", { name: "Publicados 1" }));
    expect(screen.getByRole("link", { name: "Compartir con paciente" })).toHaveAttribute(
      "href", "/app/patients/patient/portal?tab=share&planId=Publicado#portal-plan-sharing",
    );
    fireEvent.click(screen.getByLabelText("Acciones de Publicado"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar plan publicado" }));
    expect(api.removePublished).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Se retirará de inmediato si estaba compartido");
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(api.removePublished).toHaveBeenCalledWith("Publicado", 3));
    expect(screen.queryByRole("link", { name: "Publicado" })).not.toBeInTheDocument();
  });
  it("can remove a plan whose latest publication was retired without offering it to share", async () => {
    mount([plan("Retirado", { patient_id: "patient", has_published_versions: true, published_version_number: 2 })]);
    fireEvent.click(screen.getByRole("button", { name: "Publicados 1" }));
    expect(screen.queryByRole("link", { name: "Compartir con paciente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Acciones de Retirado"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar plan publicado" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(api.removePublished).toHaveBeenCalledWith("Retirado", 3));
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
