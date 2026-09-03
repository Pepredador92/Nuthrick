import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropometryPanel, AnthropometryHistory } from "./AnthropometryPanel";
import { newPayload, type AnthroPayload } from "./model";
import { calculate } from "./engine";
import type { Consultation, Patient } from "@/src/types/domain";
const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  preference: vi.fn(),
  savePreference: vi.fn(),
}));
vi.mock("@/src/services/anthropometry", () => ({
  loadAnthropometry: api.load,
  saveAnthropometry: api.save,
  loadGuidancePreference: api.preference,
  saveGuidancePreference: api.savePreference,
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
  await screen.findByRole("heading", { name: "Mediciones y contexto" });
}
function fill() {
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
}
beforeEach(() => {
  vi.clearAllMocks();
  api.load.mockResolvedValue([]);
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
    expect(
      screen.getByText("Más información · Jackson-Pollock 7"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Relaciona peso y talla como indicador general/, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Calcular resultados" }),
    );
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
