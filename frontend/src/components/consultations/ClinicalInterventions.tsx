import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Eraser,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ClinicalTaskStatus } from "./ClinicalTaskCard";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import { InterventionStrategyEditor } from "./InterventionStrategyEditor";
import { InterventionStrategyActionDialog, type StrategyDraftAction } from "./InterventionStrategyActionDialog";
import {useConsultationDraft,useConsultationDraftContext,useDurableAIProposal} from './ConsultationDrafts';
import { useClinicalBatchProposal } from './ClinicalBatchAI';
import { objectiveFields, type ObjectiveGoal } from '../../../../supabase/functions/_shared/objectives';
import {changedAnswers} from '@/src/features/consultations/answerAutosave';
import {readStrategyEditorText, upgradeStrategyEditorText} from '@/src/features/consultations/strategyEditorText';
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
  strategyContextEligible,
  strategyDocumentForWorkspace,
  strategyIsLinked,
  strategyLabels,
  StrategyProposalSources,
} from "./InterventionStrategyForm";

type LocalDraft = {
  document: StrategyDocument;
  expectedUpdatedAt: string | null;
  text?: string;
  textVersion?: 2;
};
function currentEditorText(draft: LocalDraft | undefined) {
  if (draft?.text === undefined) return undefined;
  return draft.textVersion === 2 ? draft.text : upgradeStrategyEditorText(draft.text, draft.document.strategy);
}
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
  onOpenInstructions?: () => void;
  onOpenWorkshop?: () => void;
  readOnly?: boolean;
  onReviewPrerequisite?: (stage: 1 | 2) => void;
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
    onOpenInstructions,
    onOpenWorkshop,
    readOnly = false,
  } = props;
  const cacheKey = `intervention-drafts:${consultationId}:${revision}`;
  const pendingKey =
    `clinical-pending:${consultationId}:${revision}:intervention_strategy`;
  const checkpoints=useConsultationDraftContext();
  const [pendingRequest,setPendingRequest]=useConsultationDraft<string|null>('request:intervention_strategy',()=>sessionStorage.getItem(pendingKey),true);
  const [local, setLocal] = useConsultationDraft<Record<string, LocalDraft>>('strategies',() => {
    if (readOnly) return {};
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(cacheKey) || "{}",
      ) as Record<string, LocalDraft>;
      return Object.fromEntries(
        Object.entries(saved).filter(([id, d]) =>
          /^[0-9a-f-]{36}$/i.test(id) && d && isStrategyDocument(d.document) &&
          (d.text === undefined || typeof d.text === 'string') &&
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
  useEffect(()=>{if(checkpoints&&Object.keys(local).length&&!Object.hasOwn(checkpoints.values,'strategies'))setLocal(local);},[checkpoints,local,setLocal]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [state, setState] = useState<AIState>(() =>
    (pendingRequest||sessionStorage.getItem(pendingKey)) ? "uncertain" : "idle"
  );
  const [proposals, setProposals] = useConsultationDraft<StrategyDocument[]>('strategy-proposals',[]),
    [feedback, setFeedback] = useConsultationDraft('strategy-feedback',"");
  const batch = useClinicalBatchProposal('intervention_strategy');
  const { proposal: batchProposal, reviewed: reviewedBatch, markReviewed } = batch;
  const batchGoals = useClinicalBatchProposal('consultation_support').proposal?.output.objectives as { goal?: ObjectiveGoal }[] | undefined;
  const [execution, setExecution] = useConsultationDraft<
    {
      id: string;
      action: "start" | "communicate" | "complete" | "withdraw";
      executor: string;
      startDate: string;
      recipient: string;
      reason: string;
    } | null
  >('strategy-execution',null);
  const [activeId, setActiveId] = useConsultationDraft<string | null>('strategy-editor',null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAction, setDraftAction] = useState<{ id: string; action: StrategyDraftAction } | null>(null);
  const [actionBusy, setActionBusy] = useState(false), [actionError, setActionError] = useState("");
  useDurableAIProposal('intervention_strategy',(output)=>{
    if (readOnly) return;
    const documents=output.strategies;
    if(!Array.isArray(documents)||!documents.every(isStrategyDocument))return;
    setProposals(documents);setState('ready');setPendingRequest(null);sessionStorage.removeItem(pendingKey);setMessage('Propuestas recuperadas para revisión.');
  });
  useEffect(() => {
    if (readOnly || active === false || pendingRequest || state === 'generating' || state === 'uncertain' ||
      !batchProposal || reviewedBatch === batchProposal.generationId) return;
    const documents = batchProposal.output.strategies;
    if (!Array.isArray(documents) || !documents.every(isStrategyDocument)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setProposals(current => [...documents, ...current.filter(doc =>
        doc.generationId !== batchProposal.generationId && (!reviewedBatch || doc.generationId !== reviewedBatch))]);
      markReviewed(batchProposal.generationId);
      if (!documents.length) setMessage('La propuesta completa no contiene estrategias utilizables.');
    });
    return () => { cancelled = true; };
  }, [active, batchProposal, markReviewed, pendingRequest, readOnly, reviewedBatch, setProposals, state]);
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
  const setDrafts = useCallback((next: Record<string, LocalDraft>) => {
    setLocal(next);
    try {
      if (Object.keys(next).length) sessionStorage.setItem(cacheKey, JSON.stringify(next));
      else sessionStorage.removeItem(cacheKey);
    } catch {
      // The consultation checkpoint also keeps the draft when browser storage is full.
    }
  }, [setLocal, cacheKey]);
  function edit(id: string, document: StrategyDocument, text: string | null | undefined = currentEditorText(local[id])) {
    const item = workspace?.items.find((item) => item.id === id);
    setDrafts({
      ...local,
      [id]: {
        document,
        ...(typeof text === 'string' ? { text, textVersion: 2 } : {}),
        expectedUpdatedAt: local[id]
          ? local[id].expectedUpdatedAt
          : item?.updated_at ?? null,
      },
    });
    setMessage("");
  }
  function editText(id: string, document: StrategyDocument, text: string) {
    const parsed = readStrategyEditorText(text);
    edit(id, 'fields' in parsed ? { ...document, strategy: { ...document.strategy, ...parsed.fields } } : document, text);
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
    setActiveId(id);
    requestAnimationFrame(() => window.document.getElementById(`strategy-card-${id}`)?.focus());
  }
  function linkBatchStrategy(document: StrategyDocument): StrategyDocument {
    if (!document.objectiveApprovedAt.startsWith('draft:') || document.generationId !== batch.proposal?.generationId) return document;
    const objective = workspace?.objective;
    const goals = objective?.smart_plan?.goals ?? [];
    const indexes = document.strategy.goalIndexes.map(index => {
      const generated = batchGoals?.[index]?.goal;
      return goals.findIndex(goal => generated && objectiveFields.every(field => goal[field] === generated[field]));
    });
    if (workspace?.pes && objective && strategyContextEligible(workspace) && indexes.length && indexes.every(index => index >= 0)) {
      return { ...document, pesApprovedAt: workspace.pes.approved_at, objectiveApprovedAt: objective.approved_at,
        strategy: { ...document.strategy, goalIndexes: [...new Set(indexes)] } };
    }
    return { ...document, strategy: { ...document.strategy, goalIndexes: [] } };
  }
  function discardLocal(id: string) {
    const next = { ...local };
    delete next[id];
    setDrafts(next);
  }
  useEffect(() => {
    if (!workspace) return;
    const next = {...local};
    let changed = false;
    for (const item of workspace.items) {
      const draft = next[item.id];
      const raw = currentEditorText(draft);
      if (draft && item.approved && !item.draft && !item.requiresReview &&
        (raw === undefined || 'fields' in readStrategyEditorText(raw)) &&
        !Object.keys(changedAnswers({document:item.approved.document},
          {document:strategyDocumentForWorkspace(draft.document,workspace)})).length) {
        delete next[item.id];changed = true;
      }
    }
    if (changed) setDrafts(next);
  }, [workspace, local, setDrafts]);
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
    if (busy || readOnly || workspace?.archived) return false;
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
      let doc = local[id]?.document ?? item?.draft ??
        item?.approved?.document;
      const raw = currentEditorText(local[id]);
      if (doc && (action === 'save' || action === 'approve') && raw !== undefined) {
        const parsed = readStrategyEditorText(raw);
        if ('issue' in parsed) throw new Error(parsed.issue);
        doc = { ...doc, strategy: { ...doc.strategy, ...parsed.fields } };
      }
      if (action === 'approve' && doc) {
        const fresh = await clinicalInterventions(consultationId, revision);
        setWorkspace(fresh);
        doc = strategyDocumentForWorkspace(doc, fresh);
        if (!strategyContextEligible(fresh)) {
          throw new Error(fresh.pes
            ? 'Los objetivos aún no están aprobados. Ve a Objetivos y aprueba el conjunto para continuar.'
            : 'Aprueba el diagnóstico PES para continuar.');
        }
        if (!strategyIsLinked(doc, fresh)) {
          setActiveId(id);
          throw new Error('Los objetivos cambiaron. Elige de la lista actual el objetivo que apoya esta estrategia.');
        }
      }
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
      setEditingId(null);
      discardLocal(id);
      setExecution(null);
      onChanged?.();
      const checkpointSaved = !checkpoints || await checkpoints.flush();
      setMessage(
        (action === "approve"
          ? "Estrategia aprobada."
          : action === "save"
          ? "Borrador guardado. Pulsa «Aprobar estrategia» para cambiar su estado."
          : action === "delete"
          ? "Borrador eliminado."
          : action === "withdraw"
          ? "Estrategia retirada. Su historial se conserva."
          : "Cambio registrado.") + (checkpointSaved ? "" : " El cambio se registró, pero falta guardar el avance de la pantalla. Reintenta el guardado antes de salir."),
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "No pudimos guardar.";
      setMessage(errorMessage);
      if (draftAction?.id === id) setActionError(errorMessage);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (readOnly || busy || state === "generating" || execution) return;
    if (pendingRequest||sessionStorage.getItem(pendingKey)) {
      setState("uncertain");
      setMessage("Comprueba primero la solicitud pendiente.");
      return;
    }
    setState("generating");
    setMessage("");
    try {
      if (!(await before())) {
        throw new Error("Guarda la consulta antes de continuar.");
      }
      const fresh = await clinicalInterventions(consultationId, revision);
      setWorkspace(fresh);
      if (!fresh.pes || !(fresh.objective?.smart_plan || fresh.planningObjective?.smart_plan)) {
        throw new Error(
          "Para una propuesta vinculada necesitas un PES aprobado y al menos un objetivo guardado. También puedes escribir una estrategia manual o continuar sin estrategias.",
        );
      }
      const key = crypto.randomUUID();
      sessionStorage.setItem(pendingKey, key);
      setPendingRequest(key);
      if(checkpoints&&!await checkpoints.flush())throw new Error('Guarda el avance antes de solicitar una nueva propuesta.');
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
      setPendingRequest(null);checkpoints?.set('handled:intervention_strategy',result.generationId);
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
      if (!uncertain) {sessionStorage.removeItem(pendingKey);setPendingRequest(null);}
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
    const key = pendingRequest||sessionStorage.getItem(pendingKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if(result?.status==='succeeded'&&checkpoints){await checkpoints.refresh();setMessage('Recuperando las propuestas guardadas.');return;}
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(pendingKey);
        setPendingRequest(null);
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
  const planningObjective=workspace?.objective??workspace?.planningObjective;
  const eligible = strategyContextEligible(workspace);
  const canEdit = !readOnly && !workspace?.archived;
  const selectedId = execution?.id ?? (activeId && ids.includes(activeId) ? activeId
    : ids.find(id => items.find(item => item.id === id)?.state !== 'withdrawn') ?? ids[0]);
  const approvalContextMessage = !workspace?.pes
    ? "Primero revisa y aprueba el diagnóstico PES."
    : "Aprueba los objetivos SMART vinculados a este PES.";
  function requestDraftAction(id: string, action: StrategyDraftAction) {
    setDraftAction({ id, action });
    setActionError("");
  }
  function cancelDraftAction() {
    if (actionBusy || busy) return;
    setDraftAction(null);
  }
  async function confirmDraftAction(reason: string) {
    if (!draftAction || actionBusy || busy) return;
    const { id, action } = draftAction;
    const item = items.find(entry => entry.id === id);
    const document = local[id]?.document ?? item?.draft ?? item?.approved?.document;
    if (!document && action === "clear") return;
    setActionBusy(true);
    setActionError("");
    try {
      if (action === "clear") {
        if (!document) return;
        edit(id, {
          version: 1,
          pesApprovedAt: document.pesApprovedAt,
          objectiveApprovedAt: document.objectiveApprovedAt,
          strategy: { ...emptyStrategy(), category: document.strategy.category, priority: document.strategy.priority },
        }, null);
        if (checkpoints && !await checkpoints.flush()) {
          setActionError("Los campos se limpiaron en esta pantalla, pero falta guardar el cambio. Reintenta antes de salir.");
          return;
        }
        setDraftAction(null);
        setActiveId(id);
        setMessage("Campos limpios. La tarjeta se conserva como borrador para completar después.");
        return;
      }
      if ((action === "delete" && item) || action === "withdraw" || (action === "discard" && item?.approved && item.draft)) {
        if (!await mutate(id, action === "discard" ? "revert" : action, action === "withdraw" ? { reason } : {})) return;
      } else {
        discardLocal(id);
        if (checkpoints && !await checkpoints.flush()) {
          setActionError("El cambio está en esta pantalla, pero falta guardarlo. Reintenta antes de salir.");
          return;
        }
        setMessage(action === "delete" ? "Borrador eliminado." : "Cambios descartados.");
      }
      setDraftAction(null);
      setEditingId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos guardar el cambio. Reintenta antes de salir.");
    } finally {
      setActionBusy(false);
    }
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
            Cada estrategia se aprueba por separado. Basta con su nombre, una
            acción concreta y al menos un objetivo aprobado vinculado. Los demás
            detalles son opcionales.
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
            {planningObjective?.smart_plan?.goals.map((g, i) => (
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
      {canEdit && (
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
              className="strategy-generate-button"
              state={state}
              disabled={busy || execution !== null ||
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
      {canEdit && state === "uncertain" && (
        <button
          type="button"
          className="nuth-button-secondary mt-3 !text-xs"
          onClick={() => void checkRequest()}
        >
          Comprobar solicitud
        </button>
      )}
      {canEdit && !!proposals.length && (
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
              {doc.generationId === batch.proposal?.generationId && batch.proposal?.output.batchBasis === 'template' &&
                <p className="clinical-notice">Plantilla general de valoración. Adáptala a esta consulta.</p>}
              {doc.generationId === batch.proposal?.generationId && batch.proposal?.output.batchBasis === 'assessment' &&
                <p className="clinical-notice">Borrador de valoración basado en los datos disponibles.</p>}
              {doc.generationId === batch.proposal?.generationId && batch.stale &&
                <p role="status" className="clinical-notice is-warning">Cambió un paso anterior. Revisa o regenera esta estrategia desde Datos.</p>}
              {doc.generationId === batch.proposal?.generationId && !batch.stale && !strategyIsLinked(linkBatchStrategy(doc), workspace) &&
                <p className="mt-2 text-xs">Revisa la acción y vincúlala con los objetivos aprobados antes de aprobar esta estrategia. Si cambió el objetivo, también puedes pedir una propuesta nueva.</p>}
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
              <StrategyProposalSources strategy={doc.strategy} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nuth-button-secondary !text-xs"
                  disabled={busy || execution !== null || ids.length >= 30 ||
                    (doc.generationId === batch.proposal?.generationId && batch.stale)}
                  onClick={() => {
                    add(linkBatchStrategy(doc));
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
      {message && <p role="status" className="strategy-workspace-message">{message}</p>}
      <div className={`clinical-strategy-list${canEdit && ids.length > 1 ? ' strategy-editor-layout' : ''}`}>
        {canEdit && ids.length > 1 && <nav aria-label="Estrategias de esta consulta" className="strategy-selector">
          {ids.map(id => {
            const item = items.find(entry => entry.id === id);
            const document = (item?.state === 'withdrawn' ? item.approved?.document : null) ?? local[id]?.document ?? item?.draft ?? item?.approved?.document;
            if (!document) return null;
            return <button key={id} type="button" aria-pressed={selectedId === id} disabled={busy || !!execution} onClick={() => {
              setActiveId(id);
              setEditingId(null);
              setMessage('');
            }}>
              <strong>{document.strategy.title || 'Nueva estrategia'}</strong>
              <span>{item?.state === 'withdrawn' ? 'Retirada' : `Prioridad ${document.strategy.priority}`}</span>
            </button>;
          })}
        </nav>}
        {(canEdit ? (selectedId ? [selectedId] : []) : ids).map((id) => {
          const item = items.find((item) => item.id === id),
            document = (item?.state === "withdrawn" ? item.approved?.document : null) ?? local[id]?.document ?? item?.draft ??
              item?.approved?.document;
          if (!document) return null;
          const s = document.strategy, editing = item?.state !== "withdrawn" && (!!local[id] || !!item?.draft);
          const current = !workspace?.archived && !!item?.approved &&
            !item.requiresReview && !local[id] &&
            ["approved", "executing"].includes(item.state);
          const linked = strategyIsLinked(document, workspace);
          const rawText = currentEditorText(local[id]);
          const readyToApprove = linked && !strategyIssues(s).length && (rawText === undefined || 'fields' in readStrategyEditorText(rawText));
          const inline = canEdit && item?.state !== 'withdrawn';
          const editable = editing || !!item?.requiresReview || editingId === id;
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
              id={`strategy-card-${id}`}
              tabIndex={-1}
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
                  {item?.state === "withdrawn"
                    ? "Retirada"
                    : editing && item?.approved
                    ? "Cambios pendientes de aprobar"
                    : item?.requiresReview
                    ? "Requiere revisión"
                    : editing
                    ? readyToApprove ? "Lista para aprobar" : !eligible ? workspace?.pes ? 'Falta aprobar objetivos' : 'Falta aprobar PES' : "Borrador · faltan requisitos"
                    : stateLabels[item?.state ?? "draft"]}
                </ClinicalStatusBadge>
              </header>
              {!inline && <p className="clinical-strategy-summary-action">
                {s.action || "Define qué se hará con la persona."}
              </p>}
              {!inline && <dl className="clinical-goal-summary-facts">
                {(s.responsible || editing) && <div>
                  <dt>Responsable previsto</dt>
                  <dd>{s.responsible || "Por definir"}</dd>
                </div>}
                {(s.reviewAt || editing) && <div>
                  <dt>Revisión</dt>
                  <dd>{s.reviewAt || "Por definir"}</dd>
                </div>}
              </dl>}
              {inline && <InterventionStrategyEditor
                document={document} workspace={workspace} text={rawText} busy={busy || !!execution}
                editable={editable} hasDraft={editing || !!item?.requiresReview} linked={linked} prerequisite={eligible ? undefined : approvalContextMessage}
                onEdit={() => setEditingId(id)} onCancelEdit={() => setEditingId(null)} onText={text => editText(id, document, text)}
                onChange={next => edit(id, next)} onSave={() => void mutate(id, 'save')} onApprove={() => void mutate(id, 'approve')}
                onReviewPrerequisite={props.onReviewPrerequisite ? () => props.onReviewPrerequisite?.(workspace?.pes ? 2 : 1) : undefined}
              />}
              {inline && (editable || (item?.approved && ['approved', 'executing'].includes(item.state))) && <div className="clinical-strategy-card-actions">
                {editable && <>
                  <button type="button" className="clinical-text-action" disabled={busy || execution !== null} onClick={() => requestDraftAction(id, "clear")}><Eraser size={15}/>Limpiar campos</button>
                  {(local[id] && item || item?.approved && item.draft) && <button type="button" className="clinical-text-action" disabled={busy || execution !== null} onClick={() => requestDraftAction(id, "discard")}>Descartar cambios</button>}
                  {!item?.approved && <button type="button" className="clinical-text-action" disabled={busy || execution !== null} onClick={() => requestDraftAction(id, "delete")}><Trash2 size={15}/>Eliminar borrador</button>}
                </>}
                {item?.approved && ["approved", "executing"].includes(item.state) &&
                  <button type="button" className="clinical-text-action" disabled={busy || execution !== null} onClick={() => requestDraftAction(id, "withdraw")}><Trash2 size={15}/>Retirar estrategia</button>}
              </div>}
              {!inline && <details className="clinical-support-details">
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
                  <div>
                    <dt>Acuerdo con la persona</dt>
                    <dd>{s.agreement === "pending"
                      ? "Sin acuerdo registrado"
                      : s.agreement === "patient"
                      ? "Acordado con el paciente"
                      : "Acordado con cuidador o representante"}</dd>
                  </div>
                </dl>
              </details>}
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
                  {canEdit && (
                    <div className="clinical-strategy-execution-actions">
                      {current && onOpenInstructions && (
                        <button
                          type="button"
                          className="nuth-button-secondary !text-xs"
                          disabled={busy || execution !== null}
                          onClick={() => onOpenInstructions()}
                        >
                          Ir a indicaciones
                        </button>
                      )}
                      {current && s.category === "food" && s.route === "oral" &&
                        onOpenWorkshop && (
                        <button
                          type="button"
                          onClick={onOpenWorkshop}
                          disabled={busy || execution !== null}
                          className="nuth-button-secondary !text-xs"
                        >
                          Llevar al Taller de dietas
                        </button>
                      )}
                      {current &&
                        ([
                          "start",
                          "communicate",
                          "complete",
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
      {draftAction && <InterventionStrategyActionDialog
        key={`${draftAction.id}:${draftAction.action}`}
        action={draftAction.action}
        strategyTitle={(local[draftAction.id]?.document ?? items.find(item => item.id === draftAction.id)?.draft ?? items.find(item => item.id === draftAction.id)?.approved?.document)?.strategy.title ?? ""}
        busy={busy || actionBusy}
        error={actionError}
        onCancel={cancelDraftAction}
        onConfirm={reason => void confirmDraftAction(reason)}
      />}
      {!ids.length && (
        <p className="mt-5 text-sm text-[var(--nuth-muted)]">
          Aún no hay estrategias registradas en esta revisión.
        </p>
      )}
    </section>
  );
}
