import { createRef, useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalObjective } from "./ClinicalObjective";
import { formatObjectiveEditorText, readObjectiveEditorText, type ObjectiveEditorField } from "@/src/features/consultations/objectiveEditorText";
import { ConsultationDrafts, type ConsultationDraftController } from "./ConsultationDrafts";
import { composeObjective, emptyObjective } from "../../../../supabase/functions/_shared/objectives";
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
  sync: vi.fn(),
}));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc: api.sync } }));
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
function Subject({ initial = "", reviewBatch = false }: { initial?: string; reviewBatch?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <ClinicalObjective
      {...props}
      value={value}
      reviewBatch={reviewBatch}
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
function objectiveText(index = 1) {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: `Texto del objetivo ${index}` });
}
function editObjective(field: ObjectiveEditorField, value: string, index = 1) {
  const input = objectiveText(index);
  const parsed = readObjectiveEditorText(input.value);
  if (!("fields" in parsed)) throw new Error(parsed.issue);
  fireEvent.change(input, { target: { value: formatObjectiveEditorText({ ...emptyObjective(), ...parsed.fields, [field]: value }) } });
}
async function requestApproval() {
  fireEvent.click(screen.getByRole("button", { name: "Aprobar objetivos" }));
  return within(await screen.findByRole('dialog', { name: '¿Aprobar estos objetivos?' }));
}
async function mountSaved(approved = false) {
  const plan = smartPlan();
  api.review.mockResolvedValue(objectiveWorkspace(plan, approved));
  const view = render(<Subject initial={composeObjective(plan.goals[0])} />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  return { ...view, plan };
}

function mountWithNewBatch(approved = false, stale = false) {
  const plan = smartPlan();
  const newer = { ...plan.goals[0], outcome: "Deja lista una opción para tu jornada." };
  const goals = stale ? [newer, { ...newer, outcome: "Planea dos opciones rápidas." },
    { ...newer, outcome: "Registra los días que hiciste ejercicio." }] : [newer];
  const saved = { version: 1, answers: {
    "clinical-batch": { id: "batch-new", completed: { pes_diagnosis: "pes-new", consultation_support: "objective-new" } },
    "batch-reviewed:consultation_support": "objective-old",
    "proposal:batch:consultation_support": {
      batchId: "batch-new", generationId: "objective-new", inputGenerations: [stale ? "pes-old" : "pes-new"],
      output: { pesProblem: approvedPes.problem, ...(stale ? { batchBasis: "assessment" } : {}), objectives: goals.map(goal => ({
        goal, evidence: [{ source: "Nota de la consulta", finding: "Busca una opción práctica para el trabajo." }],
      })) },
    },
  } as Record<string, unknown> };
  api.review.mockResolvedValue(objectiveWorkspace(plan, approved));
  api.sync.mockImplementation((_name, input) => {
    if (input.p_changes) {
      Object.assign(saved.answers, input.p_changes);
      saved.version++;
    }
    const response = Promise.resolve({ data: structuredClone(saved) });
    return Object.assign(response, { abortSignal: () => response });
  });
  const controller = createRef<ConsultationDraftController | null>();
  render(<ConsultationDrafts consultationId="c" revision={1} onSave={api.before} controllerRef={controller}>
    <Subject initial={composeObjective(plan.goals[0])} reviewBatch />
  </ConsultationDrafts>);
  return { newer, plan };
}

it("compares a regenerated proposal with the saved draft and replaces it only after confirmation", async () => {
  const { newer, plan } = mountWithNewBatch();
  const preview = await screen.findByRole("button", { name: "Ver propuesta de IA" });
  const previous = screen.getByText(plan.goals[0].outcome, { selector: ".smart-objective-name" });
  expect(previous).toBeVisible();
  expect(screen.queryByText(newer.outcome)).not.toBeInTheDocument();
  expect(api.changed).not.toHaveBeenCalled();

  fireEvent.click(preview);
  let comparison = within(screen.getByRole("dialog", { name: "Revisar propuesta de objetivos" }));
  expect(comparison.getByText(newer.outcome)).toBeVisible();
  expect(comparison.getByText(composeObjective(plan.goals[0]))).toBeVisible();
  fireEvent.click(comparison.getByRole("button", { name: "Conservar objetivos actuales" }));
  expect(previous).toBeVisible();
  expect(api.changed).not.toHaveBeenCalled();

  fireEvent.click(preview);
  comparison = within(screen.getByRole("dialog", { name: "Revisar propuesta de objetivos" }));
  fireEvent.click(comparison.getByRole("button", { name: "Usar como borrador" }));
  expect(screen.queryByText(plan.goals[0].outcome, { selector: ".smart-objective-name" })).not.toBeInTheDocument();
  expect(objectiveText().value).toContain(newer.outcome);
  expect(api.changed).toHaveBeenLastCalledWith(composeObjective(newer), [composeObjective(newer)]);
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() => expect(api.review).toHaveBeenCalledWith("c", 1, "save", "current", props.questionKey,
    expect.objectContaining({ goals: [expect.objectContaining({ outcome: newer.outcome, agreement: "pending" })] })));
  expect(api.generate).not.toHaveBeenCalled();
});

it("keeps an approved plan intact when opening and closing the comparison", async () => {
  const { newer, plan } = mountWithNewBatch(true);
  await screen.findByText("Aprobados");
  fireEvent.click(await screen.findByRole("button", { name: "Ver propuesta de IA" }));
  const modal = within(screen.getByRole("dialog", { name: "Revisar propuesta de objetivos" }));
  expect(modal.getByText(newer.outcome)).toBeVisible();
  expect(modal.getByText(/nueva versión quedará pendiente de aprobación/)).toBeVisible();
  fireEvent.click(modal.getByRole("button", { name: "Conservar objetivos actuales" }));
  expect(objectiveText()).toHaveValue(formatObjectiveEditorText(plan.goals[0]));
  expect(screen.getByText("Aprobados")).toBeVisible();
  expect(api.changed).not.toHaveBeenCalled();
});

it("moves all three stale assessment proposals into the SMART editor without charging again", async () => {
  mountWithNewBatch(false, true);
  fireEvent.click(await screen.findByRole("button", { name: "Ver propuesta de IA" }));
  const modal = within(screen.getByRole("dialog", { name: "Revisar propuesta de objetivos" }));
  fireEvent.click(modal.getByRole("button", { name: "Usar como borrador" }));
  expect(screen.queryByRole("button", { name: "Agregar y revisar" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^Revisar objetivo [1-3]$/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 3" }));
  expect(objectiveText(3).value).toContain("Registra los días que hiciste ejercicio.");
  expect(screen.getByLabelText("Acuerdo · objetivo 3")).toHaveValue("pending");
  expect(screen.getByRole("button", { name: "Aprobar objetivos" })).toBeEnabled();
  expect(api.generate).not.toHaveBeenCalled();
});

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
  expect(objectiveText()).toHaveValue(formatObjectiveEditorText(plan.goals[0]));
  expect(screen.getByRole("button", { name: "Volver a revisar" }))
    .toBeEnabled();
  expect(api.review).toHaveBeenCalledExactlyOnceWith("c", 1);
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  editObjective("target", "Meta profesional revisada");
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
  expect(screen.getByText(/^(En revisión|Listos para aprobar)$/)).toBeVisible();
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
  expect(screen.queryByRole('button',{name:'Aprobar objetivos'})).not.toBeInTheDocument();
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
  expect(objectiveText().value).toContain(plan.goals[0].outcome);
  expect(screen.getByRole('button',{name:'Aprobar objetivos'})).toBeEnabled();
});
it("shows assessment data once, without triggering automatic generation or approval", async () => {
  render(<Subject />);
  await screen.findByText("Datos de valoración registrados");
  expect(api.review).toHaveBeenCalledExactlyOnceWith("c", 1);
  expect(screen.getByRole("button", { name: "Agregar objetivo" })).toBeVisible();
  fireEvent.click(screen.getByText("Datos de valoración registrados"));
  expect(screen.queryByText("PES aprobado")).not.toBeInTheDocument();
  expect(screen.getByText("Horario laboral variable")).toBeVisible();
  expect(screen.queryByText(/2100 kcal/)).not.toBeInTheDocument();
  expect(api.generate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Aprobar objetivos" })).toBeEnabled();
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
it("keeps AI, saving and approval available without PES", async () => {
  api.review.mockResolvedValue({ ...objectiveWorkspace(), pes: null });
  render(<Subject />);
  await screen.findByText("Datos de valoración registrados");
  expect(screen.getByRole("button", { name: "Proponer objetivos con IA" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  editObjective("outcome", "Conversar sobre horarios", 1);
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
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
  editObjective("outcome", "Resultado revisado", 1);
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
  expect(screen.getByText(/^(En revisión|Listos para aprobar)$/)).toBeVisible();
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
  expect(objectiveText().value).toContain(plan.goals[0].outcome);
  fireEvent.click(screen.getByText("Datos de valoración registrados"));
  expect(screen.getByText("Horario laboral variable")).toBeVisible();
  expect(screen.queryByText("Aprobados")).not.toBeInTheDocument();
});
it("approves an incomplete objective and keeps the patient agreement pending", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.change(screen.getByLabelText("Acuerdo · objetivo 1"), {
    target: { value: "pending" },
  });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  expect(screen.getByRole("button", { name: "Guardar borrador" }))
    .toBeEnabled();
  editObjective("timeframe", "");
  const modal = await requestApproval();
  fireEvent.click(modal.getByRole("button", { name: "Aprobar tal como están" }));
  await screen.findByText("Objetivos aprobados para seguimiento.");
  expect(api.review).toHaveBeenLastCalledWith("c", 1, "approve", "current", props.questionKey,
    expect.objectContaining({ goals: [expect.objectContaining({ agreement: "pending", timeframe: "" })] }));
});
it("rejects approval if PES changes during the save", async () => {
  const { plan } = await mountSaved();
  api.review.mockResolvedValueOnce({
    ...objectiveWorkspace(plan),
    pes: { ...approvedPes, approved_at: "2026-10-18T13:00:00Z" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Aprobar objetivos" }));
  await screen.findByText(/El diagnóstico cambió mientras se guardaba/);
  expect(api.review.mock.calls.every((call) => call.length === 2)).toBe(true);
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  expect((await requestApproval()).getByText(/La valoración cambió/)).toBeVisible();
});
it("offers an updated sign as an optional specification", async () => {
  const plan = smartPlan();
  plan.goals[0].sign = "Signo anterior";
  api.review.mockResolvedValue(objectiveWorkspace(plan));
  render(<Subject />);
  await screen.findByRole("button", { name: "Revisar objetivo 1" });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Completar especificaciones del objetivo 1" }));
  const modal = within(await screen.findByRole("dialog", { name: "Especificaciones del objetivo 1" }));
  fireEvent.change(modal.getByLabelText("Signo o síntoma a reevaluar"), { target: { value: approvedPes.signsSymptoms } });
  fireEvent.click(modal.getByRole("button", { name: "Guardar especificaciones" }));
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
  expect(screen.getByText(/^(En revisión|Listos para aprobar)$/)).toBeVisible();
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
  editObjective("outcome", "Segunda prioridad", 2);
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  expect(screen.queryByRole("button", { name: "Agregar objetivo" }))
    .not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Regenerar objetivos con IA" }))
    .toBeEnabled();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Objetivo 2" })).getByRole(
      "button",
      { name: "Subir prioridad" },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  expect(objectiveText().value).toContain("Segunda prioridad");
  fireEvent.click(screen.getByRole("button", { name: "Quitar objetivo 3" }));
  expect(screen.getByRole("button", { name: "Agregar objetivo" }))
    .toBeEnabled();
});
it("adds a structured AI proposal for review while leaving agreement to the professional", async () => {
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
  await screen.findByRole("textbox", { name: "Texto del objetivo 1" });
  expect(screen.queryByRole("button", { name: "Agregar y revisar" })).not.toBeInTheDocument();
  expect(objectiveText().value).toContain(goal.outcome);
  expect(screen.getByLabelText("Acuerdo · objetivo 1")).toHaveValue("pending");
  expect(screen.getByRole("button", { name: "Aprobar objetivos" }))
    .toBeEnabled();
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

it("saves all inline AI goals as a draft even before the professional edits one", async () => {
  const goals = ["Organiza tus comidas.", "Prepara dos opciones rápidas.", "Registra cuándo haces ejercicio."].map(outcome => ({
    ...smartPlan().goals[0], outcome, agreement: "pending" as const,
  }));
  api.generate.mockResolvedValue({
    generationId: "three-goals", status: "succeeded", output: { objectives: goals.map(goal => ({
      goal, evidence: [{ source: "Entrevista", finding: "Cambios conversados en consulta." }],
    })) },
  });
  render(<Subject />);
  const generate = screen.getByRole("button", { name: "Proponer objetivos con IA" });
  await waitFor(() => expect(generate).toBeEnabled());
  fireEvent.click(generate);
  await screen.findByRole("button", { name: "Revisar objetivo 3" });
  expect(api.changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(/Borrador guardado/);
  expect(api.changed).toHaveBeenLastCalledWith(goals.map(composeObjective).join("\n\n"), goals.map(composeObjective));
  expect(api.review).toHaveBeenLastCalledWith("c", 1, "save", "current", props.questionKey,
    expect.objectContaining({ goals, pesApprovedAt: approvedPes.approved_at }));
  expect(screen.queryByRole("button", { name: "Ver propuesta de IA" })).not.toBeInTheDocument();
});

it("keeps template guidance for unsupported AI fields and isolates it from saved goals", async () => {
  const original = smartPlan().goals[0];
  const goal = {
    ...original,
    textStyle: 'patient_v1',
    baseline: 'Revisa el punto de partida con el primer registro.',
    etiology: '',
    sign: '',
    feasibility: '',
  };
  api.generate.mockResolvedValue({ status: 'succeeded', output: { objectives: [{
    goal, evidence: [{ source: 'Nota actual', finding: 'Jornada laboral variable' }],
  }] } });
  render(<Subject />);
  const generate = () => screen.getByRole('button', { name: 'Proponer objetivos con IA' });
  await waitFor(() => expect(generate()).toBeEnabled());
  fireEvent.click(generate());
  await screen.findByRole("textbox", { name: "Texto del objetivo 1" });
  expect(objectiveText().value).toContain('Situación inicial y fecha\n[Anota cómo empiezas y en qué fecha.]');
  expect(objectiveText().value).toContain('Relación con el diagnóstico\n[Explica cómo el cambio aborda la causa del PES.]');
  expect(objectiveText().value).toContain('Viabilidad, barreras y preferencias\n[Completa con lo que hablaron en consulta.]');
  expect(objectiveText().value).toContain(`Meta o criterio de logro\n${goal.target}`);
  fireEvent.click(screen.getByText('Datos de valoración registrados'));
  expect(screen.getByText('Jornada laboral variable')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Acuerdo · objetivo 1'), { target: { value: 'patient' } });
  expect(screen.getByRole('button', { name: 'Aprobar objetivos' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await screen.findByText(/Borrador guardado/);
  expect(api.review).toHaveBeenLastCalledWith('c', 1, 'save', 'current', props.questionKey, expect.objectContaining({
    goals: [expect.objectContaining({ baseline: '', etiology: '', sign: '', feasibility: '', target: goal.target })],
  }));
  expect(api.changed.mock.lastCall?.[0]).not.toMatch(/\[|Jornada laboral variable/);
});

it("uses one editor for the whole SMART goal and focuses the pending field", async () => {
  await mountSaved();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  const editor = objectiveText();
  expect(editor.value).toContain("¿Qué quieren lograr?");
  expect(editor.value).toContain("¿Cómo reconocerán el avance?");
  expect(editor.value).toContain("¿Cuándo y cómo lo revisarán?");
  expect(editor.value).toContain("¿Es viable y lo acordaron?");
  editObjective("target", "");
  expect(editor.value).toContain("[Define qué resultado concreto indicará un avance.]");
  expect(screen.getByRole("button", { name: "Aprobar objetivos" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Ir al siguiente pendiente" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Meta o criterio de logro" }));
  await waitFor(() => expect(editor).toHaveFocus());
  expect(editor.selectionStart).toBe(editor.value.indexOf("[Define qué resultado concreto indicará un avance.]"));
  editObjective("target", "Meta revisada con la persona");
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(/Borrador guardado/);
  expect(screen.getByRole("button", { name: "Aprobar objetivos" })).toBeEnabled();
  expect(api.review).toHaveBeenLastCalledWith("c", 1, "save", "current", "treatment_objective",
    expect.objectContaining({ goals: [expect.objectContaining({ target: "Meta revisada con la persona" })] }));
});

it('integrates the specifications of the selected objective without changing the other objective', async () => {
  const plan = smartPlan();
  const original = plan.goals[0];
  plan.goals = [original, {
    ...original, outcome: 'Revisar otra parte del seguimiento.',
    etiology: '', baseline: '', feasibility: '', timeframe: '',
  }];
  api.review.mockResolvedValue(objectiveWorkspace(plan));
  render(<Subject />);
  fireEvent.click(await screen.findByRole('button', { name: 'Completar especificaciones del objetivo 2' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Especificaciones del objetivo 2' }));
  fireEvent.change(dialog.getByLabelText('Relación con el diagnóstico'), { target: { value: 'Ayuda a organizar los turnos.' } });
  fireEvent.change(dialog.getByLabelText('Situación inicial y fecha'), { target: { value: 'Registro de la consulta del 20 de noviembre.' } });
  fireEvent.change(dialog.getByLabelText('Viabilidad, barreras y preferencias'), { target: { value: 'Prefiere preparar una opción por la noche.' } });
  fireEvent.change(dialog.getByLabelText('Plazo de reevaluación'), { target: { value: 'En 21 días' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar especificaciones' }));
  expect(objectiveText(2).value).toContain('Plazo de reevaluación\nEn 21 días');
  const updated = readObjectiveEditorText(objectiveText(2).value);
  expect(updated).toMatchObject({ fields: {
    outcome: plan.goals[1].outcome, etiology: 'Ayuda a organizar los turnos.',
    baseline: 'Registro de la consulta del 20 de noviembre.',
    feasibility: 'Prefiere preparar una opción por la noche.', timeframe: 'En 21 días',
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar objetivo 1' }));
  expect(objectiveText().value).toBe(formatObjectiveEditorText(original));
});

it('sends regeneration feedback, previews the new text and keeps the professional’s deadline', async () => {
  const { plan } = await mountSaved();
  const goal = { ...plan.goals[0], timeframe: '', feasibility: 'Acordar cómo adaptar el registro a la jornada.' };
  api.generate.mockResolvedValue({ generationId: 'regenerated', status: 'succeeded', output: { objectives: [{
    goal, evidence: [{ source: 'Entrevista', finding: 'Turnos largos.' }],
  }] } });
  fireEvent.click(screen.getByRole('button', { name: 'Regenerar objetivos con IA' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Regenerar objetivos con IA' }));
  fireEvent.change(dialog.getByLabelText('Qué quieres ajustar · opcional'), { target: { value: 'Incluye una adaptación a los turnos largos.' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Generar propuesta' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver propuesta de IA' }));
  expect(api.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ clinicalFeedback: 'Incluye una adaptación a los turnos largos.' }));
  expect(objectiveText().value).toContain(plan.goals[0].feasibility);
  fireEvent.click(screen.getByRole('button', { name: 'Usar como borrador' }));
  expect(readObjectiveEditorText(objectiveText().value)).toMatchObject({ fields: {
    feasibility: goal.feasibility, timeframe: plan.goals[0].timeframe,
  } });
});

it("retains an unfinished template after saving and reopening without publishing guidance", async () => {
  const first = render(<Subject />);
  await screen.findByText("Datos de valoración registrados");
  fireEvent.click(screen.getByRole("button", { name: "Agregar objetivo" }));
  const editor = objectiveText();
  expect(editor.value).toContain("Resultado esperado\n[Describe el cambio que quieren lograr.]");
  const unfinished = editor.value.replace("Meta o criterio de logro\n", "Meta todavía en edición\n");
  fireEvent.change(editor, { target: { value: unfinished } });
  expect(screen.getByRole("button", { name: "Aprobar objetivos" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(/Borrador guardado en esta sesión/);
  expect(api.review.mock.calls.every(call => call.length === 2)).toBe(true);
  first.unmount();
  render(<Subject />);
  expect(objectiveText()).toHaveValue(unfinished);
  fireEvent.change(objectiveText(), { target: { value: unfinished.replace("Meta todavía en edición", "Meta o criterio de logro") } });
  editObjective("outcome", "Anota las comidas durante tu turno");
  expect(api.changed).toHaveBeenLastCalledWith("Anota las comidas durante tu turno.", ["Anota las comidas durante tu turno."]);
});

it("keeps the editor and its draft when saving fails", async () => {
  await mountSaved();
  fireEvent.click(screen.getByRole("button", { name: "Revisar objetivo 1" }));
  editObjective("outcome", "Resultado revisado", 1);
  api.before.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText(
    "Guarda la entrevista antes de continuar.",
  );
  expect(objectiveText().value).toContain("Resultado revisado");
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
    .toBeEnabled();
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
