import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationPage } from "./ConsultationPage";
import { withWorkflowSections } from '@/src/features/consultations/consultationWorkflow';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  finish: vi.fn(),
  adopt: vi.fn(),
  begin: vi.fn(),
  listConsultations: vi.fn(),
  getSnapshot: vi.fn(),
  reopen: vi.fn(),
  updateDate: vi.fn(),
  ensure: vi.fn(),
  objective: vi.fn(),
  clinical: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/src/services/clinicalCopilot", async (original) => ({
  ...(await original<object>()),
  clinicalObjective: mocks.objective,
  clinicalWorkspace: mocks.clinical,
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
  listConsultations: mocks.listConsultations,
}));
vi.mock("@/src/services/consultations", () => ({
  loadActiveTemplate: async () => fixtures.template,
  loadSystemTemplate: async () => fixtures.template,
  ensureSnapshot: mocks.ensure,
  prepareConsultationWorkflow: async (snapshot: typeof fixtures.snapshot) => ({ ...snapshot, structure: withWorkflowSections(snapshot.structure as never) }),
  getSnapshot: mocks.getSnapshot,
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
  reopenConsultationForEdit: mocks.reopen,
  beginConsultation: mocks.begin,
  updateConsultationDate: mocks.updateDate,
  listAnswers: async () => [],
  saveAnswers: mocks.save,
  finishConsultation: mocks.finish,
  adoptTemplate: mocks.adopt,
}));
vi.mock("@/src/components/consultations/SnapshotHistory", () => ({
  SnapshotHistory: () => null,
}));
vi.mock('@/src/services/foodCatalog', () => ({ listFoodItems: async () => [], createCustomFood: vi.fn() }));

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
async function openModule(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  await waitFor(() => expect(screen.getByRole('button', { name })).toHaveAttribute('aria-current', 'page'));
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.save.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(fixtures.c);
  fixtures.c.status = "draft";
  mocks.listConsultations.mockResolvedValue([fixtures.c]);
  mocks.begin.mockResolvedValue(fixtures.c);
  mocks.getSnapshot.mockResolvedValue(fixtures.snapshot);
  mocks.reopen.mockResolvedValue({ ...fixtures.c, status: "draft" });
  mocks.updateDate.mockImplementation(async (_id: string, date: string) => ({
    ...fixtures.c,
    id: _id,
    consultation_type: _id === "follow-up-draft" ? "follow_up" : fixtures.c.consultation_type,
    consultation_date: `${date}T12:00:00.000Z`,
  }));
  mocks.ensure.mockResolvedValue(fixtures.snapshot);
  mocks.objective.mockResolvedValue({ stamp: 's', facts: [], pes: null, objective: null, target: null });
  mocks.clinical.mockResolvedValue({ stamp: 's', readiness: { interview: false, objective: false, anthropometry: false, laboratories: false }, records: {} });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("consultation save and review workflow", () => {
  it('offers independent recall and clinical decisions in a follow-up while keeping them out of the interview', async () => {
    mocks.getSnapshot.mockResolvedValue({ ...fixtures.snapshot, structure: { ...fixtures.snapshot.structure, consultation_type: 'follow_up' } });
    mocks.listConsultations.mockResolvedValue([{ ...fixtures.c, consultation_type: 'follow_up' }]);
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    expect(within(screen.getByRole('navigation', { name: 'Secciones de la entrevista' })).queryByText(/Recordatorio|PES|Objetivos/)).not.toBeInTheDocument();
    await openModule('Recordatorio de 24 horas');
    expect(screen.getByRole('button', { name: 'Capturar recordatorio' })).toBeVisible();
    fireEvent.click(screen.getByText('Registro detallado del día y preguntas de apoyo'));
    expect(screen.getByRole('button', { name: 'Agregar alimento o bebida' })).toBeVisible();
    expect(screen.getByText('Sigue: Mediciones')).toBeVisible();
    await openModule('Revisión clínica, PES y objetivos');
    expect(screen.getByRole('heading', { name: 'Revisión clínica' })).toBeVisible();
    expect(screen.getByLabelText('Redacción PES')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByLabelText('Redacción PES')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByLabelText('Objetivo acordado con el paciente')).toBeVisible());
    expect(screen.getByLabelText('Redacción PES')).not.toBeVisible();
  });

  it('requires saving measurement edits before entering the clinical proposal step', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Mediciones');
    fireEvent.change(screen.getByLabelText('Peso de prueba'), { target: { value: '87.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisión clínica, PES y objetivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Guarda las mediciones');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mediciones' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medición de prueba' }));
    await openModule('Revisión clínica, PES y objetivos');
    expect(screen.getByRole('heading', { name: 'Revisión clínica' })).toBeVisible();
  });

  it('keeps an unconfirmed recall on screen and blocks closing until its changes are confirmed', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Recordatorio de 24 horas');
    fireEvent.click(screen.getByRole('button', { name: 'Capturar recordatorio' }));
    fireEvent.change(screen.getByLabelText('Texto capturado'), { target: { value: 'Dos huevos y tres tortillas.' } });
    await openModule('Entrevista');
    await openModule('Recordatorio de 24 horas');
    expect(screen.getByLabelText('Texto capturado')).toHaveValue('Dos huevos y tres tortillas.');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Recordatorio de 24 horas');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
  });

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
      await openModule("Revisión clínica, PES y objetivos");
      fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
      const field = await screen.findByLabelText(question.label);
      fireEvent.click(screen.getByRole("button", { name: "Actualizar contexto" }));
      await waitFor(() => expect(mocks.objective.mock.calls.length).toBeGreaterThanOrEqual(2));
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
  it("reopens a cancelled consultation before loading it for editing", async () => {
    fixtures.c.status = "cancelled";
    mocks.reopen.mockResolvedValue({ ...fixtures.c, status: "draft" });
    mount();
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.reopen).toHaveBeenCalledWith("draft");
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
  it("lets the professional start another type without cancelling an open draft", async () => {
    mocks.begin.mockResolvedValue({
      ...fixtures.c,
      id: "follow-up-draft",
      consultation_type: "follow_up",
    });
    mocks.getSnapshot.mockResolvedValue(null);
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    expect(screen.getByText("Tienes un borrador abierto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Consulta inicial/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Consulta de seguimiento/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Cancelar borrador" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Consulta de seguimiento/ }));
    expect(await screen.findByRole("dialog", { name: "Elige un diseño de seguimiento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Seguimiento.*Duración aproximada/ }));
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledWith("patient", "follow_up");
  });

  it("resumes an existing draft without changing its consultation date", async () => {
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    fireEvent.click(screen.getByText("Tienes un borrador abierto"));
    expect(screen.getByRole("button", { name: "Reanudar borrador" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reanudar borrador" }));
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.updateDate).not.toHaveBeenCalled();
  });
  it("starts a consultation from a professional template id and renders its snapshot", async () => {
    mocks.listConsultations.mockResolvedValueOnce([]);
    mocks.getSnapshot.mockResolvedValue(null);
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
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    fireEvent.click(screen.getByRole("button", { name: /Consulta inicial/ }));
    expect(await screen.findByRole("dialog", { name: "Elige un diseño de consulta inicial" })).toBeInTheDocument();
    const systemOption = screen.getByRole("button", { name: /Entrevista.*45 min/ });
    expect(systemOption).toHaveClass("consultation-template-choice-system");
    expect(systemOption).toHaveTextContent("NOM-004-SSA3-2012");
    expect(systemOption).toHaveTextContent("NOM-043-SSA2-2012");
    expect(systemOption).toHaveTextContent("NOM-008-SSA3-2017");
    expect(screen.getByRole("button", { name: /Consulta inicial deportiva.*60 min/ })).toHaveClass("consultation-template-choice-personal");
    expect(screen.getByText("60 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Consulta inicial deportiva.*60 min/ }));
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
    await openModule("Mediciones");
    fireEvent.change(screen.getByLabelText("Peso de prueba"), { target: { value: "87.6" } });
    await openModule("Entrevista");
    await openModule("Mediciones");
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
      await openModule("Mediciones");
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
    await openModule("Mediciones");
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
    await openModule("Laboratorios");
    fireEvent.click(screen.getByRole("button", { name: "Editar laboratorio de prueba" }));
    await openModule("Entrevista");
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
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
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
      await openModule("Revisión clínica, PES y objetivos");
      fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
      await screen.findByRole("heading", { name: section.title });
      expect(screen.getByText(section.questions[0].help_text)).toBeInTheDocument();
      if (objective) fireEvent.change(screen.getByLabelText(section.questions[0].label), { target: { value: objective } });
      fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('checkbox'));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Ficha guardada" }),
    ).toBeInTheDocument();
  });
});
