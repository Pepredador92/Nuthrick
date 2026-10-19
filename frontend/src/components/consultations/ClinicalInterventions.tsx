import { useEffect, useRef, useState } from "react";
import { AIButton } from "@/src/components/ai/AIControls";
import {
  AIRequestError,
  type AIState,
  getAIGenerationStatus,
  runAIRequest,
} from "@/src/services/ai";
import {
  clinicalInterventions,
  type InterventionAction,
  type InterventionWorkspace,
} from "@/src/services/clinicalInterventions";
import {
  emptyStrategy,
  isStrategyDocument,
  strategyCategories,
  type StrategyDocument,
  strategyFields,
  strategyIssues,
  strategySummary,
} from "../../../../supabase/functions/_shared/interventions";
import {
  InterventionStrategyForm,
  strategyLabels,
} from "./InterventionStrategyForm";

type LocalDraft = {
  document: StrategyDocument;
  expectedUpdatedAt: string | null;
};
type Props = {
  consultationId: string;
  patientId: string;
  revision: number;
  active?: boolean;
  before: () => Promise<boolean>;
  onPendingChange?: (pending: boolean) => void;
  onChanged?: () => void;
  onInstructions?: (text: string) => void;
  workshopUrl?: string;
  readOnly?: boolean;
};
const stateLabels = {
  draft: "Borrador",
  approved: "Aprobada",
  executing: "En ejecución",
  completed: "Finalizada",
  withdrawn: "Retirada",
};
const actionLabels: Record<string, string> = {
  approve: "Aprobación",
  start: "Inicio de ejecución",
  communicate: "Comunicación registrada",
  complete: "Finalización",
  withdraw: "Retiro",
  revert: "Borrador descartado",
};
export function ClinicalInterventions(props: Props) {
  const {
    consultationId,
    revision,
    patientId,
    active,
    before,
    onPendingChange,
    onChanged,
    onInstructions,
    workshopUrl,
    readOnly = false,
  } = props;
  const cacheKey = `intervention-drafts:${consultationId}:${revision}`;
  const pendingKey =
    `clinical-pending:${consultationId}:${revision}:intervention_strategy`;
  const [local, setLocal] = useState<Record<string, LocalDraft>>(() => {
    if (readOnly) return {};
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(cacheKey) || "{}",
      ) as Record<string, LocalDraft>;
      return Object.fromEntries(
        Object.entries(saved).filter(([id, d]) =>
          /^[0-9a-f-]{36}$/i.test(id) && d && isStrategyDocument(d.document) &&
          (d.expectedUpdatedAt === null ||
            typeof d.expectedUpdatedAt === "string")
        ),
      );
    } catch {
      return {};
    }
  });
  const [workspace, setWorkspace] = useState<InterventionWorkspace | null>(
    null,
  );
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [state, setState] = useState<AIState>(() =>
    sessionStorage.getItem(pendingKey) ? "uncertain" : "idle"
  );
  const [proposals, setProposals] = useState<StrategyDocument[]>([]),
    [feedback, setFeedback] = useState("");
  const [execution, setExecution] = useState<
    {
      id: string;
      action: "start" | "communicate" | "complete" | "withdraw";
      executor: string;
      startDate: string;
      recipient: string;
      reason: string;
    } | null
  >(null);
  const pendingRef = useRef(onPendingChange);
  useEffect(() => {
    pendingRef.current = onPendingChange;
  }, [onPendingChange]);
  const pending = Object.keys(local).length > 0 || busy ||
    state === "generating" || proposals.length > 0 || execution !== null;
  useEffect(() => {
    pendingRef.current?.(pending);
  }, [pending]);
  useEffect(() => () => pendingRef.current?.(false), []);
  useEffect(() => {
    let alive = true;
    void clinicalInterventions(consultationId, revision).then((w) => {
      if (alive) setWorkspace(w);
    }).catch((error) => {
      if (alive) setMessage(error.message);
    });
    return () => {
      alive = false;
    };
  }, [consultationId, revision, active]);
  function setDrafts(next: Record<string, LocalDraft>) {
    setLocal(next);
    if (Object.keys(next).length) {
      sessionStorage.setItem(cacheKey, JSON.stringify(next));
    } else sessionStorage.removeItem(cacheKey);
  }
  function edit(id: string, document: StrategyDocument) {
    const item = workspace?.items.find((item) => item.id === id);
    setDrafts({
      ...local,
      [id]: {
        document,
        expectedUpdatedAt: local[id]
          ? local[id].expectedUpdatedAt
          : item?.updated_at ?? null,
      },
    });
    setMessage("");
  }
  function add(document?: StrategyDocument) {
    const next = document ??
      {
        version: 1,
        pesApprovedAt: workspace?.pes?.approved_at ?? "",
        objectiveApprovedAt: workspace?.objective?.approved_at ?? "",
        strategy: emptyStrategy(),
      };
    edit(crypto.randomUUID(), next);
  }
  function discardLocal(id: string) {
    const next = { ...local };
    delete next[id];
    setDrafts(next);
  }
  async function refresh() {
    try {
      if (!(await before())) {
        throw new Error("Guarda la consulta antes de actualizar.");
      }
      setWorkspace(await clinicalInterventions(consultationId, revision));
      setMessage(
        "Contexto actualizado. Revisa los vínculos de los borradores.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos actualizar.",
      );
    }
  }
  async function mutate(
    id: string,
    action: InterventionAction,
    extra: Record<string, unknown> = {},
  ) {
    if (
      execution &&
      (execution.id !== id ||
        !["start", "communicate", "complete", "withdraw"].includes(action))
    ) {
      setMessage(
        "Registra o cancela el evento de ejecución abierto antes de guardar otra acción.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (!(await before())) {
        throw new Error("Guarda la consulta antes de continuar.");
      }
      const item = workspace?.items.find((item) => item.id === id);
      const doc = local[id]?.document ?? item?.draft ??
        item?.approved?.document;
      const updated = await clinicalInterventions(
        consultationId,
        revision,
        action,
        {
          id,
          expectedUpdatedAt: local[id]
            ? local[id].expectedUpdatedAt
            : item?.updated_at ?? null,
          ...(["save", "approve"].includes(action) ? { document: doc } : {}),
          ...extra,
        },
      );
      setWorkspace(updated);
      discardLocal(id);
      setExecution(null);
      onChanged?.();
      setMessage(
        action === "approve"
          ? "Estrategia aprobada. El inicio de ejecución se registra por separado."
          : action === "save"
          ? "Borrador guardado."
          : action === "delete"
          ? "Borrador eliminado."
          : action === "withdraw"
          ? "Estrategia retirada. Su historial se conserva."
          : "Cambio registrado.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos guardar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (sessionStorage.getItem(pendingKey)) {
      setState("uncertain");
      setMessage("Comprueba primero la solicitud pendiente.");
      return;
    }
    setState("generating");
    setMessage("");
    setProposals([]);
    try {
      if (!(await before())) {
        throw new Error("Guarda la consulta antes de continuar.");
      }
      const fresh = await clinicalInterventions(consultationId, revision);
      setWorkspace(fresh);
      if (!fresh.pes || !fresh.objective?.smart_plan) {
        throw new Error(
          "Aprueba el PES y los objetivos SMART antes de proponer estrategias.",
        );
      }
      const key = crypto.randomUUID();
      sessionStorage.setItem(pendingKey, key);
      const result = await runAIRequest({
        feature: "intervention_strategy",
        idempotencyKey: key,
        consultationId,
        patientId,
        revision,
        strategyFeedback: feedback.trim() || undefined,
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setMessage(
          "Comprueba el estado de la solicitud antes de volver a generar.",
        );
        return;
      }
      const documents = (result.output as { strategies?: unknown }).strategies;
      if (!Array.isArray(documents) || documents.length > 3 ||
        !documents.every(isStrategyDocument)) {
        throw new Error(
          "La propuesta de IA llegó incompleta o con datos incompatibles. No se pudo abrir para revisión. Puedes continuar manualmente o contactar a soporte.",
        );
      }
      sessionStorage.removeItem(pendingKey);
      setProposals(documents);
      setState("ready");
      if (!documents.length) {
        setMessage(
          "No hubo información suficiente para proponer una estrategia específica. Puedes redactarla manualmente.",
        );
      }
    } catch (error) {
      const uncertain = error instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(
          error.code,
        );
      if (!uncertain) sessionStorage.removeItem(pendingKey);
      setState(
        uncertain ? "uncertain" : error instanceof AIRequestError &&
            error.code === "insufficient_credits"
          ? "insufficient"
          : "error",
      );
      setMessage(
        error instanceof Error ? error.message : "No pudimos generar.",
      );
    }
  }
  async function checkRequest() {
    const key = sessionStorage.getItem(pendingKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(pendingKey);
        setState("idle");
        setMessage(
          result?.status === "succeeded"
            ? "La solicitud terminó; la propuesta no está disponible en esta sesión. Otra generación puede consumir nuevos créditos."
            : "Solicitud resuelta. Puedes continuar manualmente o generar otra propuesta.",
        );
      } else setMessage("La solicitud sigue pendiente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos comprobar.",
      );
    }
  }
  const items = workspace?.items ?? [];
  const ids = [
    ...items.map((item) => item.id),
    ...Object.keys(local).filter((id) => !items.some((item) => item.id === id)),
  ];
  const eligible = !!workspace?.pes && !!workspace.objective?.smart_plan &&
    workspace.objective.pes_statement === workspace.pes.pesStatement;
  return (
    <section
      className="clinical-assistant"
      aria-label="Estrategias de intervención"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Del objetivo a la acción</h3>
          <p className="mt-2 text-sm text-[var(--nuth-muted)]">
            Define qué se hará, cómo, durante cuánto tiempo y quién participará.
            Ordena las estrategias por prioridad clínica.
          </p>
        </div>
        <button
          type="button"
          className="nuth-button-secondary !text-xs"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Actualizar contexto
        </button>
      </div>
      {workspace?.pes && (
        <details
          className="mt-4 rounded-xl border border-[var(--nuth-line)] p-3 text-sm"
          open
        >
          <summary className="font-semibold">
            PES y objetivos de referencia
          </summary>
          <p className="mt-2 whitespace-pre-line">
            {workspace.pes.pesStatement}
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            {workspace.objective?.smart_plan?.goals.map((g, i) => (
              <li key={i}>
                <strong>{g.outcome}</strong>
                <p className="text-xs text-[var(--nuth-muted)]">
                  {g.indicator} · Meta: {g.target} · Reevaluación: {g.timeframe}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!eligible && !readOnly && (
        <p className="mt-3 text-sm text-[var(--nuth-muted)]">
          Puedes guardar borradores. Aprueba el PES y los objetivos SMART para
          aprobar estrategias o solicitar propuestas de IA.
        </p>
      )}
      {!readOnly && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="nuth-button-secondary !text-sm"
              disabled={busy || ids.length >= 30}
              onClick={() => add()}
            >
              Agregar estrategia manualmente
            </button>
            <AIButton
              capability="ai.consultation_support"
              state={state}
              disabled={busy || !eligible || ids.length >= 30}
              onClick={() => void generate()}
            >
              Proponer estrategias con IA
            </AIButton>
          </div>
          <label className="mt-3 block text-xs text-[var(--nuth-muted)]">
            Qué cambiarías en otra propuesta · opcional<textarea
              className="nuth-input mt-1 w-full !text-sm"
              rows={2}
              maxLength={600}
              placeholder="Por ejemplo, priorizar educación y recursos disponibles."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <p className="mt-2 text-xs text-[var(--nuth-muted)]">
            La generación usa créditos según el consumo real. Revisa, adapta y
            acuerda cada propuesta.
          </p>
        </>
      )}
      {state === "uncertain" && (
        <button
          type="button"
          className="nuth-button-secondary mt-3 !text-xs"
          onClick={() => void checkRequest()}
        >
          Comprobar solicitud
        </button>
      )}
      {!!proposals.length && (
        <div className="mt-4 space-y-3">
          <h4 className="font-semibold">Propuestas para revisar</h4>
          {proposals.map((doc, i) => (
            <article
              key={i}
              className="rounded-xl border border-[var(--nuth-line)] p-3 text-sm"
            >
              <h5 className="font-semibold">{doc.strategy.title}</h5>
              <p className="mt-2 whitespace-pre-line">
                {strategySummary(doc.strategy)}
              </p>
              <p className="mt-2 text-xs">
                Relación con la causa: {doc.strategy.etiologyLink}
              </p>
              <details className="mt-2 text-xs">
                <summary>Datos utilizados y pendientes</summary>
                {doc.strategy.evidence.map((e, j) => (
                  <p key={j} className="mt-2">
                    <strong>{e.source}:</strong> {e.finding}
                  </p>
                ))}
                <ul className="mt-2 list-disc pl-4">
                  {doc.strategy.missingContext.map((note, j) => (
                    <li key={j}>{note}</li>
                  ))}
                </ul>
              </details>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nuth-button-secondary !text-xs"
                  disabled={busy || ids.length >= 30}
                  onClick={() => {
                    add(doc);
                    setProposals(proposals.filter((_, index) => index !== i));
                  }}
                >
                  Revisar y editar estrategia
                </button>
                <button
                  type="button"
                  className="nuth-button-secondary !text-xs"
                  onClick={() =>
                    setProposals(proposals.filter((_, index) => index !== i))}
                >
                  Descartar propuesta
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="mt-5 space-y-5">
        {ids.map((id) => {
          const item = items.find((item) => item.id === id),
            document = local[id]?.document ?? item?.draft ??
              item?.approved?.document;
          if (!document) return null;
          const s = document.strategy, editing = !!local[id] || !!item?.draft;
          const current = !workspace?.archived && !!item?.approved &&
            !item.requiresReview && !local[id] &&
            ["approved", "executing"].includes(item.state);
          const linked = eligible &&
            document.pesApprovedAt === workspace?.pes?.approved_at &&
            document.objectiveApprovedAt === workspace?.objective?.approved_at;
          return (
            <article
              key={id}
              className="min-w-0 rounded-2xl border border-[var(--nuth-line)] p-3 sm:p-5"
              aria-label={s.title || "Nueva estrategia"}
            >
              <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-[var(--nuth-muted)]">
                    Prioridad {s.priority} · {strategyCategories[s.category]}
                  </p>
                  <h4 className="mt-1 font-semibold">
                    {s.title || "Nueva estrategia"}
                  </h4>
                </div>
                <span className="text-xs font-semibold">
                  {local[id]
                    ? "Cambios sin guardar"
                    : item?.requiresReview
                    ? "Requiere revisión"
                    : item?.draft
                    ? "Borrador guardado"
                    : stateLabels[item?.state ?? "draft"]}
                  {item?.version ? ` · versión ${item.version}` : ""}
                </span>
              </header>
              {editing && !readOnly
                ? (
                  <>
                    <InterventionStrategyForm
                      document={document}
                      workspace={workspace}
                      disabled={busy}
                      onChange={(doc) => edit(id, doc)}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nuth-button-secondary !text-sm"
                        disabled={busy}
                        onClick={() => void mutate(id, "save")}
                      >
                        Guardar borrador
                      </button>
                      <button
                        type="button"
                        className="nuth-button !text-sm"
                        disabled={busy || !linked || !!strategyIssues(s).length}
                        onClick={() => void mutate(id, "approve")}
                      >
                        Aprobar estrategia
                      </button>
                      {local[id] && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy}
                          onClick={() => discardLocal(id)}
                        >
                          Descartar cambios sin guardar
                        </button>
                      )}
                      {item?.draft && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              id,
                              item.approved ? "revert" : "delete",
                            )}
                        >
                          {item.approved
                            ? "Descartar borrador guardado"
                            : "Eliminar borrador"}
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-[var(--nuth-muted)]">
                      Al aprobar confirmas el vínculo clínico, los componentes
                      de implementación y el acuerdo documentado.
                    </p>
                  </>
                )
                : (
                  <>
                    <p className="whitespace-pre-line text-sm">
                      {strategySummary(s)}
                    </p>
                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold">
                          Relación con la etiología
                        </dt>
                        <dd>{s.etiologyLink}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">
                          Responsable / ejecución prevista
                        </dt>
                        <dd>{s.responsible} / {s.executor}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">
                          Inicio y revisión previstos
                        </dt>
                        <dd>{s.startDate} · {s.reviewAt}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Adaptaciones</dt>
                        <dd>{s.adaptations}</dd>
                      </div>
                    </dl>
                    {item?.execution.startDate && (
                      <p className="mt-3 text-xs">
                        Ejecución registrada desde {item.execution.startDate} ·
                        {" "}
                        {item.execution.executor}
                      </p>
                    )}
                    {item?.execution.communication && (
                      <p className="mt-2 text-xs">
                        Comunicación registrada con{" "}
                        {item.execution.communication.recipient} ·{" "}
                        {new Date(item.execution.communication.recordedAt)
                          .toLocaleString("es-MX")}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!readOnly && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy}
                          onClick={() => edit(id, document)}
                        >
                          Editar estrategia
                        </button>
                      )}
                      {current && onInstructions && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy}
                          onClick={() => {
                            onInstructions(strategySummary(s));
                            setMessage(
                              "Acción copiada a Indicaciones. Revísala antes de compartir.",
                            );
                          }}
                        >
                          Llevar a indicaciones
                        </button>
                      )}
                      {current && s.category === "food" && s.route === "oral" &&
                        workshopUrl && (
                        <a
                          href={workshopUrl}
                          className="nuth-button-secondary !text-xs"
                        >
                          Llevar al Taller de dietas
                        </a>
                      )}
                      {current &&
                        ([
                          "start",
                          "communicate",
                          "complete",
                          "withdraw",
                        ] as const).filter((action) =>
                          action !== "start" || item?.state === "approved"
                        ).map((action) => (
                          <button
                            key={action}
                            type="button"
                            className="nuth-button-secondary !text-xs"
                            disabled={busy}
                            onClick={() =>
                              setExecution({
                                id,
                                action,
                                executor: s.executor,
                                startDate: "",
                                recipient: "",
                                reason: "",
                              })}
                          >
                            {{
                              start: "Registrar inicio",
                              communicate: "Registrar comunicación",
                              complete: "Finalizar",
                              withdraw: "Retirar",
                            }[action]}
                          </button>
                        ))}
                      {item?.requiresReview &&
                        ["approved", "executing"].includes(item.state) && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          onClick={() =>
                            setExecution({
                              id,
                              action: "withdraw",
                              executor: "",
                              startDate: "",
                              recipient: "",
                              reason: "",
                            })}
                        >
                          Retirar conservando historial
                        </button>
                      )}
                    </div>
                  </>
                )}
              {execution?.id === id && (
                <form
                  className="mt-4 space-y-3 rounded-xl border border-[var(--nuth-line)] p-3 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate(id, execution.action, {
                      executor: execution.executor,
                      startDate: execution.startDate,
                      recipient: execution.recipient,
                      reason: execution.reason,
                    });
                  }}
                >
                  <h5 className="font-semibold">
                    {actionLabels[execution.action]}
                  </h5>
                  {execution.action === "start"
                    ? (
                      <>
                        <label className="block">
                          Fecha de inicio<input
                            required
                            type="date"
                            className="nuth-input mt-1 w-full"
                            value={execution.startDate}
                            onChange={(e) =>
                              setExecution({
                                ...execution,
                                startDate: e.target.value,
                              })}
                          />
                        </label>
                        <label className="block">
                          Responsable de ejecución<input
                            required
                            maxLength={400}
                            className="nuth-input mt-1 w-full"
                            value={execution.executor}
                            onChange={(e) =>
                              setExecution({
                                ...execution,
                                executor: e.target.value,
                              })}
                          />
                        </label>
                      </>
                    )
                    : execution.action === "communicate"
                    ? (
                      <label className="block">
                        A quién se comunicó<input
                          required
                          maxLength={400}
                          className="nuth-input mt-1 w-full"
                          value={execution.recipient}
                          onChange={(e) =>
                            setExecution({
                              ...execution,
                              recipient: e.target.value,
                            })}
                        />
                      </label>
                    )
                    : (
                      <label className="block">
                        Motivo o resultado observado<textarea
                          required
                          className="nuth-input mt-1 w-full"
                          maxLength={1500}
                          value={execution.reason}
                          onChange={(e) =>
                            setExecution({
                              ...execution,
                              reason: e.target.value,
                            })}
                        />
                      </label>
                    )}
                  <div className="flex gap-2">
                    <button className="nuth-button !text-xs" disabled={busy}>
                      Registrar
                    </button>
                    <button
                      type="button"
                      className="nuth-button-secondary !text-xs"
                      onClick={() => setExecution(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
              {!!item?.history.length && (
                <details className="mt-4 text-xs">
                  <summary>Historial de versiones y ejecución</summary>
                  <ol className="mt-3 space-y-3">
                    {item.history.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {actionLabels[event.action] ?? event.action}{" "}
                          · v{event.version}
                        </strong>{" "}
                        · {new Date(event.recorded_at).toLocaleString("es-MX")}
                        {isStrategyDocument(event.payload.document) && (
                          <details className="mt-2">
                            <summary>
                              Ver contenido de la versión aprobada
                            </summary>
                            <dl className="mt-2 space-y-2">
                              {strategyFields.filter((field) =>
                                event.payload.document &&
                                (event.payload.document as StrategyDocument)
                                  .strategy[field]
                              ).map((field) => (
                                <div key={field}>
                                  <dt className="font-semibold">
                                    {strategyLabels[field] ??
                                      ({
                                        referenceTitle: "Referencia",
                                        referenceVersion:
                                          "Versión de la referencia",
                                        referenceNotes: "Fundamento clínico",
                                      } as Record<string, string>)[field] ??
                                      field}
                                  </dt>
                                  <dd className="whitespace-pre-line">
                                    {(event.payload
                                      .document as StrategyDocument)
                                      .strategy[field]}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                        {typeof event.payload.reason === "string" && (
                          <p>{event.payload.reason}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          );
        })}
      </div>
      {!ids.length && (
        <p className="mt-5 text-sm text-[var(--nuth-muted)]">
          Aún no hay estrategias registradas en esta revisión.
        </p>
      )}
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </section>
  );
}
