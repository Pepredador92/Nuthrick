import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalInterventions } from "./ClinicalInterventions";
import { emptyStrategy } from "../../../../supabase/functions/_shared/interventions";
const api = vi.hoisted(() => ({
  workspace: vi.fn(),
  generate: vi.fn(),
  before: vi.fn(),
}));
vi.mock(
  "@/src/services/clinicalInterventions",
  () => ({ clinicalInterventions: api.workspace }),
);
vi.mock(
  "@/src/features/admin/AccessProvider",
  () => ({
    useAccess: () => ({
      data: {
        access: { allowed: true, values: { "ai.consultation_support": true } },
      },
    }),
  }),
);
vi.mock(
  "@/src/services/ai",
  () => ({
    runAIRequest: api.generate,
    getAIGenerationStatus: vi.fn(),
    AIRequestError: class extends Error {},
    aiMessages: {},
  }),
);
const pes = {
  approved_at: "2026-10-18T12:00:00Z",
  pesStatement: "PES sintético",
};
const workspace = {
  stamp: "synthetic",
  pes,
  objective: {
    approved_at: "2026-10-18T12:10:00Z",
    pes_statement: pes.pesStatement,
    smart_plan: { goals: [] },
  },
  items: [],
  facts: [],
};
const document = () => ({
  version: 1,
  pesApprovedAt: pes.approved_at,
  objectiveApprovedAt: workspace.objective.approved_at,
  generationId: "11111111-1111-4111-8111-111111111111",
  strategy: {
    ...emptyStrategy(),
    title: "Educación nutricional",
    action: "Practicar registro",
    evidence: Array.from(
      { length: 9 },
      (_, i) => ({
        source: `Objetivo aprobado · 1 · Componente ${i + 1}`,
        finding: String.fromCharCode(97 + i).repeat(2000),
      }),
    ),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.before.mockResolvedValue(true);
  api.workspace.mockResolvedValue(workspace);
});
async function generate(output: unknown) {
  api.generate.mockResolvedValue({ status: "succeeded", output });
  render(
    <ClinicalInterventions
      consultationId="c"
      patientId="p"
      revision={1}
      before={api.before}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Proponer estrategias con IA" }))
      .toBeEnabled()
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer estrategias con IA" }),
  );
}
it("keeps a long objective proposal visible and sends all evidence when saving its edited draft", async () => {
  const doc = document();
  await generate({ strategies: [doc] });
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar y editar estrategia" }),
  );
  fireEvent.change(screen.getByLabelText("Nombre de la estrategia"), {
    target: { value: "Educación adaptada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() =>
    expect(api.workspace).toHaveBeenCalledWith(
      "c",
      1,
      "save",
      expect.objectContaining({
        document: expect.objectContaining({
          strategy: expect.objectContaining({
            title: "Educación adaptada",
            evidence: doc.strategy.evidence,
          }),
        }),
      }),
    )
  );
});
it.each([
  ["missing collection", {}],
  ["null collection", { strategies: null }],
  ["wrong collection", { strategies: {} }],
  ["unusable evidence", {
    strategies: [{
      ...document(),
      strategy: {
        ...document().strategy,
        evidence: [{
          source: "Objetivo aprobado · 1",
          finding: "x".repeat(4001),
        }],
      },
    }],
  }],
  ["mixed documents", { strategies: [document(), {}] }],
  ["oversized collection", {
    strategies: [document(), document(), document(), document()],
  }],
])(
  "explains incompatible AI output instead of silently dropping it: %s",
  async (_name, output) => {
    await generate(output);
    await screen.findByText(
      /La propuesta de IA llegó incompleta o con datos incompatibles/,
    );
    expect(screen.queryByText(/No hubo información suficiente/)).not
      .toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revisar y editar estrategia" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Agregar estrategia manualmente" }),
    ).toBeEnabled();
  },
);
it("keeps a valid empty proposal distinct from an incompatible response", async () => {
  await generate({ strategies: [] });
  await screen.findByText(/No hubo información suficiente para proponer/);
  expect(screen.queryByText(/datos incompatibles/)).not.toBeInTheDocument();
});
