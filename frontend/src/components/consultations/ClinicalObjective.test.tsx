import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClinicalObjective } from "./ClinicalObjective";
const api = vi.hoisted(() => ({ review: vi.fn(), before: vi.fn() }));
vi.mock("@/src/services/clinicalCopilot", () => ({
  clinicalObjective: api.review,
}));
const w = {
  stamp: "current",
  facts: [{ source: "Motivo", finding: "Mejorar hábitos" }],
  pes: {
    pesStatement: "Enunciado revisado por el profesional",
    approved_at: "today",
  },
  objective: null,
  target: { energy_kcal: 2100 },
};
const props = {
  consultationId: "c",
  revision: 1,
  questionKey: "treatment_objective",
  value: "Acordar horarios",
  before: api.before,
};
beforeEach(() => {
  vi.clearAllMocks();
  api.review.mockResolvedValue(w);
  api.before.mockResolvedValue(true);
});
afterEach(cleanup);
it("shows approved PES and context without another AI request or automatic approval", async () => {
  render(<ClinicalObjective {...props} />);
  await screen.findByText("PES aprobado");
  expect(api.review).toHaveBeenCalledTimes(1);
  expect(api.review).toHaveBeenCalledWith("c", 1);
  expect(screen.getByText("Pendiente de revisión")).toBeTruthy();
  expect(screen.getByText(/2100 kcal/)).toBeTruthy();
});
it("approval saves interview first and sends only reference/stamp, never calories", async () => {
  render(<ClinicalObjective {...props} />);
  await screen.findByText("PES aprobado");
  fireEvent.click(screen.getByText("Aprobar objetivo"));
  await waitFor(() =>
    expect(api.review).toHaveBeenCalledWith(
      "c",
      1,
      "approve",
      "current",
      "treatment_objective",
    ),
  );
  expect(api.before).toHaveBeenCalledOnce();
  expect(api.before.mock.invocationCallOrder[0]).toBeLessThan(
    api.review.mock.invocationCallOrder[1],
  );
});
it("incomplete case keeps manual writing possible but cannot approve without PES", async () => {
  api.review.mockResolvedValue({ ...w, pes: null });
  render(<ClinicalObjective {...props} />);
  await screen.findByText(/Puedes redactar/);
  expect(screen.getByText("Aprobar objetivo")).toBeDisabled();
});
it("edited objective is not labelled approved", async () => {
  api.review.mockResolvedValue({
    ...w,
    objective: { question_key: props.questionKey, value: "Texto anterior" },
  });
  render(<ClinicalObjective {...props} />);
  await screen.findByText("PES aprobado");
  expect(screen.getByText("Pendiente de revisión")).toBeTruthy();
  expect(screen.getByText("Aprobar objetivo")).not.toBeDisabled();
});
it("failed save cannot approve", async () => {
  api.before.mockResolvedValue(false);
  render(<ClinicalObjective {...props} />);
  await screen.findByText("PES aprobado");
  fireEvent.click(screen.getByText("Aprobar objetivo"));
  await screen.findByText(/Guarda la entrevista/);
  expect(api.review).toHaveBeenCalledTimes(1);
});
it("revoke leaves the text to be edited and never updates PES", async () => {
  api.review.mockResolvedValue({
    ...w,
    objective: { question_key: props.questionKey, value: props.value },
  });
  render(<ClinicalObjective {...props} />);
  fireEvent.click(await screen.findByText("Volver a revisar"));
  await waitFor(() =>
    expect(api.review).toHaveBeenCalledWith(
      "c",
      1,
      "revoke",
      "current",
      props.questionKey,
    ),
  );
});
