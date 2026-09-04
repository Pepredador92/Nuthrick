import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationTemplateEditorPage } from "./ConsultationTemplateEditorPage";
import type { LoadedTemplate } from "@/src/services/consultations";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  system: vi.fn(),
  copy: vi.fn(),
  save: vi.fn(),
  makeDefault: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  restoreSystem: vi.fn(),
}));

const fixtures = vi.hoisted(() => {
  const now = "2026-09-04T04:00:00Z";
  const make = (personal: boolean): LoadedTemplate => {
    const id = personal ? "personal-sports" : "system-initial";
    return {
      template: {
        id,
        professional_id: personal ? "owner" : null,
        template_key: id,
        name: personal ? "Consulta inicial deportiva" : "Entrevista inicial Nuthrick",
        description: personal
          ? "Evaluación de actividad y rendimiento."
          : "Entrevista clínico-nutricional base.",
        estimated_duration_minutes: personal ? 60 : 45,
        display_order: personal ? 1 : 0,
        consultation_type: "initial",
        version: personal ? 1 : 3,
        source_template_id: personal ? "system-initial" : null,
        is_system: !personal,
        is_default: false,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      sections: [
        {
          id: `${id}-training`,
          template_id: id,
          section_key: "training",
          title: "Entrenamiento",
          description: "Conoce la rutina habitual.",
          display_order: 0,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: `${id}-closure`,
          template_id: id,
          section_key: "closure",
          title: "Cierre",
          description: "Acuerdos.",
          display_order: 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
      questions: [
        {
          id: `${id}-days`,
          section_id: `${id}-training`,
          question_key: "training_days",
          label: "¿Cuántos días entrenas por semana?",
          help_text: null,
          question_type: "number",
          response_area: "patient_reported",
          is_required: false,
          display_order: 0,
          is_active: true,
          configuration: {},
          visibility_condition: null,
          created_at: now,
          updated_at: now,
        },
      ],
    };
  };
  return { personal: make(true), system: make(false) };
});

vi.mock("@/src/services/consultations", () => ({
  listAvailableTemplates: api.list,
  loadSystemTemplate: api.system,
  createPersonalTemplateCopy: api.copy,
  saveTemplate: api.save,
  setDefaultTemplate: api.makeDefault,
  archiveTemplate: api.archive,
  restoreTemplate: api.restore,
  deleteTemplate: api.remove,
  restoreSystemTemplate: api.restoreSystem,
}));

function mount() {
  return render(
    <MemoryRouter initialEntries={["/app/consultation-templates/initial"]}>
      <Routes>
        <Route
          path="/app/consultation-templates/:consultationType"
          element={<ConsultationTemplateEditorPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.personal.template.is_default = false;
  fixtures.personal.template.is_active = true;
  api.list.mockResolvedValue([
    structuredClone(fixtures.personal),
    structuredClone(fixtures.system),
  ]);
  api.system.mockResolvedValue(structuredClone(fixtures.system));
  api.copy.mockResolvedValue(structuredClone(fixtures.personal));
  api.save.mockImplementation(async (loaded: LoadedTemplate) => ({
    ...structuredClone(loaded),
    template: {
      ...structuredClone(loaded.template),
      version: loaded.template.version + 1,
      updated_at: "2026-09-04T05:00:00Z",
    },
  }));
  api.makeDefault.mockResolvedValue(undefined);
  api.archive.mockResolvedValue(undefined);
  api.restore.mockResolvedValue(undefined);
  api.remove.mockResolvedValue(undefined);
  api.restoreSystem.mockResolvedValue(undefined);
});

describe("catálogo profesional de plantillas", () => {
  it("edits metadata and ordered content, then saves the personal template", async () => {
    mount();
    await screen.findByRole("heading", { name: "Plantillas disponibles" });
    expect(screen.getAllByText("Consulta inicial deportiva")).toHaveLength(2);
    expect(screen.getByText("Entrevista inicial Nuthrick")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Consulta deportiva personalizada" },
    });
    fireEvent.change(
      screen.getByLabelText("Duración aproximada en minutos · opcional"),
      { target: { value: "75" } },
    );
    fireEvent.change(screen.getByLabelText(/^Descripción · opcional/), {
      target: { value: "Rendimiento, entrenamiento y recuperación." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bajar sección" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    const saved = api.save.mock.calls[0][0] as LoadedTemplate;
    expect(saved.template).toMatchObject({
      id: "personal-sports",
      name: "Consulta deportiva personalizada",
      description: "Rendimiento, entrenamiento y recuperación.",
      estimated_duration_minutes: 75,
    });
    expect(saved.sections.map((section) => section.title)).toEqual([
      "Cierre",
      "Entrenamiento",
    ]);
  });

  it("supports default, duplicate, archive and permanent delete actions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    await screen.findByRole("button", { name: "Hacer predeterminada" });

    fireEvent.click(screen.getByRole("button", { name: "Hacer predeterminada" }));
    await waitFor(() =>
      expect(api.makeDefault).toHaveBeenCalledWith("personal-sports"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
    await waitFor(() => expect(api.copy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    await waitFor(() =>
      expect(api.archive).toHaveBeenCalledWith("personal-sports"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith("personal-sports"),
    );
  });

  it("removes a question from a personal template before saving", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    await screen.findByRole("button", { name: "Quitar pregunta 1" });

    fireEvent.click(screen.getByRole("button", { name: "Quitar pregunta 1" }));
    expect(
      screen.queryByLabelText("¿Cuántos días entrenas por semana?"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    const saved = api.save.mock.calls[0][0] as LoadedTemplate;
    expect(saved.questions).toHaveLength(0);
  });
});
