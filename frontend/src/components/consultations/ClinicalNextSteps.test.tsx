import { useState, type ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ClinicalFieldCards } from "./ClinicalFieldCards";
import { ClinicalFollowUp } from "./ClinicalFollowUp";
import type { Consultation, Patient } from "@/src/types/domain";
import type {
  Answers,
  Question,
} from "@/src/features/consultations/questionnaire";
import {
  clinicalFixtureApprovedAt,
  clinicalFixtureGoal,
  clinicalFixtureItem,
  clinicalFixturePlan,
} from "../../../tests/fixtures/clinical-guidance";
const api = vi.hoisted(() => ({
  objective: vi.fn(),
  strategies: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/src/services/appointments", () => ({ listAppointments: async () => ({ appointments: [] }) }));
vi.mock("@/src/services/clinicalProgress", () => ({ listProgressSources: async () => [] }));
vi.mock(
  "@/src/services/clinicalCopilot",
  () => ({ clinicalObjective: api.objective }),
);
vi.mock(
  "@/src/services/clinicalInterventions",
  () => ({ clinicalInterventions: api.strategies }),
);
vi.mock(
  "@/src/services/ai",
  async (original) => ({
    ...await original<object>(),
    runAIRequest: api.generate,
  }),
);
vi.mock(
  "@/src/components/ai/AIControls",
  () => ({
    AIButton: (
      { children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
    ) => <button {...props}>{children}</button>,
  }),
);
function renderFollowup(overrides?: Partial<ComponentProps<typeof ClinicalFollowUp>>) {
  return render(<MemoryRouter><ClinicalFollowUp
    consultation={{ id: "c", consultation_date: "2026-11-21", consultation_type: "initial" } as Consultation}
    patient={{ id: "p", full_name: "Valeria Torres" } as Patient}
    revision={1}
    active
    answers={{ treatment_objective: clinicalFixtureGoal.outcome }}
    noteInTemplate={false}
    additionalAnswers={[]}
    busy={false}
    progressVersion={0}
    onProgressSaved={vi.fn()}
    onNoteChange={vi.fn()}
    onEdit={vi.fn()}
    onSave={vi.fn().mockResolvedValue(true)}
    onStatusChange={vi.fn()}
    {...overrides}
  /></MemoryRouter>);
}

const question: Question = {
  question_key: "first_actions",
  label: "Indicaciones acordadas",
  question_type: "long_text",
  configuration: { max_length: 2000 },
  response_area: "professional_assessment",
  is_required: false,
};
function Fields({ before }: { before: () => Promise<boolean> }) {
  const [values, setValues] = useState<Answers>({
    first_actions: "Texto guardado.",
  });
  return (
    <ClinicalFieldCards
      questions={[question]}
      values={values}
      busy={false}
      showErrors={false}
      before={before}
      onChange={(key, value) =>
        setValues((current) => ({ ...current, [key]: value }))}
      ai={{ patientId: "p", consultationId: "c", revision: 1 }}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.objective.mockResolvedValue({
    pes: { approved_at: clinicalFixtureApprovedAt },
    plans: { treatment_objective: clinicalFixturePlan },
    objective: {
      question_key: "treatment_objective",
      value: clinicalFixtureGoal.outcome,
      smart_plan: clinicalFixturePlan,
      approved_at: clinicalFixtureApprovedAt,
    },
  });
  api.strategies.mockResolvedValue({ items: [clinicalFixtureItem] });
  api.generate.mockResolvedValue({
    status: "succeeded",
    output: {
      instructions: [
        {
          text: "Primera propuesta.",
          evidence: [{ source: "Entrevista", finding: "Prioridad acordada" }],
        },
        {
          text: "Segunda propuesta.",
          evidence: [{ source: "Entrevista", finding: "Prioridad acordada" }],
        },
      ],
    },
  });
});
afterEach(cleanup);
it("preserves the canonical edited text after closing, and retains the editor on failed saving", async () => {
  const before = vi.fn().mockResolvedValue(false);
  render(<Fields before={before} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Revisar y editar/ }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Texto adaptado." },
  });
  fireEvent.click(screen.getByRole("button", { name: "2 · Vista previa" }));
  expect(within(screen.getByRole("dialog")).getByText("Texto adaptado."))
    .toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Tu texto sigue aquí",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Cerrar indicaciones acordadas" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Revisar y editar/ }));
  expect(screen.getByRole("textbox")).toHaveValue("Texto adaptado.");
  before.mockResolvedValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(screen.getByText("Texto adaptado.")).toBeVisible();
});
it("adds a chosen AI draft to canonical instructions and preserves remaining proposals across close/reopen", async () => {
  render(<Fields before={async () => true} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer indicaciones con IA" }),
  );
  expect(api.generate).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Proponer indicaciones con IA",
    }),
  );
  await screen.findByText("Primera propuesta.", {
    selector: ".clinical-next-excerpt",
  });
  fireEvent.click(
    screen.getAllByRole("button", { name: "Agregar y revisar" })[0],
  );
  expect(screen.getByRole("textbox")).toHaveValue(
    "Texto guardado.\n\nPrimera propuesta.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer indicaciones con IA" }),
  );
  expect(screen.queryByText("Primera propuesta.")).not.toBeInTheDocument();
  expect(
    screen.getByText("Segunda propuesta.", {
      selector: ".clinical-next-excerpt",
    }),
  ).toBeVisible();
  expect(api.generate).toHaveBeenCalledOnce();
});
it("shows what will be reviewed and saves the follow-up without modifying the approved agreements", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onStatusChange = vi.fn();
  renderFollowup({ onSave, onStatusChange });
  await screen.findByRole("heading", { name: "Cómo lo revisarán" });
  expect(screen.getByRole("heading", { name: "Cómo lo revisarán" }).parentElement).toHaveTextContent(clinicalFixtureGoal.monitoring);
  expect(screen.getByText("Por agendar")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));
  expect(await screen.findByText("Seguimiento guardado.")).toBeVisible();
  expect(onSave).toHaveBeenCalledOnce();
  expect(onStatusChange).toHaveBeenLastCalledWith("complete");
  expect(api.objective).toHaveBeenCalledExactlyOnceWith("c", 1);
  expect(api.strategies).toHaveBeenCalledExactlyOnceWith("c", 1);
});

it("excludes objectives with a changed PES and strategies awaiting review", async () => {
  api.objective.mockResolvedValue({
    pes: { approved_at: "changed" },
    objective: { smart_plan: clinicalFixturePlan },
  });
  api.strategies.mockResolvedValue({
    items: [{ ...clinicalFixtureItem, requiresReview: true }],
  });
  const onStatusChange = vi.fn();
  renderFollowup({ onStatusChange });
  expect(await screen.findByText(/Los objetivos y las estrategias que apruebes/)).toBeVisible();
  expect(screen.queryByText(clinicalFixtureGoal.outcome)).not.toBeInTheDocument();
  expect(onStatusChange).toHaveBeenLastCalledWith("pending");
});

it("retries loading follow-up without leaving the step", async () => {
  api.objective.mockRejectedValueOnce(new Error("network"));
  renderFollowup();
  await screen.findByText("No pudimos cargar los acuerdos de esta consulta.");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("heading", { name: "Qué revisarán" })).toBeVisible();
});
