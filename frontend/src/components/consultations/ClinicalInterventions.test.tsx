import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalInterventions } from "./ClinicalInterventions";
import {
  emptyStrategy,
  type StrategyDocument,
} from "../../../../supabase/functions/_shared/interventions";
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
const document = (): StrategyDocument => ({
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
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
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

const fullDocument = (): StrategyDocument => ({
  ...document(),
  strategy: {
    ...emptyStrategy(),
    title: "Sesión para organizar comidas",
    action: "Practicar opciones con la persona",
    etiologyLink: "Aborda la falta de orientación",
    method: "Ejercicio con ejemplos habituales",
    frequency: "Una sesión",
    duration: "Durante la consulta",
    startDate: "En esta consulta",
    responsible: "Nutriólogo",
    executor: "Nutriólogo y paciente",
    adaptations: "Usar recursos disponibles",
    monitoring: "Comprobar opciones explicadas",
    reviewAt: "Próxima consulta",
    adjustmentCriteria: "Si aparecen nuevas barreras",
    educationTopic: "Organización de comidas",
    materials: "Ejemplos",
    comprehensionCheck: "Explicar una opción",
    goalIndexes: [0],
    agreement: "patient" as const,
  },
});
function approvedItem(doc = fullDocument()) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    draft: null,
    approved: {
      document: doc,
      version: 1,
      approvedAt: "2026-10-20",
      goals: [],
    },
    version: 1,
    updated_at: "current",
    state: "approved",
    requiresReview: false,
    execution: {},
    history: [],
  };
}
function mount(overrides = {}) {
  return render(
    <ClinicalInterventions
      consultationId="c"
      patientId="p"
      revision={1}
      before={api.before}
      {...overrides}
    />,
  );
}
it("opens a manual strategy in steps and preserves edits when the dialog closes", async () => {
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar estrategia manualmente" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Nombre de la estrategia"), {
    target: { value: "Coordinar la atención" },
  });
  fireEvent.change(within(dialog).getByLabelText("Categoría"), {
    target: { value: "coordination" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /^Recursos/ }));
  expect(
    within(dialog).getByLabelText(
      "Profesional o servicio con quien se coordina",
    ),
  ).toBeVisible();
  expect(within(dialog).queryByLabelText("Tema o habilidad que se trabajará"))
    .not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Motivo de la coordinación"), {
    target: { value: "Revisar la atención conjunta" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Cerrar revisión de la estrategia",
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Nombre de la estrategia")).not
    .toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Revisar estrategia: Coordinar la atención",
    }),
  );
  expect(screen.getByLabelText("Nombre de la estrategia")).toHaveValue(
    "Coordinar la atención",
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "save",
    expect.objectContaining({
      document: expect.objectContaining({
        strategy: expect.objectContaining({
          title: "Coordinar la atención",
          category: "coordination",
          coordinationReason: "Revisar la atención conjunta",
        }),
      }),
    }),
  );
});
it("keeps the draft editor open when saving the consultation fails", async () => {
  mount();
  await waitFor(() => expect(api.workspace).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: "Agregar estrategia manualmente" }),
  );
  fireEvent.change(screen.getByLabelText("Nombre de la estrategia"), {
    target: { value: "Conservar este borrador" },
  });
  api.before.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await within(screen.getByRole("dialog")).findByText(
    "Guarda la consulta antes de continuar.",
  );
  expect(screen.getByLabelText("Nombre de la estrategia")).toHaveValue(
    "Conservar este borrador",
  );
  expect(sessionStorage.getItem("intervention-drafts:c:1")).toContain(
    "Conservar este borrador",
  );
  expect(api.workspace).toHaveBeenCalledOnce();
});
it("requires explicit agreement before approving an AI strategy and never starts execution automatically", async () => {
  const doc = fullDocument();
  doc.strategy.agreement = "pending";
  await generate({ strategies: [doc] });
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar y editar estrategia" }),
  );
  expect(screen.queryByRole("button", { name: "Revisar y editar estrategia" }))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Acuerdo/ }));
  expect(screen.getByRole("button", { name: "Aprobar estrategia" }))
    .toBeDisabled();
  fireEvent.change(screen.getByLabelText("Acuerdo con la persona"), {
    target: { value: "patient" },
  });
  expect(screen.getByRole("button", { name: "Aprobar estrategia" }))
    .toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Aprobar estrategia" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "approve",
    expect.objectContaining({
      document: expect.objectContaining({
        strategy: expect.objectContaining({ agreement: "patient" }),
      }),
    }),
  );
  expect(api.workspace.mock.calls.some((call) => call[2] === "start")).toBe(
    false,
  );
  expect(api.generate).toHaveBeenCalledOnce();
});
it("blocks approval when the strategy is linked to earlier objective approvals", async () => {
  const doc = fullDocument();
  doc.objectiveApprovedAt = "previous";
  api.workspace.mockResolvedValue({
    ...workspace,
    items: [{
      ...approvedItem(doc),
      approved: null,
      draft: doc,
      state: "draft",
    }],
  });
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: `Revisar estrategia: ${doc.strategy.title}`,
    }),
  );
  expect(
    screen.getByRole("button", { name: "Vincular a los objetivos actuales" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /^Acuerdo/ }));
  expect(screen.getByRole("button", { name: "Aprobar estrategia" }))
    .toBeDisabled();
  expect(api.workspace).toHaveBeenCalledOnce();
});
it("allows reviewing an approved strategy without creating a draft or changing its approval", async () => {
  const item = approvedItem();
  api.workspace.mockResolvedValue({ ...workspace, items: [item] });
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: `Revisar estrategia: ${item.approved.document.strategy.title}`,
    }),
  );
  expect(screen.getByLabelText("Nombre de la estrategia")).toHaveValue(
    item.approved.document.strategy.title,
  );
  fireEvent.click(screen.getByRole("button", { name: "Listo" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(sessionStorage.getItem("intervention-drafts:c:1")).toBeNull();
  expect(api.workspace).toHaveBeenCalledOnce();
  expect(screen.getByText("Aprobada")).toBeVisible();
});
it("keeps execution registration explicit and available after approval", async () => {
  const item = approvedItem();
  api.workspace.mockImplementation(async (_c, _r, action = "read", data) => ({
    ...workspace,
    items: action === "start"
      ? [{
        ...item,
        state: "executing",
        execution: { startDate: data.startDate, executor: data.executor },
      }]
      : [item],
  }));
  mount();
  await screen.findByText("Aprobada");
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  fireEvent.click(screen.getByRole("button", { name: "Registrar inicio" }));
  fireEvent.change(screen.getByLabelText("Fecha de inicio"), {
    target: { value: "2026-10-20" },
  });
  fireEvent.change(screen.getByLabelText("Responsable de ejecución"), {
    target: { value: "Profesional tratante" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Registrar" }),
  );
  await screen.findByText("En ejecución");
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "start",
    expect.objectContaining({
      executor: "Profesional tratante",
      startDate: "2026-10-20",
      expectedUpdatedAt: "current",
    }),
  );
});
it("keeps read-only strategies available for consultation without editing or execution controls", async () => {
  api.workspace.mockResolvedValue({ ...workspace, items: [approvedItem()] });
  mount({ readOnly: true });
  await screen.findByText("Aprobada");
  expect(screen.queryByRole("button", { name: /Revisar estrategia:/ })).not
    .toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Proponer estrategias con IA" }))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  expect(screen.queryByRole("button", { name: "Registrar inicio" })).not
    .toBeInTheDocument();
  fireEvent.click(screen.getByText(/Ver detalle de la estrategia/));
  expect(
    screen.getByText("Practicar opciones con la persona", { selector: "dd" }),
  ).toBeVisible();
});
