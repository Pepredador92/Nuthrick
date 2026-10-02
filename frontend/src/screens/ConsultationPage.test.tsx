import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationPage } from "./ConsultationPage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  finish: vi.fn(),
  adopt: vi.fn(),
  cancel: vi.fn(),
  ensure: vi.fn(),
  objective: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/src/services/clinicalCopilot", async (original) => ({
  ...(await original<object>()),
  clinicalObjective: mocks.objective,
}));
vi.mock("@/src/services/ai", async (original) => ({
  ...(await original<object>()),
  runAIRequest: mocks.generate,
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
        description: "Plantilla inicial configurada por el profesional.",
        estimated_duration_minutes: 45,
        display_order: 0,
        version: 2,
        is_system: true,
        template_key: "system_initial_v2",
        consultation_type: "initial",
      },
      sections: [],
      questions: [],
    },
    sportsTemplate: {
      template: {
        id: "sports-template",
        name: "Consulta inicial deportiva",
        description: "Evaluación enfocada en actividad y rendimiento.",
        estimated_duration_minutes: 60,
        display_order: 1,
        version: 1,
        is_system: false,
        is_default: false,
        is_active: true,
        template_key: "personal-sports",
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
  ensureSnapshot: mocks.ensure,
  getSnapshot: async () =>
    mocks.cancel.mock.calls.length ? null : fixtures.snapshot,
  listAvailableSystemTemplates: async (type: string) =>
    type === "initial"
      ? [fixtures.template, fixtures.sportsTemplate]
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
  listAvailableTemplates: async (type: string) =>
    type === "initial"
      ? [fixtures.template, fixtures.sportsTemplate]
      : [
          {
            ...fixtures.template,
            template: {
              ...fixtures.template.template,
              id: "follow-up-template",
              name: "Seguimiento",
              description: "Seguimiento configurado.",
              consultation_type: "follow_up",
            },
          },
        ],
  loadTemplateById: async () => fixtures.template,
  reopenConsultationForEdit: async () => fixtures.c,
  beginConsultation: async () => fixtures.c,
  updateConsultationDate: async (_id: string, date: string) => ({
    ...fixtures.c,
    consultation_date: `${date}T12:00:00.000Z`,
  }),
  listAnswers: async () => [],
  saveAnswers: mocks.save,
  finishConsultation: mocks.finish,
  cancelConsultationDraft: mocks.cancel,
  adoptTemplate: mocks.adopt,
}));
vi.mock("@/src/components/consultations/SnapshotHistory", () => ({
  SnapshotHistory: () => null,
}));

vi.mock("@/src/components/consultations/ConsultationMeasurements", async () => {
  const { useEffect, useState } = await import("react");
  return { ConsultationMeasurements: ({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) => {
    const [value, setValue] = useState("");
    const [pending, setPending] = useState(false);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <section><input aria-label="Peso de prueba" value={value} onChange={(e) => { setValue(e.target.value); setPending(true); }} /><button onClick={() => setPending(false)}>Guardar medición de prueba</button></section>;
  } };
});
vi.mock("@/src/components/consultations/LaboratoryReports", async () => {
  const { useEffect, useState } = await import("react");
  return { LaboratoryReports: ({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) => {
    const [pending, setPending] = useState(false);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <button onClick={() => setPending(true)}>Editar laboratorio de prueba</button>;
  } };
});

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
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.save.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(fixtures.c);
  mocks.cancel.mockResolvedValue({ ...fixtures.c, status: "cancelled" });
  mocks.ensure.mockResolvedValue(fixtures.snapshot);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("consultation save and review workflow", () => {
  it("generates an initial treatment objective on request and saves only the reviewed editable text", async () => {
    const question = fixtures.snapshot.structure.sections[0].questions[0];
    const previous = { ...question };
    Object.assign(question, {
      question_key: "treatment_objective",
      label: "Objetivo acordado con el paciente",
      question_type: "long_text",
    });
    mocks.objective.mockResolvedValue({ stamp: "current", facts: [], pes: null, objective: null, target: null });
    const suggestion = "Organizar las comidas durante la jornada laboral.";
    mocks.generate.mockResolvedValue({ generationId: "g", status: "succeeded", output: {
      objectives: [{ text: suggestion, evidence: [{ source: "Entrevista · expectations", finding: "Organizar comidas" }] }],
    } });
    try {
      mount();
      const field = await screen.findByLabelText(question.label);
      fireEvent.click(screen.getByRole("button", { name: "Actualizar contexto" }));
      await waitFor(() => expect(mocks.objective).toHaveBeenCalledTimes(2));
      expect(mocks.generate).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: "Acuerdo escrito por el profesional." } });
      fireEvent.click(screen.getByRole("button", { name: "Proponer objetivos con IA" }));
      await screen.findByText(suggestion);
      expect(mocks.generate).toHaveBeenCalledOnce();
      expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
        feature: "consultation_support", patientId: "patient", consultationId: "draft", revision: 1,
      }));
      expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
      expect(field).toHaveValue("Acuerdo escrito por el profesional.");
      fireEvent.click(screen.getByRole("button", { name: "Agregar a la entrevista" }));
      expect(field).toHaveValue(`Acuerdo escrito por el profesional.\n\n${suggestion}`);
      expect(screen.getByRole("button", { name: "Aprobar objetivo" })).toBeDisabled();
      expect(mocks.objective.mock.calls.every(args => args.length === 2)).toBe(true);
      fireEvent.change(field, { target: { value: "Objetivo revisado y editado." } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "draft" }),
        expect.objectContaining({ revision: 1 }),
        { treatment_objective: "Objetivo revisado y editado." },
      ));
    } finally { Object.assign(question, previous); }
  });
  it("respects the saved custom label even for a canonical question key", async () => {
    const question=fixtures.snapshot.structure.sections[0].questions[0];
    const previous={...question};
    question.question_key="main_reason";
    question.label="Mi pregunta personalizada de apertura";
    try {
      mount();
      expect(await screen.findByLabelText("Mi pregunta personalizada de apertura")).toBeInTheDocument();
      expect(screen.queryByText("¿Qué te trae a consulta el día de hoy?")).not.toBeInTheDocument();
    } finally { Object.assign(question,previous); }
  });
  it("offers the longitudinal evolution module alongside interview, measurements and laboratories", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    expect(screen.getByRole("button", { name: "Entrevista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mediciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Laboratorios" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evolución" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Taller de dietas" })).toHaveAttribute(
      "href",
      "/app/diet-workshop?patientId=patient&consultationId=draft",
    );
  });

  it("restores the exact section and unsaved answer after a remount", async () => {
    const first = mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta todavía local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    first.unmount();

    mount();
    expect(
      await screen.findByRole("heading", { name: "Cierre de prueba" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByLabelText(/detalle breve de prueba/i)).toHaveValue(
      "Respuesta todavía local",
    );
  });
  it("shows every template and lets the professional cancel an open draft before starting another", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "Elige el diseño para esta consulta",
    });
    expect(screen.getByText("Tienes un borrador abierto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Entrevista/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Seguimiento/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Consulta inicial deportiva/ }),
    ).toBeDisabled();
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
  it("starts a consultation from a professional template id and renders its snapshot", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.ensure.mockImplementation(async (_consultation, loaded) => ({
      ...fixtures.snapshot,
      template_id: loaded.template.id,
      template_name: loaded.template.name,
      template_version: loaded.template.version,
      structure: {
        consultation_type: "initial",
        sections: [
          {
            section_key: "training",
            title: "Entrenamiento",
            questions: [
              {
                question_key: "training_days",
                label: "¿Cuántos días entrenas por semana?",
                question_type: "number",
                configuration: {},
                is_required: false,
                response_area: "patient_reported",
              },
            ],
          },
        ],
      },
    }));
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "Elige el diseño para esta consulta",
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar borrador" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: /Consulta inicial deportiva/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Entrenamiento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("¿Cuántos días entrenas por semana?"),
    ).toBeInTheDocument();
    expect(mocks.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({
        template: expect.objectContaining({ id: "sports-template" }),
      }),
    );
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
  it("uses the section cards to navigate through the existing save flow", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta desde tarjeta" },
    });
    const sections = screen.getByRole("navigation", {
      name: "Secciones de la entrevista",
    });
    fireEvent.click(within(sections).getByRole("button", { name: /Cierre de prueba/ }));
    expect(await screen.findByRole("heading", { name: "Cierre de prueba" })).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({ revision: 1 }),
      { note: "Respuesta desde tarjeta" },
    );
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
  it("closes from measurements after saving, preserving the form when switching tabs", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(await screen.findByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
    fireEvent.click(screen.getByRole("button", { name: "Mediciones" }));
    fireEvent.change(screen.getByLabelText("Peso de prueba"), { target: { value: "87.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrevista" }));
    fireEvent.click(screen.getByRole("button", { name: "Mediciones" }));
    expect(screen.getByLabelText("Peso de prueba")).toHaveValue("87.6");
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("button", { name: "Confirmar cierre" })).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Volver a la consulta" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar medición de prueba" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("heading", { name: "Ficha guardada" })).toBeInTheDocument();
    expect(mocks.finish).toHaveBeenCalledOnce();
  });
  it("can close after adopting an updated interview", async () => {
    const previousVersion = fixtures.template.template.version;
    fixtures.template.template.version = 3;
    mocks.adopt.mockResolvedValue({ ...fixtures.snapshot, template_version: 3, revision: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Usar entrevista actualizada" }));
      await screen.findByText(/Entrevista actualizada\. Las respuestas anteriores/);
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      fireEvent.change(await screen.findByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
      fireEvent.click(screen.getByRole("button", { name: "Mediciones" }));
      fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("checkbox"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
      expect(await screen.findByRole("heading", { name: "Ficha guardada" })).toBeInTheDocument();
      expect(mocks.finish).toHaveBeenCalledOnce();
    } finally {
      fixtures.template.template.version = previousVersion;
      confirm.mockRestore();
    }
  });
  it("returns to the required answer when closing from another tab", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Mediciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("heading", { name: "Cierre de prueba" })).toBeVisible();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("blocks closure with uncommitted laboratory edits even from another tab", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Laboratorios" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar laboratorio de prueba" }));
    fireEvent.click(screen.getByRole("button", { name: "Entrevista" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Laboratorios");
    expect(within(dialog).getByRole("button", { name: "Confirmar cierre" })).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
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
  it.each(["Mejorar adherencia al plan.", ""])("saves the initial treatment objective and closes safely (%s)", async (objective) => {
    const section = {
      section_key: "treatment_objective",
      title: "Objetivo del tratamiento nutricional",
      questions: [{
        question_key: "treatment_objective",
        label: "Objetivo acordado con el paciente",
        help_text: "Define en una frase clara el objetivo acordado con el paciente.",
        question_type: "long_text",
        configuration: { max_length: 2000 },
        is_required: false,
        response_area: "professional_assessment",
      }],
    };
    fixtures.snapshot.structure.sections.push(section);
    try {
      mount();
      await screen.findByRole("heading", { name: "Apertura de prueba" });
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await screen.findByRole("heading", { name: "Cierre de prueba" });
      fireEvent.change(screen.getByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await screen.findByRole("heading", { name: section.title });
      expect(screen.getByText(section.questions[0].help_text)).toBeInTheDocument();
      if (objective) fireEvent.change(screen.getByLabelText(section.questions[0].label), { target: { value: objective } });
      fireEvent.click(screen.getByRole("button", { name: "Revisar resumen" }));
      await screen.findByRole("heading", { name: "Revisa lo conversado" });
      fireEvent.click(screen.getByRole("checkbox", { name: /Revisé la información/ }));
      fireEvent.click(screen.getByRole("button", { name: "Cerrar entrevista" }));
      await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
      if (objective) expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ treatment_objective: objective }));
    } finally {
      fixtures.snapshot.structure.sections.pop();
    }
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
    fireEvent.click(screen.getByRole("button", { name: "Cerrar entrevista" }));
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Ficha guardada" }),
    ).toBeInTheDocument();
  });
});
