import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClinicalSuggestionsAI,
  ConsultationObjectiveAI,
} from "./ConsultationObjectiveAI";

const api = vi.hoisted(() => ({ generate: vi.fn(), status: vi.fn() }));
vi.mock("@/src/services/ai", async (original) => ({
  ...(await original<object>()),
  runAIRequest: api.generate,
  getAIGenerationStatus: api.status,
}));
vi.mock("@/src/components/ai/AIControls", () => ({
  AIButton: (
    { children, onClick, disabled }: React.ButtonHTMLAttributes<
      HTMLButtonElement
    >,
  ) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

const props = {
  patientId: "patient-id",
  consultationId: "consultation-id",
  revision: 3,
  before: vi.fn().mockResolvedValue(true),
  onApply: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.generate.mockResolvedValue({
    generationId: "generation-id",
    status: "succeeded",
    replay: false,
    output: {
      objectives: [{
        text:
          "Elegir una alternativa de colación para los días de jornada larga.",
        evidence: [{
          source: "Entrevista · expectativas",
          finding: "Busca organizar sus comidas",
        }],
      }],
    },
  });
});
afterEach(cleanup);

describe("ConsultationObjectiveAI", () => {
  it("shows a cited draft and only applies it after the clinician chooses", async () => {
    render(<ConsultationObjectiveAI {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Proponer objetivos" }));
    await screen.findByText(
      "Elegir una alternativa de colación para los días de jornada larga.",
      { selector: "h5" },
    );
    expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({
      feature: "consultation_support",
      patientId: "patient-id",
      consultationId: "consultation-id",
      revision: 3,
    }));
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Agregar a la entrevista" }),
    );
    expect(props.onApply).toHaveBeenCalledWith(
      "Elegir una alternativa de colación para los días de jornada larga.",
    );
    expect(
      screen.queryByText(
        "Elegir una alternativa de colación para los días de jornada larga.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Propuestas agregadas",
    );
  });

  it("does not generate if the interview could not be saved", async () => {
    render(
      <ConsultationObjectiveAI
        {...props}
        before={vi.fn().mockResolvedValue(false)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Proponer objetivos" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Guarda la entrevista",
      )
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
});

it("drafts instructions separately, preserves review and can apply a new generation", async () => {
  api.generate.mockResolvedValue({
    generationId: "g",
    status: "succeeded",
    output: {
      instructions: [{
        text: "Prepara la colación acordada antes de salir.",
        evidence: [{
          source: "Entrevista · first actions",
          finding: "Preparar colación",
        }],
      }],
    },
  });
  render(<ClinicalSuggestionsAI {...props} kind="instructions" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer indicaciones" }),
  );
  await screen.findByText("Prepara la colación acordada antes de salir.");
  expect(api.generate).toHaveBeenCalledWith(
    expect.objectContaining({ feature: "patient_instructions" }),
  );
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar a indicaciones" }),
  );
  expect(props.onApply).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer indicaciones" }),
  );
  expect(await screen.findByRole("button", { name: "Agregar a indicaciones" }))
    .toBeEnabled();
});

it("removes the chosen objective while preserving the other proposals and requiring agreement", async () => {
  const onApplyGoal = vi.fn();
  api.generate.mockResolvedValue({
    status: "succeeded",
    output: {
      objectives: [
        {
          goal: {
            outcome: "Organizar los horarios",
            target: "Registrar cuatro días",
            timeframe: "En una semana",
          },
          evidence: [{ source: "Entrevista", finding: "Horarios variables" }],
        },
        {
          text: "Revisar las colaciones",
          evidence: [{ source: "Entrevista", finding: "Jornada larga" }],
        },
      ],
    },
  });
  render(<ConsultationObjectiveAI {...props} onApplyGoal={onApplyGoal} />);
  fireEvent.click(screen.getByRole("button", { name: "Proponer objetivos" }));
  await screen.findByText("Organizar los horarios");
  expect(screen.getByText(/Meta: Registrar cuatro días/)).not.toBeVisible();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Agregar y revisar" })[0],
  );
  expect(onApplyGoal).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: "Organizar los horarios",
      agreement: "pending",
    }),
  );
  expect(screen.queryByText("Organizar los horarios")).not.toBeInTheDocument();
  expect(screen.getByText("Revisar las colaciones", { selector: "h5" }))
    .toBeVisible();
  expect(screen.getByText("1 propuesta por revisar")).toBeVisible();
  expect(api.generate).toHaveBeenCalledOnce();
});
