import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Consultation, Patient } from "@/src/types/domain";
import type { PrenatalContext, PrenatalRecord } from "@/src/services/prenatalMeasurements";
import { evaluatePrenatalMeasurements, extractPrenatalInterview, gestationalAge } from "@/src/features/consultations/prenatalMeasurements";
import { PrenatalMeasurements } from "./PrenatalMeasurements";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/src/services/prenatalMeasurements", () => ({
  loadPrenatalMeasurements: api.load,
  savePrenatalMeasurements: api.save,
}));

const consultation = { id: "current" } as Consultation;
const patient = { birth_date: "1998-01-01", height_cm: 160 } as Patient;
const initialContext: PrenatalContext = {
  gestation_days: 98, pregnancy_type: "single", pre_pregnancy_weight: 60,
  weight_source: "documented", activity: "low_active", edema: null, previous_weight: null, previous_date: null,
};
const first: PrenatalRecord = {
  ...initialContext, consultation_id: "first", date: "2026-10-30", pregnancy_id: "pregnancy", weight: 62, height: 160,
};
const another: PrenatalRecord = { ...first, consultation_id: "other", pregnancy_id: "other-pregnancy", date: "2026-11-12", gestation_days: 112, weight: 90 };

const renderWorkspace = (answers: Record<string, unknown> = {}) => render(<PrenatalMeasurements
  consultation={consultation} patient={patient} answers={answers} clinicalDate="2026-11-27" optionalFields={["previous_weight"]}
  beforeSave={async () => true} onPendingChange={vi.fn()} openInterview={vi.fn()} />);
const write = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const chart = (name: string) => within(screen.getByRole("heading", { name }).closest("section")!);

describe("prenatal measurement evaluation", () => {
  const example = { age: 28, height: 160, preWeight: 60, weight: 62, days: 98, type: "single", activity: "low_active" } as const;
  it("reproduces the references in the example and keeps the equations scoped", () => {
    const result = evaluatePrenatalMeasurements(example);
    expect(result.bmi).toBeCloseTo(23.44, 2);
    expect(result.gain).toBe(2);
    expect(result.range).toEqual([0.85, 2.5]);
    expect(result.position).toBe("inside");
    expect(result.energy).toBeCloseTo(2513.67);
    expect(evaluatePrenatalMeasurements({ ...example, preWeight: null })).toMatchObject({ bmi: null, gain: null, energy: null });
    expect(evaluatePrenatalMeasurements({ ...example, type: "multiple" })).toMatchObject({ gain: 2, range: null, energy: null });
    expect(evaluatePrenatalMeasurements({ ...example, age: 17 })).toMatchObject({ reference: null, energy: null });
    expect(evaluatePrenatalMeasurements({ ...example, days: 13 * 7 + 6 }).energy).toBeNull();
    expect(evaluatePrenatalMeasurements({ ...example, weight: 58 }).position).toBe("below");
    expect(gestationalAge(18, 2)).toBe(128);
    expect(gestationalAge(18, 8)).toBeNull();
  });

  it("treats the first prenatal control as an estimate and ignores hidden weight answers", () => {
    expect(extractPrenatalInterview({ prenatal_weight_kg: 60, prenatal_weight_source: "Registrado en el primer control prenatal" }))
      .toMatchObject({ source: "estimated", preWeight: 60 });
    expect(extractPrenatalInterview({ prenatal_weight_kg: 60, prenatal_weight_source: "Por confirmar", prenatal_type: "Por confirmar" }))
      .toMatchObject({ source: null, preWeight: null, typePending: true });
  });
});

describe("private prenatal workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.load.mockResolvedValue({ records: [], measurements: {} });
  });

  it("reuses interview answers and saves the first measurement and its context", async () => {
    api.save.mockResolvedValue({
      records: [{ ...first, consultation_id: consultation.id, date: "2026-11-27" }],
      measurements: { weight: 62, height: 160 },
    });
    renderWorkspace({
      prenatal_weeks: 14, prenatal_days: 0, prenatal_type: "Único",
      prenatal_weight_source: "Medido antes del embarazo", prenatal_weight_kg: 60,
    });
    expect(await screen.findByRole("heading", { name: "Mediciones prenatales" })).toBeVisible();
    expect(screen.getByLabelText("Semanas de gestación")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Peso pregestacional (kg)")).toHaveValue("60");
    write("Peso actual (kg)", "62");
    write("Actividad física habitual", "low_active");
    expect(screen.getByText("Dentro del intervalo orientativo")).toBeVisible();
    expect(screen.getByText("2,514 kcal/día")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mediciones" }));
    expect(await screen.findByText("Mediciones prenatales guardadas.")).toBeVisible();
    expect(api.save).toHaveBeenCalledWith("current", null, initialContext, { weight: 62, height: 160 });
  });

  it("uses history only from the chosen pregnancy and calculates the rate between visits", async () => {
    api.load.mockResolvedValue({ records: [another, first], measurements: { weight: 63.6 } });
    const { container } = renderWorkspace();
    const episode = await screen.findByLabelText("Embarazo al que corresponde la medición");
    expect(episode).toHaveValue("");
    fireEvent.change(episode, { target: { value: "pregnancy" } });
    write("Semanas de gestación", "18");
    expect(screen.getByLabelText("Peso pregestacional (kg)")).toHaveValue("60");
    expect(screen.getByText("400 g/semana")).toBeVisible();
    const data = within(screen.getByRole("table", { hidden: true }));
    expect(data.getByText("+2.0 kg")).toBeInTheDocument();
    expect(data.getByText("+3.6 kg")).toBeInTheDocument();
    expect(container.querySelectorAll(".prenatal-point")).toHaveLength(2);
  });

  it("explains the missing data under each chart and clears the notices when the data is entered", async () => {
    renderWorkspace();
    await screen.findByRole("heading", { name: "Mediciones prenatales" });
    const gain = () => chart("Ganancia de peso acumulada");
    const history = () => chart("Seguimiento de ganancia gestacional");
    write("Peso actual (kg)", "62");
    expect(gain().getByText("Registra el peso pregestacional para calcular la ganancia.")).toBeVisible();
    write("Peso pregestacional (kg)", "60");
    expect(history().getByText("Registra la edad gestacional para ubicar este peso en la gráfica.")).toBeVisible();
    expect(gain().getByText("Confirma el tipo de embarazo para mostrar el intervalo orientativo.")).toBeVisible();
    write("Tipo de embarazo", "single");
    expect(gain().getByText("Registra la edad gestacional para mostrar el intervalo orientativo de esta consulta.")).toBeVisible();
    write("Semanas de gestación", "14");
    expect(gain().getByText("Dentro del intervalo orientativo")).toBeVisible();
    expect(history().getByText("Evolución de la paciente")).toBeVisible();
    expect(history().queryByText(/Registra la edad gestacional/)).not.toBeInTheDocument();
    expect(gain().queryByText(/Confirma el tipo de embarazo/)).not.toBeInTheDocument();
  });

  it("keeps the observed gain and explains why the reference is unavailable for multiple pregnancies", async () => {
    renderWorkspace({ prenatal_type: "Múltiple", prenatal_weeks: 14 });
    await screen.findByRole("heading", { name: "Mediciones prenatales" });
    write("Peso actual (kg)", "62");
    write("Peso pregestacional (kg)", "60");
    const gain = chart("Ganancia de peso acumulada");
    const history = chart("Seguimiento de ganancia gestacional");
    const restriction = "El intervalo orientativo de este espacio corresponde a embarazos únicos.";
    expect(gain.getByText("+2.0 kg")).toBeVisible();
    expect(gain.getByText(restriction)).toBeVisible();
    expect(history.getByText(restriction)).toBeVisible();
    expect(history.getByText("Evolución de la paciente")).toBeVisible();
    expect(history.queryByText("Intervalo orientativo")).not.toBeInTheDocument();
  });

  it("explains the covered weeks on the current gain card before the weekly reference starts", async () => {
    renderWorkspace({ prenatal_type: "Único", prenatal_weeks: 12 });
    await screen.findByRole("heading", { name: "Mediciones prenatales" });
    write("Peso actual (kg)", "62");
    write("Peso pregestacional (kg)", "60");
    expect(chart("Ganancia de peso acumulada").getByText(
      "La comparación por semana se muestra desde la semana 13 hasta la semana 42 con 6 días.",
    )).toBeVisible();
    expect(chart("Seguimiento de ganancia gestacional").getByText("Evolución de la paciente")).toBeVisible();
  });

  it("saves an incomplete visit and rejects an invalid previous date without losing the draft", async () => {
    api.save.mockResolvedValue({ records: [], measurements: { weight: 62 } });
    renderWorkspace();
    await screen.findByRole("heading", { name: "Mediciones prenatales" });
    write("Peso actual (kg)", "62");
    write("Peso anterior del mismo embarazo (kg)", "61");
    write("Fecha del peso anterior", "2026-11-27");
    fireEvent.click(screen.getByRole("button", { name: "Guardar mediciones" }));
    expect(screen.getByRole("alert")).toHaveTextContent("una fecha anterior");
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Peso actual (kg)")).toHaveValue("62");
    write("Peso anterior del mismo embarazo (kg)", "");
    write("Fecha del peso anterior", "");
    fireEvent.click(screen.getByRole("button", { name: "Guardar mediciones" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith("current", null,
      expect.objectContaining({ gestation_days: null, pre_pregnancy_weight: null }), { weight: 62, height: 160 }));
  });
});
