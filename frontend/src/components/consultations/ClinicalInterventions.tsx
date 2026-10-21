import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { ClinicalTaskStatus } from "./ClinicalTaskCard";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import { InterventionStrategyDialog } from "./InterventionStrategyDialog";
import "./ClinicalInterventions.css";
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
  firstIncompleteStrategyStep,
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
  onCompleted?: (allApproved:boolean) => void;
  onStatusChange?: (status:ClinicalTaskStatus) => void;
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
    onStatusChange,
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialStep, setInitialStep] = useState(0);
  const reviewButtons = useRef<Record<string, HTMLButtonElement | null>>({});
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
    const id = crypto.randomUUID();
    edit(id, next);
    setInitialStep(0);
    setActiveId(id);
  }
  function discardLocal(id: string) {
    const next = { ...local };
    delete next[id];
    setDrafts(next);
  }
  const currentItems=workspace?.items.filter(item=>item.state!=='withdrawn')??[];
  const progressStatus:ClinicalTaskStatus=currentItems.length&&currentItems.every(item=>item.approved&&!item.draft&&!item.requiresReview)&&!Object.keys(local).length?'approved':currentItems.length||Object.keys(local).length?'progress':'pending';
  useEffect(()=>{onStatusChange?.(progressStatus);},[onStatusChange,progressStatus]);
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
    if (busy || readOnly) return false;
    if (
      execution &&
      (execution.id !== id ||
        !["start", "communicate", "complete", "withdraw"].includes(action))
    ) {
      setMessage(
        "Registra o cancela el evento de ejecución abierto antes de guardar otra acción.",
      );
      return false;
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
      if (action === 'approve') props.onCompleted?.(updated.items.filter(entry=>entry.state!=='withdrawn').every(entry=>entry.approved&&!entry.draft&&!entry.requiresReview) && !Object.keys(local).some(key=>key!==id));
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
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos guardar.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (readOnly || busy || state === "generating" || execution) return;
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
      if (
        !Array.isArray(documents) || documents.length > 3 ||
        !documents.every(isStrategyDocument)
      ) {
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
  const activeItem = items.find((item) => item.id === activeId);
  const activeDocument = activeId
    ? local[activeId]?.document ?? activeItem?.draft ??
      activeItem?.approved?.document
    : undefined;
  const activeLinked = !!activeDocument && eligible &&
    activeDocument.pesApprovedAt === workspace?.pes?.approved_at &&
    activeDocument.objectiveApprovedAt === workspace?.objective?.approved_at;
  function closeEditor() {
    const id = activeId;
    setActiveId(null);
    requestAnimationFrame(() => {
      if (id) reviewButtons.current[id]?.focus();
    });
  }
  async function saveEditor() {
    if (!activeId) return;
    if (
      (!local[activeId] && !activeItem?.draft) || await mutate(activeId, "save")
    ) closeEditor();
  }
  async function approveEditor() {
    if (activeId && await mutate(activeId, "approve")) closeEditor();
  }
  return (
    <section
      className="clinical-strategies-workspace clinical-objectives-workspace"
      aria-label="Estrategias de intervención"
    >
      <div className="clinical-objective-overview">
        <span className="clinical-stage-icon">
          <ClipboardList size={22} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-semibold">Del objetivo a la acción</h3>
          <p className="mt-2 text-sm text-[var(--nuth-muted)]">
            Abre una estrategia para definir la acción, organizar su aplicación
            y acordarla con la persona.
          </p>
        </div>
        <button
          type="button"
          className="nuth-button-secondary !text-xs"
          disabled={busy || execution !== null}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} aria-hidden="true" />Actualizar contexto
        </button>
      </div>
      {workspace?.pes && (
        <details className="mt-4 rounded-xl border border-[var(--nuth-line)] p-3 text-sm">
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
              disabled={busy || execution !== null || ids.length >= 30}
              onClick={() => add()}
            >
              <Plus size={16} aria-hidden="true" />Agregar estrategia
              manualmente
            </button>
            <AIButton
              capability="ai.consultation_support"
              state={state}
              disabled={busy || execution !== null || !eligible ||
                ids.length >= 30}
              onClick={() => void generate()}
            >
              Proponer estrategias con IA
            </AIButton>
          </div>
          <details className="clinical-support-details">
            <summary>Ajustar la próxima propuesta · opcional</summary>
            <label className="mt-3 block text-xs text-[var(--nuth-muted)]">
              Qué cambiarías en otra propuesta · opcional<textarea
                className="nuth-input mt-1 w-full !text-sm"
                rows={2}
                maxLength={600}
                placeholder="Por ejemplo, priorizar educación y recursos disponibles."
                disabled={busy || state === "generating"}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
          </details>
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
        <div className="clinical-strategy-proposals">
          <h4 className="font-semibold">Propuestas para revisar</h4>
          {proposals.map((doc, i) => (
            <article
              key={i}
              className="rounded-xl border border-[var(--nuth-line)] p-3 text-sm"
            >
              <h5 className="font-semibold">{doc.strategy.title}</h5>
              <p className="clinical-strategy-summary-action">
                {doc.strategy.action}
              </p>
              <dl className="clinical-goal-summary-facts">
                <div>
                  <dt>Tipo</dt>
                  <dd>{strategyCategories[doc.strategy.category]}</dd>
                </div>
                <div>
                  <dt>Revisión prevista</dt>
                  <dd>{doc.strategy.reviewAt || "Por acordar"}</dd>
                </div>
              </dl>
              <details className="clinical-suggestion-preview">
                <summary>Vista previa completa</summary>
                <p>{strategySummary(doc.strategy)}</p>
                <p>Relación con la causa: {doc.strategy.etiologyLink}</p>
              </details>
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
                  disabled={busy || execution !== null || ids.length >= 30}
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
      <div className="clinical-strategy-list">
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
          const status = editing || item?.requiresReview
            ? "progress"
            : item?.state === "completed"
            ? "complete"
            : item?.state === "withdrawn"
            ? "pending"
            : current
            ? "approved"
            : "pending";
          return (
            <article
              key={id}
              className="clinical-goal-card clinical-strategy-card"
              data-status={status}
              aria-label={s.title || "Nueva estrategia"}
            >
              <header className="clinical-strategy-card-heading">
                <div>
                  <p>
                    Prioridad {s.priority} · {strategyCategories[s.category]}
                  </p>
                  <h4>{s.title || "Nueva estrategia"}</h4>
                </div>
                <ClinicalStatusBadge status={status}>
                  {local[id]
                    ? "Cambios sin guardar"
                    : item?.requiresReview
                    ? "Requiere revisión"
                    : item?.draft
                    ? "Borrador guardado"
                    : stateLabels[item?.state ?? "draft"]}
                </ClinicalStatusBadge>
              </header>
              <p className="clinical-strategy-summary-action">
                {s.action || "Define qué se hará con la persona."}
              </p>
              <dl className="clinical-goal-summary-facts">
                <div>
                  <dt>Responsable previsto</dt>
                  <dd>{s.responsible || "Por definir"}</dd>
                </div>
                <div>
                  <dt>Revisión</dt>
                  <dd>{s.reviewAt || "Por definir"}</dd>
                </div>
              </dl>
              <div className="clinical-strategy-card-actions">
                {!readOnly && (
                  <button
                    ref={(element) => {
                      reviewButtons.current[id] = element;
                    }}
                    type="button"
                    className="clinical-text-action"
                    disabled={busy || execution !== null}
                    aria-label={`Revisar estrategia: ${
                      s.title || "Nueva estrategia"
                    }`}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setInitialStep(firstIncompleteStrategyStep(s, linked));
                      setMessage("");
                      setActiveId(id);
                    }}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    {editing || item?.requiresReview
                      ? "Revisar estrategia"
                      : "Consultar o editar"}
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
                {editing && !readOnly && (
                  <details className="clinical-strategy-draft-options">
                    <summary>Opciones del borrador</summary>
                    <div>
                      {local[id] && (
                        <button
                          type="button"
                          className="clinical-text-action"
                          disabled={busy || execution !== null}
                          onClick={() => discardLocal(id)}
                        >
                          Descartar cambios sin guardar
                        </button>
                      )}
                      {item?.draft && (
                        <button
                          type="button"
                          className="clinical-text-action"
                          disabled={busy || execution !== null}
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
                  </details>
                )}
              </div>
              <details className="clinical-support-details">
                <summary>
                  Ver detalle de la estrategia{item?.version
                    ? ` · versión ${item.version}`
                    : ""}
                </summary>
                <dl className="clinical-strategy-detail-fields">
                  {strategyFields.filter((field) => s[field]).map((field) => (
                    <div key={field}>
                      <dt>{strategyLabels[field] ?? field}</dt>
                      <dd>{s[field]}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Objetivos vinculados</dt>
                    <dd>
                      {s.goalIndexes.map((index) => `Objetivo ${index + 1}`)
                        .join(" · ") || "Por definir"}
                    </dd>
                  </div>
                </dl>
              </details>
              {item?.approved && (
                <details className="clinical-support-details">
                  <summary>Ejecución y acciones</summary>
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
                  {!readOnly && (
                    <div className="clinical-strategy-execution-actions">
                      {current && onInstructions && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy || execution !== null}
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
                            disabled={busy || execution !== null}
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
                          disabled={busy || execution !== null}
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
                  )}
                </details>
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
      {activeId && activeDocument && !readOnly && (
        <InterventionStrategyDialog
          key={activeId}
          id={`strategy-${activeId}`}
          document={activeDocument}
          workspace={workspace}
          initialStep={initialStep}
          busy={busy}
          message={message}
          linked={activeLinked}
          clean={!local[activeId] && !activeItem?.draft}
          alreadyApproved={!local[activeId] && !activeItem?.draft &&
            !!activeItem?.approved && !activeItem.requiresReview}
          canApprove={activeLinked && !workspace?.archived &&
            !strategyIssues(activeDocument.strategy).length}
          onChange={(document) => edit(activeId, document)}
          onClose={closeEditor}
          onSave={() => void saveEditor()}
          onApprove={() => void approveEditor()}
        />
      )}
      {!ids.length && (
        <p className="mt-5 text-sm text-[var(--nuth-muted)]">
          Aún no hay estrategias registradas en esta revisión.
        </p>
      )}
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </section>
  );
}
