import { useState } from "react";
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
it("reviews an approved agreement in a modal and closes it when marked, without changing clinical approval", async () => {
  const onReady = vi.fn();
  render(
    <ClinicalFollowUp
      consultationId="c"
      revision={1}
      active
      onReady={onReady}
    />,
  );
  fireEvent.click(
    (await screen.findAllByRole("button", { name: /Revisar seguimiento:/ }))[0],
  );
  expect(screen.getByText(clinicalFixtureGoal.monitoring)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("1 de 2 revisados")).toBeVisible();
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
  const onReady = vi.fn();
  render(
    <ClinicalFollowUp
      consultationId="c"
      revision={1}
      active
      onReady={onReady}
    />,
  );
  expect(await screen.findByText(/Aprueba un objetivo/)).toBeVisible();
  expect(screen.queryByText(clinicalFixtureGoal.outcome)).not
    .toBeInTheDocument();
  expect(onReady).toHaveBeenLastCalledWith(false, expect.any(String));
});
it("retries loading follow-up without leaving the step", async () => {
  api.objective.mockRejectedValueOnce(new Error("network"));
  render(
    <ClinicalFollowUp
      consultationId="c"
      revision={1}
      active
      onReady={vi.fn()}
    />,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText(clinicalFixtureGoal.outcome)).toBeVisible();
});
