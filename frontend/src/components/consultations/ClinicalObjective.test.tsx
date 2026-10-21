import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalObjective } from "./ClinicalObjective";
import { composeObjective } from "../../../../supabase/functions/_shared/objectives";
import {
  approvedPes,
  objectiveWorkspace,
  smartPlan,
} from "@/src/test/clinicalFixtures";
const api = vi.hoisted(() => ({
  review: vi.fn(),
  before: vi.fn(),
  generate: vi.fn(),
  changed: vi.fn(),
  pending: vi.fn(),
}));
vi.mock(
  "@/src/services/clinicalCopilot",
  () => ({ clinicalObjective: api.review }),
);
vi.mock(
  "@/src/services/ai",
  async (original) => ({
    ...(await original<object>()),
    runAIRequest: api.generate,
  }),
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
const props = {
  consultationId: "c",
  patientId: "p",
  revision: 1,
  questionKey: "treatment_objective",
  before: api.before,
};
function Subject({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ClinicalObjective
      {...props}
      value={value}
      onPendingChange={api.pending}
      onChangeText={(text, texts) => {
        api.changed(text, texts);
        setValue(text);
      }}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.review.mockResolvedValue(objectiveWorkspace());
  api.before.mockResolvedValue(true);
});
async function mountSaved(approved = false) {
  const plan = smartPlan();
  api.review.mockResolvedValue(objectiveWorkspace(plan, approved));
  const view = render(<Subject initial={composeObjective(plan.goals[0])} />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  return { ...view, plan };
}
it("restores approval from JSONB regardless of object property order", async () => {
  const plan = smartPlan();
  const reorder = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
      ? Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map((
          [key, item],
        ) => [key, reorder(item)]),
      )
      : value;
  api.review.mockResolvedValue(reorder(objectiveWorkspace(plan, true)));
  render(<Subject initial={composeObjective(plan.goals[0])} />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  expect(screen.getByText("Aprobados")).toBeVisible();
  expect(screen.getByRole("button", { name: "Volver a revisar" }))
    .toBeEnabled();
  expect(api.review).toHaveBeenCalledExactlyOnceWith("c", 1);
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.click(screen.getByRole("button", { name: /^Meta/ }));
  fireEvent.change(
    screen.getByLabelText("Meta o criterio de logro · objetivo 1"),
    {
      target: { value: "Meta profesional revisada" },
    },
  );
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
  expect(screen.getByText("Borrador por revisar")).toBeVisible();
});
it('restores an approved two-goal follow-up plan even if a stale working-copy dirty flag remains',async()=>{
  const plan=smartPlan();plan.goals.push({...plan.goals[0],outcome:'Revisar tus señales de hambre'});
  const key='next_objectives';
  const rows=plan.goals.map(goal=>({objetivo:composeObjective(goal),prioridad:'Principal'}));
  const server={...objectiveWorkspace(plan,true),plans:{[key]:plan}};
  server.objective={...server.objective!,question_key:key,value:rows.map(row=>({prioridad:row.prioridad,objetivo:row.objetivo}))};
  api.review.mockResolvedValue(server);
  sessionStorage.setItem(`objective-draft:c:1:${key}`,JSON.stringify(plan));
  const renderSubject=()=>render(<ClinicalObjective {...props} questionKey={key} value={rows}/>);
  const first=renderSubject();
  await screen.findByText('Aprobados');
  expect(screen.getAllByText('Aprobado')).toHaveLength(2);
  expect(screen.getByRole('button',{name:'Aprobar objetivos'})).toBeDisabled();
  expect(screen.queryByText('Qué falta para aprobar')).not.toBeInTheDocument();
  first.unmount();renderSubject();await screen.findByText('Aprobados');
  expect(screen.queryByText('Listo para aprobar')).not.toBeInTheDocument();
});
it('preserves the full plan and editable text when objective approval fails',async()=>{
  const {plan}=await mountSaved();
  api.review.mockResolvedValueOnce(objectiveWorkspace(plan)).mockRejectedValueOnce(new Error('No se pudo registrar la aprobación.'));
  fireEvent.click(screen.getByRole('button',{name:'Aprobar objetivos'}));
  await screen.findByText('No se pudo registrar la aprobación.');
  expect(screen.queryByText('Aprobados')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Revisar objetivo 1'}));
  expect(screen.getByLabelText('Resultado esperado · objetivo 1')).toHaveValue(plan.goals[0].outcome);
  expect(screen.getByRole('button',{name:'Aprobar objetivos'})).toBeEnabled();
});
it("shows approved PES and assessment evidence without generating or approving automatically", async () => {
  render(<Subject />);
  await screen.findByText("PES aprobado");
  expect(api.review).toHaveBeenCalledExactlyOnceWith("c", 1);
  expect(screen.getByText("Pendientes de revisión")).toBeVisible();
  fireEvent.click(screen.getByText("PES aprobado"));
  expect(screen.getByText(approvedPes.etiology)).toBeVisible();
  fireEvent.click(
    screen.getByText("Consultar datos de valoración registrados"),
  );
  expect(screen.getByText("Horario laboral variable")).toBeVisible();
  expect(screen.queryByText(/2100 kcal/)).not.toBeInTheDocument();
  expect(api.generate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Aprobar objetivos" }))
    .not.toBeInTheDocument();
});
it("saves the interview, refreshes the stamp and approves the full plan without calorie prescriptions", async () => {
  const { plan } = await mountSaved();
  api.review.mockResolvedValueOnce({
    ...objectiveWorkspace(plan),
    stamp: "fresh",
  }).mockResolvedValueOnce(objectiveWorkspace(plan, true));
  fireEvent.click(screen.getByRole("button", { name: "Aprobar objetivos" }));
  await screen.findByText("Objetivos aprobados para seguimiento.");
  expect(api.review).toHaveBeenLastCalledWith(
    "c",
    1,
    "approve",
    "fresh",
    "treatment_objective",
    plan,
  );
  expect(api.before).toHaveBeenCalledOnce();
  expect(api.before.mock.invocationCallOrder[0]).toBeLessThan(
    api.review.mock.invocationCallOrder[1],
  );
  expect(api.review.mock.invocationCallOrder[1]).toBeLessThan(
    api.review.mock.invocationCallOrder[2],
  );
  expect(screen.getByText("Aprobados")).toBeVisible();
  expect(api.pending).toHaveBeenLastCalledWith(false);
});
it("allows a manual draft without PES while blocking approval and AI", async () => {
  api.review.mockResolvedValue({ ...objectiveWorkspace(), pes: null });
  render(<Subject />);
  await screen.findByText(/Puedes redactar y guardar un borrador/);
  expect(screen.getByRole("button", { name: "Proponer objetivos con IA" }))
    .toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  fireEvent.change(screen.getByLabelText("Resultado esperado · objetivo 1"), {
    target: { value: "Conversar sobre horarios" },
  });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await screen.findByText(
    "Borrador guardado. Puedes continuar y revisarlo después.",
  );
  expect(api.review).toHaveBeenLastCalledWith(
    "c",
    1,
    "save",
    "current",
    "treatment_objective",
    expect.objectContaining({
      goals: [
        expect.objectContaining({
          outcome: "Conversar sobre horarios",
          agreement: "pending",
        }),
      ],
    }),
  );
  expect(api.generate).not.toHaveBeenCalled();
});
it("marks an edited approved objective as an unsaved draft", async () => {
  await mountSaved(true);
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  expect(screen.getByText("Aprobados")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Resultado esperado · objetivo 1"), {
    target: { value: "Resultado revisado" },
  });
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
  expect(screen.getByText("Borrador por revisar")).toBeVisible();
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  expect(api.pending).toHaveBeenLastCalledWith(true);
  expect(api.review).toHaveBeenCalledOnce();
});
it("does not approve when saving the interview fails", async () => {
  await mountSaved();
  api.before.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Aprobar objetivos" }));
  await screen.findByText(/Guarda la entrevista antes de continuar/);
  expect(api.review).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
});
it("revokes approval while preserving the editable plan and PES", async () => {
  const { plan } = await mountSaved(true);
  api.review.mockResolvedValueOnce(objectiveWorkspace(plan, true))
    .mockResolvedValueOnce(objectiveWorkspace(plan));
  fireEvent.click(screen.getByRole("button", { name: "Volver a revisar" }));
  await screen.findByText("Objetivos pendientes de revisión.");
  expect(api.review).toHaveBeenLastCalledWith(
    "c",
    1,
    "revoke",
    "current",
    "treatment_objective",
    undefined,
  );
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  expect(screen.getByLabelText("Resultado esperado · objetivo 1")).toHaveValue(
    plan.goals[0].outcome,
  );
  fireEvent.click(screen.getByText("PES aprobado"));
  expect(screen.getByText(approvedPes.etiology, { selector: "dd" }))
    .toBeVisible();
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
});
it("requires patient agreement while permitting an incomplete draft to be saved", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.click(screen.getByRole("button", { name: /^Acuerdo/ }));
  fireEvent.change(screen.getByLabelText("Acuerdo · objetivo 1"), {
    target: { value: "pending" },
  });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  expect(screen.getByRole("button", { name: "Guardar borrador" }))
    .toBeEnabled();
  fireEvent.change(screen.getByLabelText("Acuerdo · objetivo 1"), {
    target: { value: "caregiver" },
  });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
});
it("rejects approval if PES changes during the save", async () => {
  const { plan } = await mountSaved();
  api.review.mockResolvedValueOnce({
    ...objectiveWorkspace(plan),
    pes: { ...approvedPes, approved_at: "2026-10-18T13:00:00Z" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Aprobar objetivos" }));
  await screen.findByText(/El PES cambió. Vincula los objetivos al PES actual/);
  expect(api.review.mock.calls.every((call) => call.length === 2)).toBe(true);
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  expect(screen.getByRole("button", { name: "Vincular al PES actual" }))
    .toBeEnabled();
});
it("blocks approval when the selected sign is no longer in the approved PES", async () => {
  const plan = smartPlan();
  plan.goals[0].sign = "Signo anterior";
  api.review.mockResolvedValue(objectiveWorkspace(plan));
  render(<Subject />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.change(
    screen.getByLabelText("Signo o síntoma del PES · objetivo 1"),
    { target: { value: approvedPes.signsSymptoms } },
  );
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
});
it("recovers an unsaved plan and restores its canonical interview text", async () => {
  const plan = smartPlan();
  sessionStorage.setItem(
    "objective-draft:c:1:treatment_objective",
    JSON.stringify(plan),
  );
  render(<Subject />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  expect(screen.getByText("Borrador por revisar")).toBeVisible();
  expect(api.changed).toHaveBeenCalledWith(composeObjective(plan.goals[0]), [
    composeObjective(plan.goals[0]),
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(/Borrador guardado/);
  expect(sessionStorage.getItem("objective-draft:c:1:treatment_objective"))
    .toBeNull();
});
it("limits the plan to three goals and preserves explicit priority changes", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  fireEvent.change(screen.getByLabelText("Resultado esperado · objetivo 2"), {
    target: { value: "Segunda prioridad" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Cerrar revisión del objetivo" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Cerrar revisión del objetivo" }),
  );
  expect(screen.getByRole("button", { name: "Agregar objetivo" }))
    .toBeDisabled();
  expect(screen.getByRole("button", { name: "Proponer objetivos con IA" }))
    .toBeDisabled();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Objetivo 2" })).getByRole(
      "button",
      { name: "Subir prioridad" },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  expect(screen.getByLabelText("Resultado esperado · objetivo 1")).toHaveValue(
    "Segunda prioridad",
  );
  fireEvent.click(screen.getByRole("button", { name: "Quitar objetivo 3" }));
  expect(screen.getByRole("button", { name: "Agregar objetivo" }))
    .toBeEnabled();
});
it("adds a structured AI proposal for review and requires the professional to record agreement", async () => {
  const goal = smartPlan().goals[0];
  api.generate.mockResolvedValue({
    status: "succeeded",
    output: {
      objectives: [{
        goal,
        evidence: [{
          source: "PES actual aprobado · Etiología",
          finding: approvedPes.etiology,
        }],
      }],
    },
  });
  render(<Subject />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Proponer objetivos con IA" }))
      .toBeEnabled()
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer objetivos con IA" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Agregar y revisar" }),
  );
  expect(screen.getByLabelText("Resultado esperado · objetivo 1")).toHaveValue(
    goal.outcome,
  );
  expect(screen.getByLabelText("Acuerdo · objetivo 1")).toHaveValue("pending");
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  expect(api.review).toHaveBeenCalledOnce();
  expect(api.generate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      feature: "consultation_support",
      patientId: "p",
      consultationId: "c",
      revision: 1,
    }),
  );
  expect(api.before.mock.invocationCallOrder[0]).toBeLessThan(
    api.generate.mock.invocationCallOrder[0],
  );
  fireEvent.change(screen.getByLabelText("Acuerdo · objetivo 1"), {
    target: { value: "patient" },
  });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
});

it("keeps a compact list and preserves edits while reviewing one step at a time", async () => {
  await mountSaved();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Resultado esperado · objetivo 1")).not
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Resultado esperado · objetivo 1"))
    .toBeVisible();
  expect(within(dialog).getByLabelText("Meta o criterio de logro · objetivo 1"))
    .not.toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: /^Meta/ }));
  fireEvent.change(
    within(dialog).getByLabelText("Meta o criterio de logro · objetivo 1"),
    { target: { value: "" } },
  );
  expect(within(dialog).getByRole("progressbar")).toHaveAttribute("value", "9");
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Cerrar revisión del objetivo",
    }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Ir al siguiente pendiente" }),
  );
  expect(screen.getByLabelText("Meta o criterio de logro · objetivo 1"))
    .toBeVisible();
  expect(screen.getByLabelText("Meta o criterio de logro · objetivo 1"))
    .toHaveValue("");
  fireEvent.change(
    screen.getByLabelText("Meta o criterio de logro · objetivo 1"),
    { target: { value: "Meta revisada con la persona" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  expect(api.review).toHaveBeenLastCalledWith(
    "c",
    1,
    "save",
    "current",
    "treatment_objective",
    expect.objectContaining({
      goals: [
        expect.objectContaining({ target: "Meta revisada con la persona" }),
      ],
    }),
  );
});

it("keeps the editor and its draft when saving fails", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.change(screen.getByLabelText("Resultado esperado · objetivo 1"), {
    target: { value: "Resultado revisado" },
  });
  api.before.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Guardar y cerrar" }));
  await within(screen.getByRole("dialog")).findByText(
    "Guarda la entrevista antes de continuar.",
  );
  expect(screen.getByLabelText("Resultado esperado · objetivo 1")).toHaveValue(
    "Resultado revisado",
  );
  expect(sessionStorage.getItem("objective-draft:c:1:treatment_objective"))
    .toContain("Resultado revisado");
  expect(api.review).toHaveBeenCalledOnce();
});

it("can save the removal of the last objective without leaving an unsavable draft", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Quitar objetivo 1" }));
  expect(screen.getByRole("button", { name: "Guardar borrador" }))
    .toBeEnabled();
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(/Borrador guardado/);
  expect(api.review).toHaveBeenLastCalledWith(
    "c",
    1,
    "save",
    "current",
    "treatment_objective",
    expect.objectContaining({ goals: [] }),
  );
});
