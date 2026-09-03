import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationPage } from "./ConsultationPage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  finish: vi.fn(),
  adopt: vi.fn(),
  cancel: vi.fn(),
}));
const fixtures = vi.hoisted(() => {
  const c = {
    id: "draft",
    patient_id: "patient",
    consultation_type: "initial",
    sequence_number: 0,
    status: "draft",
    consultation_date: "2026-09-02T12:00:00Z",
  };
  const snapshot = {
    id: "snapshot",
    template_id: "template",
    template_name: "Entrevista",
    template_version: 2,
    revision: 1,
    structure: {
      consultation_type: "initial",
      sections: [
        {
          section_key: "opening",
          title: "Apertura de prueba",
          questions: [
            {
              question_key: "note",
              label: "Detalle breve de prueba",
              question_type: "short_text",
              configuration: {},
              is_required: false,
              response_area: "patient_reported",
            },
          ],
        },
        {
          section_key: "closure",
          title: "Cierre de prueba",
          questions: [
            {
              question_key: "review",
              label: "Confirmación de prueba",
              question_type: "select",
              configuration: { options: ["Revisado", "Pendiente"] },
              is_required: true,
              response_area: "professional_assessment",
            },
          ],
        },
      ],
    },
  };
  return {
    c,
    snapshot,
    template: {
      template: {
        id: "template",
        name: "Entrevista",
        version: 2,
        is_system: true,
        template_key: "system_initial_v2",
        consultation_type: "initial",
      },
      sections: [],
      questions: [],
    },
  };
});
vi.mock("@/src/services/patients", () => ({
  getPatient: async () => ({ id: "patient", full_name: "Paciente de prueba" }),
  listConsultations: async () => [fixtures.c],
}));
vi.mock("@/src/services/consultations", () => ({
  loadActiveTemplate: async () => fixtures.template,
  loadSystemTemplate: async () => fixtures.template,
  ensureSnapshot: async () => fixtures.snapshot,
  getSnapshot: async () => fixtures.snapshot,
  listAvailableSystemTemplates: async (type: string) =>
    type === "initial"
      ? [fixtures.template]
      : [
          {
            ...fixtures.template,
            template: {
              ...fixtures.template.template,
              id: "follow-up-template",
              name: "Seguimiento",
              template_key: "system_follow_up_v1",
              consultation_type: "follow_up",
            },
          },
        ],
  loadTemplateById: async () => fixtures.template,
  reopenConsultationForEdit: async () => fixtures.c,
  beginConsultation: async () => fixtures.c,
  listAnswers: async () => [],
  saveAnswers: mocks.save,
  finishConsultation: mocks.finish,
  cancelConsultationDraft: mocks.cancel,
  adoptTemplate: mocks.adopt,
}));
vi.mock("@/src/components/consultations/SnapshotHistory", () => ({
  SnapshotHistory: () => null,
}));

const mount = (entry = "/app/patients/patient/consultations/draft") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/app/patients/:patientId/consultations/new"
          element={<ConsultationPage />}
        />
        <Route
          path="/app/patients/:patientId/consultations/:consultationId"
          element={<ConsultationPage />}
        />
        <Route path="/app/patients/patient" element={<h1>Ficha guardada</h1>} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(fixtures.c);
  mocks.cancel.mockResolvedValue({ ...fixtures.c, status: "cancelled" });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("consultation save and review workflow", () => {
  it("shows every template and lets the professional cancel an open draft before starting another", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "Elige el tipo de entrevista",
    });
    expect(screen.getByText("Tienes un borrador abierto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Entrevista/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Seguimiento/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar borrador" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("draft"));
    expect(confirm).toHaveBeenCalledOnce();
    const initialInterview = screen.getByRole("button", {
      name: /^Entrevista/,
    });
    expect(initialInterview).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Seguimiento/ })).toBeEnabled();
    fireEvent.click(initialInterview);
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
  });
  it("saves the most recent keystroke before changing sections", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta recién escrita" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({ revision: 1 }),
      { note: "Respuesta recién escrita" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(
      await screen.findByLabelText(/detalle breve de prueba/i),
    ).toHaveValue("Respuesta recién escrita");
  });
  it("keeps answers on screen and stops navigation after a failed save", async () => {
    mocks.save.mockRejectedValue(new Error("Sin conexión. Vuelve a intentar."));
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "No perder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(
      screen.getByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue(
      "No perder",
    );
  });
  it("requires review and catches missing required responses before closing", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText("Ir a una sección"), {
      target: { value: "2" },
    });
    await screen.findByRole("heading", { name: "Revisa lo conversado" });
    expect(
      screen.getByRole("button", { name: "Cerrar entrevista" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Revisé la información/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar entrevista" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(screen.getByText("Falta responder.")).toBeInTheDocument();
  });
  it("closes after saving and reviewing, without requiring optional blank notes", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    fireEvent.change(
      screen.getByRole("combobox", { name: /Confirmación de prueba/ }),
      { target: { value: "Revisado" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Revisar resumen" }));
    await screen.findByRole("heading", { name: "Revisa lo conversado" });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Revisé la información/ }),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Cerrar entrevista" }),
      );
    });
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Ficha guardada" }),
    ).toBeInTheDocument();
  });
});
