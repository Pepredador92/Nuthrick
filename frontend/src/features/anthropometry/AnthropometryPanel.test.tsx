import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropometryPanel, AnthropometryHistory } from "./AnthropometryPanel";
import { newPayload, type AnthroPayload } from "./model";
import { calculate } from "./engine";
import { measurementTypes } from "./catalog";
import { emptyConfiguration } from "./workflowTypes";
import type { Consultation, Patient } from "@/src/types/domain";
const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  preference: vi.fn(),
  savePreference: vi.fn(),
  setup: vi.fn(),
  createDevice: vi.fn(),
  createType: vi.fn(),
}));
vi.mock("@/src/services/anthropometry", () => ({
  loadAnthropometry: api.load,
  saveAnthropometry: api.save,
  loadGuidancePreference: api.preference,
  saveGuidancePreference: api.savePreference,
  loadMeasurementSetup: api.setup,
  createMeasurementDevice: api.createDevice,
  createMeasurementType: api.createType,
}));
const consultation = {
  id: "c",
  patient_id: "p",
  professional_id: "owner",
  status: "draft",
  consultation_date: "2026-09-03T12:00:00Z",
} as Consultation;
const patient = {
  id: "p",
  birth_date: "1996-01-01",
  full_name: "Paciente de prueba",
} as Patient;
const attention = vi.fn(),
  dirty = vi.fn();
async function mount() {
  render(
    <AnthropometryPanel
      consultation={consultation}
      patient={patient}
      onDirty={dirty}
      onNeedsAttention={attention}
    />,
  );
  await screen.findByRole("heading", {
    name: "Registradas · mediciones de hoy",
  });
}
function fill() {
  fireEvent.click(
    screen.getByRole("button", { name: "Seleccionar mediciones" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Peso · kg" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Talla · cm" }));
  fireEvent.change(screen.getByLabelText("Peso (kg)"), {
    target: { value: "80" },
  });
  fireEvent.change(screen.getByLabelText("Talla (cm)"), {
    target: { value: "175" },
  });
  fireEvent.change(
    screen.getByLabelText("Contexto para fórmulas y referencias"),
    { target: { value: "adult" } },
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /^IMC/ }));
}
beforeEach(() => {
  vi.clearAllMocks();
  api.load.mockResolvedValue([]);
  api.setup.mockResolvedValue({
    types: measurementTypes,
    devices: [],
    template: null,
    legacy: [],
  });
  api.preference.mockResolvedValue(true);
  api.savePreference.mockResolvedValue(undefined);
  api.save.mockImplementation(
    async (_c: Consultation, revision: number, payload: AnthroPayload) => ({
      id: "saved" + revision,
      consultation_id: "c",
      patient_id: "p",
      professional_id: "owner",
      revision: revision + 1,
      measured_at: payload.input.measuredAt,
      created_at: payload.input.measuredAt,
      payload,
    }),
  );
});
describe("documentación antropométrica guiada", () => {
  it("shows informative formulas and requires explicit review before saving a generated note", async () => {
    await mount();
    fill();
    expect(screen.getByText("Fórmulas y métodos")).toBeInTheDocument();
    expect(
      screen.getByText(/Nuthrick calcula únicamente las fórmulas/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Más información" })[0]);
    expect(screen.getByRole("dialog", { name: "IMC" })).toBeInTheDocument();
    expect(screen.getByText("¿Para qué se utiliza?")).toBeInTheDocument();
    expect(screen.getByText("Limitaciones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(
      screen.getByText("Clasificación de referencia: Sobrepeso"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Crear nota antropométrica" }),
    );
    expect(api.save).not.toHaveBeenCalled();
    const note = screen.getByLabelText(
      "Borrador editable de nota antropométrica",
    );
    expect((note as HTMLTextAreaElement).value).toContain("Peso: 80 kg");
    fireEvent.change(note, {
      target: { value: "Nota editada y validada por profesional" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Revisa la nota",
    );
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Revisé y aprobé esta nota para guardarla",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    const saved = api.save.mock.calls[0][2] as AnthroPayload;
    expect(saved).toMatchObject({
      note: "Nota editada y validada por profesional",
      noteReviewed: true,
      diagnosis: { enabled: false, problem: "", etiology: "" },
    });
    expect(saved.results.find((r) => r.id === "bmi")).toMatchObject({
      reference_id: "who-adult-bmi",
      reference_version: "2000-v1",
      classification: "Sobrepeso",
    });
    expect(saved.results.find((r) => r.id === "bmi")?.value).toBeCloseTo(
      80 / 1.75 ** 2,
      12,
    );
  });
  it("never supplies problem or etiology; evidence is explicitly selected and invalidated on input changes", async () => {
    await mount();
    fill();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Registrar diagnóstico nutricional/,
      }),
    );
    expect(screen.getByLabelText("Problema")).toHaveValue("");
    expect(screen.getByLabelText("Relacionado con / etiología")).toHaveValue(
      "",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar evidencia antropométrica" }),
    );
    const evidence = screen.getByRole("checkbox", { name: /^Peso: 80 kg/ });
    expect(evidence).not.toBeChecked();
    fireEvent.click(evidence);
    fireEvent.change(screen.getByLabelText("Problema"), {
      target: { value: "Problema evaluado por profesional" },
    });
    fireEvent.change(screen.getByLabelText("Relacionado con / etiología"), {
      target: { value: "Etiología documentada" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0][2].diagnosis.evidence).toEqual([
      expect.objectContaining({ id: "weight", value: 80 }),
    ]);
    fireEvent.change(screen.getByLabelText("Peso (kg)"), {
      target: { value: "81" },
    });
    expect(
      screen.getByRole("checkbox", { name: /^Peso: 81 kg/ }),
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Completa el diagnóstico manual",
    );
    expect(api.save).toHaveBeenCalledOnce();
  });
  it("keeps edits after network failure and persists the guidance preference", async () => {
    api.save.mockRejectedValue(new Error("Sin conexión"));
    await mount();
    fill();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Mostrar orientación" }),
    );
    await waitFor(() =>
      expect(api.savePreference).toHaveBeenCalledWith("owner", false),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue(80);
    expect(
      screen.getByText("Cambios pendientes de guardar"),
    ).toBeInTheDocument();
  });
  it("loads history without recalculating or replacing the original reference and notes", async () => {
    const payload = newPayload("2026-08-01T12:00:00Z", 30);
    payload.input.measurements = { weight: 80, height: 175 };
    payload.results = calculate(payload.input).results;
    const bmi = payload.results.find((r) => r.id === "bmi")!;
    bmi.value = 22.1234;
    bmi.classification = "Clasificación conservada";
    bmi.reference = {
      id: "historical",
      version: "original",
      title: "Referencia conservada",
      url: "https://www.who.int/",
    };
    payload.assessment[0] = "Valoración registrada en esa fecha";
    payload.note = "Nota histórica";
    payload.noteReviewed = true;
    payload.diagnosis = {
      ...payload.diagnosis,
      enabled: true,
      mode: "narrative",
      narrative: "Diagnóstico registrado manualmente",
    };
    api.load.mockResolvedValue([
      {
        id: "saved",
        consultation_id: "c",
        patient_id: "p",
        professional_id: "owner",
        revision: 1,
        measured_at: payload.input.measuredAt,
        created_at: payload.input.measuredAt,
        payload,
      },
    ]);
    render(<AnthropometryHistory patientId="p" consultationId="c" />);
    expect(await screen.findByText("Nota histórica")).toBeInTheDocument();
    expect(
      screen.getByText("Valoración registrada en esa fecha"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Diagnóstico registrado manualmente"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Clasificación de referencia: Clasificación conservada"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Referencia conservada · original" }),
    ).toBeInTheDocument();
    expect(screen.getByText("22.12")).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });
});
describe("flujo personalizado de mediciones", () => {
  it("loads the patient's habitual fields directly with empty values and no setup wizard", async () => {
    api.setup.mockResolvedValue({
      types: measurementTypes,
      devices: [],
      legacy: [],
      template: {
        revision: 2,
        configuration: {
          ...emptyConfiguration(),
          measurements: ["weight", "waist_circumference", "calf_circumference"],
          protocol: "Habitual",
        },
      },
    });
    await mount();
    expect(
      screen.getByRole("heading", {
        name: "Seguimiento antropométrico habitual",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Quiero calcular indicadores/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Peso (kg)")).toHaveLength(1);
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue(null);
    expect(screen.getByLabelText("Cintura (cm)")).toHaveValue(null);
    expect(screen.getByLabelText("Pantorrilla (cm)")).toHaveValue(null);
    expect(screen.queryByLabelText("Bíceps (mm)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Configurar seguimiento habitual"));
    expect(screen.getByLabelText("Sólo en esta consulta")).toBeChecked();
    fireEvent.click(
      screen.getByLabelText(
        "También en el seguimiento habitual de este paciente",
      ),
    );
    fireEvent.change(screen.getByLabelText("Peso (kg)"), {
      target: { value: "80" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0][2].workflow).toMatchObject({
      templateScope: "habitual",
      templateRevision: 2,
    });
  });
  it("allows measurements even when no formula has sufficient data", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar mediciones" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Brazo relajado · cm" }),
    );
    expect(screen.getByLabelText("Brazo relajado (cm)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Peso (kg)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Brazo relajado (cm)"), {
      target: { value: "31" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0][2].workflow.calculations).toEqual([]);
    expect(
      api.save.mock.calls[0][2].workflow.entries.relaxed_arm_circumference,
    ).toMatchObject({ value: 31, source_type: "manual", unit: "cm" });
  });
  it("reuses height only after an explicit action and retains the original date", async () => {
    api.setup.mockResolvedValue({
      types: measurementTypes,
      devices: [],
      template: {
        revision: 1,
        configuration: {
          ...emptyConfiguration(),
          measurements: ["weight", "height"],
        },
      },
      legacy: [
        {
          id: "old",
          patient_id: "p",
          professional_id: "owner",
          consultation_id: "previous",
          measured_at: "2026-08-01T12:00:00Z",
          created_at: "2026-08-01T12:00:00Z",
          height_cm: 178,
          weight_kg: 90,
        },
      ],
    });
    await mount();
    expect(screen.getByLabelText("Talla (cm)")).toHaveValue(null);
    expect(screen.getByText("Última talla: 178 cm")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Usar esta talla anterior" }),
    );
    expect(screen.getByLabelText("Talla (cm)")).toHaveValue(178);
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue(null);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Guardar antropometría y valoración",
      }),
    );
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0][2].workflow.entries.height).toMatchObject({
      reused_from_id: "old:height",
      original_measured_at: "2026-08-01T12:00:00Z",
    });
  });
});
