import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PesCopilot, RecallCopilot } from "./ClinicalCopilot";
import { AIRequestError } from "@/src/services/ai";
import realCalibration from "../../../../supabase/functions/ai/fixtures/pes-real-calibration-20260922.json";
const api = vi.hoisted(() => ({
  workspace: vi.fn(),
  generate: vi.fn(),
  foods: vi.fn(),
  status: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/src/services/clinicalCopilot", () => ({
  clinicalWorkspace: api.workspace,
  removeClinicalRecall: api.remove,
}));
vi.mock("@/src/services/ai", async (original) => ({
  ...(await original<object>()),
  runAIRequest: api.generate,
  getAIGenerationStatus: api.status,
}));
vi.mock("@/src/services/foodCatalog", async (original) => ({
  ...(await original<object>()),
  listFoodItems: api.foods,
}));
const w = {
  stamp: "a",
  readiness: {
    interview: true,
    objective: true,
    anthropometry: true,
    laboratories: false,
  },
  records: {},
};
const props = {
  patientId: "test",
  consultationId: "test-consult",
  revision: 1,
  before: vi.fn().mockResolvedValue(true),
  onPes: vi.fn(),
};
const draft = {
  problem: "Borrador P",
  etiology: "Borrador E",
  signsSymptoms: ["Peso registrado"],
  pesStatement: "Borrador P relacionado con Borrador E, evidenciado por Peso registrado.",
  evidence: [{ source: "Antropometría", finding: "92 kg" }],
  missingContext: ["Laboratorios no registrados"],
  uncertainties: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.workspace.mockResolvedValue(w);
  api.generate.mockResolvedValue({
    generationId: "generation",
    status: "succeeded",
    output: draft,
    replay: false,
  });
  api.foods.mockResolvedValue([
    {
      id: "egg",
      name: "Huevo entero",
      normalized_name: "huevo entero",
      aliases: ["huevo"],
      active: true,
      is_custom: false,
      portion_amount: 1,
      portion_unit: "piece",
      edible_grams: 50,
      group_code: "AOA_MODERATE_FAT",
    },
  ]);
});
afterEach(cleanup);
describe("PES copilot", () => {
  it("blocks a partial PES with empty etiology and exposes the missing context", async () => {
    api.generate.mockResolvedValue({ generationId: "partial", status: "succeeded", output: {
      ...draft, etiology: "", missingContext: ["Confirmar si persiste la barrera de horarios registrada en julio"],
    }, replay: false });
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText(/Falta completar la etiología/);
    expect(screen.getByText("Confirmar si persiste la barrera de horarios registrada en julio", { selector: "li" })).toBeTruthy();
    expect(screen.getByLabelText("Etiología").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByText("Aprobar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Etiología"), { target: { value: " \n\t " } });
    expect((screen.getByText("Aprobar") as HTMLButtonElement).disabled).toBe(true);
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
    fireEvent.change(screen.getByLabelText("Etiología"), { target: { value: "Barrera de horarios confirmada en entrevista" } });
    fireEvent.click(screen.getByText("Aprobar"));
    await waitFor(() => expect(props.onPes).toHaveBeenCalledWith(expect.objectContaining({ etiology: "Barrera de horarios confirmada en entrevista" })));
  });
  it("preserves manual review and approval after a context-size failure", async () => {
    api.generate.mockRejectedValue(new AIRequestError("input_too_large"));
    render(<PesCopilot {...props} answers={{ pes_problem: "P", pes_etiology: "E", pes_evidence: "Dato registrado", pes_statement: "P relacionado con E, evidenciado por Dato registrado." }} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText(/Puedes redactar y cerrar la consulta manualmente/);
    fireEvent.click(screen.getByText("Revisar PES escrito"));
    fireEvent.click(screen.getByText("Aprobar"));
    await waitFor(() => expect(props.onPes).toHaveBeenCalledWith(expect.objectContaining({ pesStatement: "P relacionado con E, evidenciado por Dato registrado." })));
    expect(sessionStorage.getItem("clinical-pending:test-consult:pes_diagnosis")).toBeNull();
  });
  it.each(["B", "C"] as const)("explains real %s abstention without allowing approval", async (key) => {
    api.generate.mockResolvedValue({ generationId: "real-fixture", status: "succeeded", output: realCalibration[key].output, replay: false });
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText(/Información insuficiente para proponer un PES/);
    expect((screen.getByText("Aprobar") as HTMLButtonElement).disabled).toBe(true);
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
    expect(props.onPes).not.toHaveBeenCalled();
  });
  it("manual PES can be reviewed and approved without spending on AI", async () => {
    render(
      <PesCopilot
        {...props}
        answers={{
          pes_problem: "P",
          pes_etiology: "E",
          pes_evidence: "Evidencia",
          pes_statement: "P relacionado con E, evidenciado por Evidencia.",
        }}
      />,
    );
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Revisar PES escrito"));
    fireEvent.click(screen.getByText("Aprobar"));
    await waitFor(() =>
      expect(api.workspace).toHaveBeenCalledWith(
        "test-consult",
        1,
        "pes",
        expect.objectContaining({ pesStatement: "P relacionado con E, evidenciado por Evidencia." }),
        undefined,
      ),
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
  it("readiness does not require labs; generating does not save and approval uses edits", async () => {
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    expect(screen.getByText("Laboratorios sin registrar")).toBeTruthy();
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText("Borrador P relacionado con Borrador E, evidenciado por Peso registrado.");
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
    fireEvent.change(screen.getByLabelText("Etiología"), { target: { value: "Causa revisada" } });
    fireEvent.click(screen.getByText("Aprobar"));
    await waitFor(() =>
      expect(props.onPes).toHaveBeenCalledWith(
        expect.objectContaining({ pesStatement: "Borrador P relacionado con Causa revisada, evidenciado por Peso registrado." }),
      ),
    );
    expect(api.workspace).toHaveBeenCalledWith(
      "test-consult",
      1,
      "pes",
      expect.objectContaining({ pesStatement: "Borrador P relacionado con Causa revisada, evidenciado por Peso registrado.", stamp: "a" }),
      "generation",
    );
  });
  it("discard never writes clinical data", async () => {
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText("Borrador P relacionado con Borrador E, evidenciado por Peso registrado.");
    fireEvent.click(screen.getByText("Descartar"));
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
  });
  it("another proposal preserves the editable draft until an explicit choice", async () => {
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText("Borrador P relacionado con Borrador E, evidenciado por Peso registrado.");
    api.generate.mockResolvedValue({
      generationId: "new",
      status: "succeeded",
      output: { ...draft, problem: "Alternativa" },
      replay: false,
    });
    fireEvent.click(screen.getByText("Otra propuesta"));
    await screen.findByText("Alternativa relacionado con Borrador E, evidenciado por Peso registrado.");
    expect(screen.getByText("Borrador P relacionado con Borrador E, evidenciado por Peso registrado.")).toBeTruthy();
    fireEvent.click(screen.getByText("Conservar anterior"));
    expect(screen.getByText("Borrador P relacionado con Borrador E, evidenciado por Peso registrado.")).toBeTruthy();
  });
  it("disabled or no credit generation does not remove manual path", async () => {
    api.generate.mockRejectedValue(new AIRequestError("insufficient_credits"));
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText(/Ya utilizaste los créditos/);
    expect(screen.getByText(/Puedes redactar el PES manualmente/)).toBeTruthy();
    expect(props.onPes).not.toHaveBeenCalled();
  });
  it("network uncertainty persists across remount and never retries automatically", async () => {
    api.generate.mockRejectedValue(
      new AIRequestError("provider_outcome_unknown"),
    );
    const first = render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByText("Comprobar solicitud");
    first.unmount();
    render(<PesCopilot {...props} />);
    expect(screen.getByText("Comprobar solicitud")).toBeTruthy();
    expect(api.generate).toHaveBeenCalledTimes(1);
  });
});
describe("recall copilot", () => {
  it("manual capture works without generation and recalculates after quantity change", async () => {
    render(<RecallCopilot {...props} />);
    fireEvent.click(screen.getByText("Capturar recordatorio"));
    fireEvent.click(screen.getByText("Agregar alimento manualmente"));
    await waitFor(() => expect(api.foods).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Buscar alimento 1"), {
      target: { value: "huevo" },
    });
    fireEvent.change(screen.getByLabelText("Alimento 1"), {
      target: { value: "egg" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad 1"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByLabelText("Revisé alimento, cantidad y unidad"),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revisar resumen' }));
    expect(await screen.findByText('Energía estimada')).toBeVisible();
    expect(screen.getByText('150')).toHaveTextContent('150 kcal');
    fireEvent.click(screen.getByRole('button', { name: /Alimentos Revisa/ }));
    fireEvent.change(screen.getByLabelText("Cantidad 1"), {
      target: { value: "1" },
    });
    expect(
      (screen.getByText("Confirmar recordatorio") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByLabelText("Revisé alimento, cantidad y unidad"),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revisar resumen' }));
    expect(screen.getByText('75')).toHaveTextContent('75 kcal');
    fireEvent.click(screen.getByText("Confirmar recordatorio"));
    await waitFor(() =>
      expect(api.workspace).toHaveBeenCalledWith(
        "test-consult",
        1,
        "recall",
        expect.objectContaining({
          items: [
            expect.objectContaining({
              foodId: "egg",
              quantity: 1,
              unit: "piece",
            }),
          ],
        }),
        undefined,
      ),
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
  const estimate = { confidence: 'low', assumptions: ['Se asumió un vaso de 240 ml.'], uncertainties: ['Confirmar el tamaño del vaso.'], meals: [{ mealLabel: 'Desayuno', description: 'Dos huevos y un vaso de leche.', energy_kcal: 300, protein_g: 20, carbohydrate_g: 12, fat_g: 18 }] };
  async function calculate() {
    api.generate.mockResolvedValue({ generationId: 'recall-gen', status: 'succeeded', output: structuredClone(estimate) });
    render(<RecallCopilot {...props} />);
    fireEvent.click(screen.getByText('Capturar recordatorio'));
    fireEvent.change(screen.getByLabelText('Texto capturado'), { target: { value: 'Desayunó dos huevos y un vaso de leche.' } });
    fireEvent.click(screen.getByText('Calcular consumo con IA'));
    await screen.findByLabelText('Energía 1');
  }
  it('calculates without a catalog, edits meal values and saves only after professional confirmation', async () => {
    await calculate();
    expect(api.foods).not.toHaveBeenCalled();
    expect(api.workspace.mock.calls.every(c => !c[2])).toBe(true);
    fireEvent.change(screen.getByLabelText('Energía 1'), { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar resumen' }));
    expect(screen.getByRole('button', { name: 'Confirmar recordatorio' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Revisé las porciones, los supuestos y los valores estimados.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recordatorio' }));
    await waitFor(() => expect(api.workspace).toHaveBeenCalledWith('test-consult', 1, 'recall', expect.objectContaining({ method: 'ai_estimate', narrative: 'Desayunó dos huevos y un vaso de leche.', estimate: expect.objectContaining({ meals: [expect.objectContaining({ energy_kcal: 350 })] }) }), 'recall-gen'));
  });
  it('retains dictation on a rejected estimate and offers the manual path', async () => {
    api.generate.mockRejectedValue(new AIRequestError('invalid_output'));
    render(<RecallCopilot {...props} />); fireEvent.click(screen.getByText('Capturar recordatorio'));
    fireEvent.change(screen.getByLabelText('Texto capturado'), { target: { value: 'Dos gorditas y un refresco.' } });
    fireEvent.click(screen.getByText('Calcular consumo con IA'));
    await screen.findByText(/Tu relato sigue aquí/);
    expect(screen.getByDisplayValue('Dos gorditas y un refresco.')).toBeVisible();
    expect(api.workspace.mock.calls.every(c => !c[2])).toBe(true);
    fireEvent.click(screen.getByText('Agregar alimento manualmente'));
    await screen.findByLabelText('Buscar alimento 1');
  });
  it('invalidates confirmation when the source narrative changes', async () => {
    await calculate();
    fireEvent.click(screen.getByRole('button', { name: 'Editar relato / volver a calcular' }));
    fireEvent.change(screen.getByLabelText('Texto capturado'), { target: { value: 'Solo bebió agua.' } });
    fireEvent.click(screen.getByRole('button', { name: /Estimación Revisa/ }));
    expect(screen.getByRole('button', { name: 'Revisar resumen' })).toBeDisabled();
    expect(api.workspace.mock.calls.every(c => !c[2])).toBe(true);
  });
  it('a second generation preserves the edited result until explicitly replaced', async () => {
    await calculate();
    fireEvent.change(screen.getByLabelText('Energía 1'), { target: { value: '375' } });
    fireEvent.click(screen.getByRole('button', { name: 'Editar relato / volver a calcular' }));
    api.generate.mockResolvedValue({ generationId: 'new-gen', status: 'succeeded', output: { ...estimate, meals: [{ ...estimate.meals[0], energy_kcal: 500 }] } });
    fireEvent.click(screen.getByText('Calcular consumo con IA'));
    await screen.findByText('Hay una nueva interpretación. Tu captura actual sigue intacta.');
    expect(screen.getByLabelText('Energía 1')).toHaveValue(375);
    fireEvent.click(screen.getByText('Revisar nueva interpretación'));
    expect(screen.getByLabelText('Energía 1')).toHaveValue(500);
  });
  it('saved estimates are visible and withdrawal requires an explicit action', async () => {
    api.workspace.mockResolvedValue({ ...w, records: { recall: { method: 'ai_estimate', approved_at: '2026-10-13', items: [], narrative: 'Dos huevos y leche.', estimate } } });
    api.remove.mockResolvedValue(undefined);
    render(<RecallCopilot {...props} />);
    await screen.findByText('Recordatorio confirmado · Estimación con IA revisada');
    fireEvent.click(screen.getByText('Retirar recordatorio y volver a capturar'));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Retirar de esta consulta'));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('test-consult', 1, 'a'));
  });
});
