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
}));
vi.mock("@/src/services/clinicalCopilot", () => ({
  clinicalWorkspace: api.workspace,
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
  pesStatement: "Borrador PES",
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
          pes_statement: "PES manual",
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
        expect.objectContaining({ pesStatement: "PES manual" }),
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
    await screen.findByDisplayValue("Borrador PES");
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
    fireEvent.change(screen.getByLabelText("Enunciado PES"), {
      target: { value: "PES revisado" },
    });
    fireEvent.click(screen.getByText("Aprobar"));
    await waitFor(() =>
      expect(props.onPes).toHaveBeenCalledWith(
        expect.objectContaining({ pesStatement: "PES revisado" }),
      ),
    );
    expect(api.workspace).toHaveBeenCalledWith(
      "test-consult",
      1,
      "pes",
      expect.objectContaining({ pesStatement: "PES revisado", stamp: "a" }),
      "generation",
    );
  });
  it("discard never writes clinical data", async () => {
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByDisplayValue("Borrador PES");
    fireEvent.click(screen.getByText("Descartar"));
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
  });
  it("another proposal preserves the editable draft until an explicit choice", async () => {
    render(<PesCopilot {...props} />);
    await screen.findByText("Antropometría disponible");
    fireEvent.click(screen.getByText("Generar borrador"));
    await screen.findByDisplayValue("Borrador PES");
    api.generate.mockResolvedValue({
      generationId: "new",
      status: "succeeded",
      output: { ...draft, pesStatement: "Alternativa" },
      replay: false,
    });
    fireEvent.click(screen.getByText("Otra propuesta"));
    await screen.findByText("Alternativa");
    expect(screen.getByDisplayValue("Borrador PES")).toBeTruthy();
    fireEvent.click(screen.getByText("Conservar anterior"));
    expect(screen.getByDisplayValue("Borrador PES")).toBeTruthy();
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
    await waitFor(() => expect(api.foods).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Agregar alimento manualmente"));
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
    await screen.findByText("150 kcal estimadas");
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
    await screen.findByText("75 kcal estimadas");
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
  it("AI extraction remains unconfirmed and preserves the original narrative", async () => {
    api.generate.mockResolvedValue({
      generationId: "recall-gen",
      status: "succeeded",
      output: {
        meals: [
          {
            mealLabel: "Desayuno",
            approximateTime: null,
            items: [
              {
                rawText: "2 huevos",
                normalizedName: "huevo",
                quantity: 2,
                unit: "piece",
                confidence: 1,
                needsConfirmation: false,
              },
            ],
          },
        ],
        unresolvedItems: [],
        ambiguities: [],
      },
    });
    render(<RecallCopilot {...props} />);
    fireEvent.click(screen.getByText("Capturar recordatorio"));
    await waitFor(() => expect(api.foods).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Texto capturado"), {
      target: { value: "Desayunó 2 huevos" },
    });
    fireEvent.click(screen.getByText("Organizar alimentos"));
    await screen.findByText("Texto original: 2 huevos");
    expect(screen.getByDisplayValue("Desayunó 2 huevos")).toBeTruthy();
    expect(
      (screen.getByText("Confirmar recordatorio") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(api.workspace.mock.calls.every((c) => !c[2])).toBe(true);
  });
});
