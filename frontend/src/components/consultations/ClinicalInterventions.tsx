import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronRight,
  Ellipsis,
  Eraser,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ClinicalTaskStatus } from "./ClinicalTaskCard";
import { InterventionStrategyEditor } from "./InterventionStrategyEditor";
import { ClinicalTaskDialog } from "./ClinicalTaskDialog";
import { InterventionStrategyActionDialog, type StrategyDraftAction } from "./InterventionStrategyActionDialog";
import {useConsultationDraft,useConsultationDraftContext,useDurableAIProposal} from './ConsultationDrafts';
import { useClinicalBatchProposal } from './ClinicalBatchAI';
import { objectiveFields, type ObjectiveGoal } from '../../../../supabase/functions/_shared/objectives';
import {changedAnswers} from '@/src/features/consultations/answerAutosave';
import {formatStrategyEditorText, readStrategyEditorText, upgradeStrategyEditorText} from '@/src/features/consultations/strategyEditorText';
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
  mergeRepeatedStrategyProposals,
  strategyCategories,
  type StrategyDocument,
  strategyFields,
  strategyIssues,
} from "../../../../supabase/functions/_shared/interventions";
import {
  strategyContextEligible,
  strategyDocumentForWorkspace,
  strategyIsLinked,
  strategyLabels,
} from "./InterventionStrategyForm";

type LocalDraft = {
  document: StrategyDocument;
  expectedUpdatedAt: string | null;
  text?: string;
  textVersion?: 2;
  fromProposal?: boolean;
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
  const recoveredDrafts = useRef(local);
  useEffect(() => {
    if (!checkpoints || !Object.keys(recoveredDrafts.current).length) return;
    const recovered = recoveredDrafts.current;
    recoveredDrafts.current = {};
    if (!Object.hasOwn(checkpoints.values, 'strategies')) setLocal(recovered);
  }, [checkpoints, setLocal]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [state, setState] = useState<AIState>(() =>
    (pendingRequest||sessionStorage.getItem(pendingKey)) ? "uncertain" : "idle"
  );
  const [proposals, setProposals] = useConsultationDraft<StrategyDocument[]>('strategy-proposals',[]),
    [feedback, setFeedback] = useConsultationDraft('strategy-feedback',"");
  const [alternatives, setAlternatives] = useConsultationDraft<Record<string, StrategyDocument>>('strategy-alternatives', {});
  const [generationDialog, setGenerationDialog] = useState<'group' | string | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [generationMessage, setGenerationMessage] = useState('');
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [editorError, setEditorError] = useState('');
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAction, setDraftAction] = useState<{ id: string; action: StrategyDraftAction } | null>(null);
  const [actionBusy, setActionBusy] = useState(false), [actionError, setActionError] = useState("");
  useDurableAIProposal('intervention_strategy',(output)=>{
    if (readOnly) return;
    const documents=output.strategies;
    if(!Array.isArray(documents)||!documents.every(isStrategyDocument))return;
    if (typeof output.strategyRevisionId === 'string') {
      const id = output.strategyRevisionId;
      if (documents.length === 1) setAlternatives(current => ({...current, [id]: documents[0]}));
      setMessage(documents.length ? 'Alternativa de estrategia recuperada para revisar.' : 'La solicitud terminó sin una alternativa utilizable.');
    } else {
      setProposals(documents);
      setMessage('Propuestas recuperadas para revisión.');
    }
    setState('ready');setPendingRequest(null);sessionStorage.removeItem(pendingKey);
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
    recoveredDrafts.current = {};
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
        ...(local[id]?.fromProposal ? { fromProposal: true } : {}),
        ...(typeof text === 'string' ? { text, textVersion: 2 } : {}),
        expectedUpdatedAt: local[id]
          ? local[id].expectedUpdatedAt
          : item?.updated_at ?? null,
      },
    });
    setEditorError("");
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
    setDrafts({ ...local, [id]: { document: next, expectedUpdatedAt: null, ...(document ? { fromProposal: true } : {}) } });
    setActiveId(id);
    setEditorError('');
  }
  function linkBatchStrategy(document: StrategyDocument): StrategyDocument {
    if (!document.objectiveApprovedAt.startsWith('draft:') || document.generationId !== batch.proposal?.generationId) return document;
    const objective = workspace?.objective;
    const goals = objective?.smart_plan?.goals ?? [];
    const indexes = document.strategy.goalIndexes.map(index => {
      const generated = batchGoals?.[index]?.goal;
      const matches = goals.flatMap((goal, currentIndex) => generated &&
        objectiveFields.every(field => field === 'timeframe' || goal[field] === generated[field]) ? [currentIndex] : []);
      return matches.length === 1 ? matches[0] : -1;
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
  function discardAlternative(id: string) {
    setAlternatives(current => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
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
    setEditorError('');
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
      if (['delete', 'withdraw'].includes(action)) discardAlternative(id);
      if (['save', 'approve', 'delete', 'withdraw'].includes(action)) setActiveId(null);
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
      if (draftAction?.id === id) setActionError(errorMessage);
      else setEditorError(errorMessage);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (readOnly || busy || state === "generating" || execution) return;
    const id = generationDialog === 'group' ? null : generationDialog;
    const previous = id ? documentFor(id) : null;
    if (id && !previous) return;
    if (pendingRequest||sessionStorage.getItem(pendingKey)) {
      setState("uncertain");
      setGenerationMessage("Comprueba primero la solicitud pendiente.");
      return;
    }
    setState("generating");
    setGenerationMessage("");
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
        strategyFeedback: (id ? revisionFeedback : feedback).trim() || undefined,
        ...(id && previous ? { strategyRevision: { id, title: previous.strategy.title, action: previous.strategy.action, method: previous.strategy.method } } : {}),
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setGenerationMessage(
          "Comprueba el estado de la solicitud antes de volver a generar.",
        );
        return;
      }
      const output = result.output as { strategies?: unknown; strategyRevisionId?: unknown };
      const documents = output.strategies;
      if (
        !Array.isArray(documents) || documents.length > (id ? 1 : 3) ||
        (!!id && output.strategyRevisionId !== id) ||
        !documents.every(isStrategyDocument)
      ) {
        throw new Error(
          "La propuesta de IA llegó incompleta o con datos incompatibles. No se pudo abrir para revisión. Puedes continuar manualmente o contactar a soporte.",
        );
      }
      sessionStorage.removeItem(pendingKey);
      setPendingRequest(null);checkpoints?.set('handled:intervention_strategy',result.generationId);
      setState("ready");
      if (id && documents.length) {
        setAlternatives(current => ({ ...current, [id]: documents[0] }));
        setComparisonId(id);
      } else if (!id && documents.length) {
        setProposals(documents);
      }
      if (!documents.length) {
        setGenerationMessage('No hubo información suficiente para proponer una estrategia específica. Puedes ajustar tus indicaciones o continuar con la versión actual.');
        return;
      }
      setGenerationDialog(null);
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
      setGenerationMessage(
        error instanceof Error ? error.message : "No pudimos generar.",
      );
    }
  }
  async function checkRequest() {
    const key = pendingRequest||sessionStorage.getItem(pendingKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if(result?.status==='succeeded'&&checkpoints){await checkpoints.refresh();setGenerationDialog(null);setMessage('Recuperando las propuestas guardadas.');return;}
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(pendingKey);
        setPendingRequest(null);
        setState("idle");
        (generationDialog ? setGenerationMessage : setMessage)(
          result?.status === "succeeded"
            ? "La solicitud terminó; la propuesta no está disponible en esta sesión. Otra generación puede consumir nuevos créditos."
            : "Solicitud resuelta. Puedes continuar manualmente o generar otra propuesta.",
        );
      } else (generationDialog ? setGenerationMessage : setMessage)("La solicitud sigue pendiente.");
    } catch (error) {
      (generationDialog ? setGenerationMessage : setMessage)(
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
  const selectedId = execution?.id ?? activeId;
  function documentFor(id: string) {
    const item = items.find(entry => entry.id === id);
    if (item?.state === 'withdrawn') return item.approved?.document ?? item.draft;
    return local[id]?.document ?? item?.draft ?? item?.approved?.document;
  }
  function openEditor(id: string) {
    setActiveId(id);
    setEditingId(null);
    setEditorError('');
    setMessage('');
  }
  function openGeneration(id: 'group' | string) {
    setRevisionFeedback('');
    setGenerationMessage('');
    setGenerationDialog(id);
  }
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
        discardAlternative(id);
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
        setMessage(action === "delete" ? "Borrador eliminado." : action === 'discardProposal' ? 'Propuesta descartada.' : "Cambios descartados.");
      }
      discardAlternative(id);
      setDraftAction(null);
      setEditingId(null);
      if (action !== 'discard') setActiveId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No pudimos guardar el cambio. Reintenta antes de salir.");
    } finally {
      setActionBusy(false);
    }
  }
  const selectedDocument = selectedId ? documentFor(selectedId) : null;
  const comparison = comparisonId ? alternatives[comparisonId] : undefined;
  const comparisonBase = comparisonId ? documentFor(comparisonId) : null;
  const proposalIsStale = (document: StrategyDocument) =>
    !!batchProposal && document.generationId === batchProposal.generationId && batch.stale;
  const visibleProposals = mergeRepeatedStrategyProposals(proposals);
  const contextReady = !!workspace?.pes && !!planningObjective?.smart_plan?.goals.length;
  function displayState(id: string, document: StrategyDocument) {
    const item = items.find(entry => entry.id === id);
    const raw = currentEditorText(local[id]);
    if (item?.state === 'withdrawn') return { label: 'Retirada', tone: 'inactive' };
    if (local[id]?.fromProposal) return { label: 'Propuesta de IA', tone: 'proposal' };
    if (item?.requiresReview || (item?.approved && (item.draft || local[id]))) {
      return { label: 'Por revisar', tone: 'draft' };
    }
    if (item?.approved) return { label: stateLabels[item.state], tone: 'approved' };
    const ready = strategyIsLinked(document, workspace) && !strategyIssues(document.strategy).length &&
      (raw === undefined || 'fields' in readStrategyEditorText(raw));
    return { label: ready ? 'Lista para aprobar' : 'Borrador', tone: 'draft' };
  }

  return (
    <section className="clinical-strategies-workspace clinical-objectives-workspace" aria-label="Estrategias de intervención">
      {canEdit && <div className="strategy-toolbar">
        <AIButton capability="ai.consultation_support" className="strategy-generate-button" state={state}
          disabled={!workspace || busy || !!execution || ids.length >= 30}
          onClick={() => openGeneration('group')}>Proponer estrategias con IA</AIButton>
        <button type="button" className="nuth-button-secondary" disabled={!workspace || busy || !!execution || ids.length >= 30}
          onClick={() => add()}><Plus size={16} aria-hidden="true" />Crear estrategia</button>
        {state === 'uncertain' && <button type="button" className="clinical-text-action" onClick={() => void checkRequest()}>
          Comprobar solicitud
        </button>}
      </div>}
      {message && <p role="status" className="strategy-workspace-message">{message}</p>}
      {!workspace && message && <button type="button" className="clinical-text-action mt-2" onClick={() => void refresh()}>Reintentar carga</button>}
      {!workspace && !message && <p role="status" className="strategy-workspace-message">Cargando estrategias…</p>}
      {workspace && !ids.length && (!canEdit || !visibleProposals.length) &&
        <p className="strategy-empty">Aún no hay estrategias en esta consulta.</p>}
      <div className="clinical-strategy-list">
        {canEdit && visibleProposals.map((document, index) => <StrategyCard key={`proposal:${document.generationId}:${index}`}
          document={document} status="Propuesta de IA" tone="proposal" disabled={busy || !!execution || ids.length >= 30}
          onOpen={() => {
            const linked = linkBatchStrategy(document);
            add(proposalIsStale(document) ? { ...linked, objectiveApprovedAt: '', strategy: { ...linked.strategy, goalIndexes: [] } } : linked);
            setProposals(visibleProposals.filter((_, i) => i !== index));
          }} />)}
        {ids.map(id => {
          const document = documentFor(id);
          if (!document) return null;
          const state = displayState(id, document);
          return <StrategyCard key={id} document={document} status={state.label} tone={state.tone}
            hasAlternative={!!alternatives[id]} disabled={busy || !!execution}
            onOpen={() => openEditor(id)} />;
        })}
      </div>
      {workspace?.pes && <details className="clinical-support-details strategy-context">
        <summary>PES y objetivos de referencia</summary>
        <p className="mt-2 whitespace-pre-line">{workspace.pes.pesStatement}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {planningObjective?.smart_plan?.goals.map((goal, index) => <li key={index}>{goal.outcome}</li>)}
        </ol>
        {canEdit && <button type="button" className="clinical-text-action mt-3" disabled={busy || !!execution} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />Actualizar contexto
        </button>}
      </details>}
      {selectedId && selectedDocument && !generationDialog && !comparisonId && (() => {
        const id = selectedId, document = selectedDocument, s = document.strategy;
        const item = items.find(entry => entry.id === id);
        const inline = canEdit && item?.state !== 'withdrawn' && item?.state !== 'completed';
        const editing = !!local[id] || !!item?.draft || !!item?.requiresReview;
        const editable = inline && (editing || editingId === id);
        const current = !workspace?.archived && !!item?.approved && !item.requiresReview && !local[id] &&
          ['approved', 'executing'].includes(item.state);
        const badge = displayState(id, document);
        return <InterventionStrategyEditor key={id}
          document={document} workspace={workspace} text={currentEditorText(local[id])}
          busy={busy} editable={editable} canEdit={inline && !execution} hasDraft={editing}
          linked={strategyIsLinked(document, workspace)} prerequisite={eligible ? undefined : approvalContextMessage}
          status={<span className="strategy-state" data-tone={badge.tone}>{badge.label}</span>} error={editorError}
          onClose={() => { setActiveId(null); setEditingId(null); setExecution(null); }}
          onEdit={() => setEditingId(id)} onCancelEdit={() => setEditingId(null)}
          onText={text => editText(id, document, text)} onChange={next => edit(id, next)}
          onSave={() => void mutate(id, 'save')} onApprove={() => void mutate(id, 'approve')}
          onReviewPrerequisite={props.onReviewPrerequisite ? () => {
            setActiveId(null); props.onReviewPrerequisite?.(workspace?.pes ? 2 : 1);
          } : undefined}
          actions={inline && !execution && <details className="strategy-more-actions">
            <summary><Ellipsis size={17} aria-hidden="true" />Más acciones</summary>
            <div className="clinical-strategy-card-actions">
              {alternatives[id] && <button type="button" className="clinical-text-action" onClick={() => setComparisonId(id)}>
                Comparar alternativa de IA
              </button>}
              <AIButton capability="ai.consultation_support" className="strategy-generate-button" state={state}
                disabled={busy} onClick={() => openGeneration(id)}>Regenerar con IA</AIButton>
              {editable && <button type="button" className="clinical-text-action"
                disabled={busy} onClick={() => requestDraftAction(id, 'clear')}><Eraser size={15} aria-hidden="true" />Limpiar campos</button>}
              {editable && (local[id] && item || item?.approved && item.draft) && <button type="button" className="clinical-text-action"
                disabled={busy} onClick={() => requestDraftAction(id, 'discard')}>Descartar cambios</button>}
              {!item?.approved && <button type="button" className="clinical-text-action strategy-danger-action"
                disabled={busy} onClick={() => requestDraftAction(id, local[id]?.fromProposal ? 'discardProposal' : 'delete')}>
                <Trash2 size={15} aria-hidden="true" />{local[id]?.fromProposal ? 'Descartar propuesta' : 'Eliminar borrador'}
              </button>}
              {item?.approved && ['approved', 'executing'].includes(item.state) && <button type="button" className="clinical-text-action strategy-danger-action"
                disabled={busy} onClick={() => requestDraftAction(id, 'withdraw')}><Trash2 size={15} aria-hidden="true" />Retirar estrategia</button>}
            </div>
          </details>}>
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

        </InterventionStrategyEditor>;
      })()}
      {generationDialog && <ClinicalTaskDialog open className="strategy-dialog strategy-generation-dialog" showSaveConsultation={false}
        title={generationDialog === 'group' ? 'Proponer estrategias con IA' : 'Regenerar estrategia con IA'}
        description={generationDialog === 'group' ? 'Las propuestas quedarán listas para que las revises.' : documentFor(generationDialog)?.strategy.title}
        busy={state === 'generating'} onClose={() => setGenerationDialog(null)} footer={<>
          <button type="button" className="nuth-button-secondary" disabled={state === 'generating'} onClick={() => setGenerationDialog(null)}>Cancelar</button>
          {state === 'uncertain' ? <button type="button" className="nuth-button" onClick={() => void checkRequest()}>Comprobar solicitud</button> :
            <AIButton capability="ai.consultation_support" className="strategy-generate-button" state={state}
              disabled={!contextReady} onClick={() => void generate()}>
              {generationDialog === 'group' ? 'Generar propuestas' : 'Generar alternativa'}
            </AIButton>}
        </>}>
        <label className="strategy-feedback-label">
          Indicaciones para la IA <span>· opcional</span>
          <textarea className="nuth-input" rows={4} maxLength={600} disabled={state === 'generating' || state === 'uncertain'}
            value={generationDialog === 'group' ? feedback : revisionFeedback}
            onChange={event => (generationDialog === 'group' ? setFeedback : setRevisionFeedback)(event.target.value)}
            placeholder="Por ejemplo, prioriza una acción que la persona pueda practicar con los recursos que ya tiene." />
        </label>
        {!contextReady && <p className="strategy-editor-pending">Aprueba el PES y guarda al menos un objetivo para generar estrategias.</p>}
        {generationMessage && <p role="status" className="strategy-action-error">{generationMessage}</p>}
        <p className="strategy-credit-note">La generación usa créditos según el consumo real.</p>
      </ClinicalTaskDialog>}
      {comparisonId && comparison && comparisonBase && <ClinicalTaskDialog open title="Comparar estrategia" className="strategy-dialog"
        showSaveConsultation={false} onClose={() => setComparisonId(null)} footer={<>
          <button type="button" className="nuth-button-secondary" onClick={() => {
            discardAlternative(comparisonId); setComparisonId(null);
          }}>Conservar versión actual</button>
          <button type="button" className="nuth-button" onClick={() => {
            edit(comparisonId, comparison, null); discardAlternative(comparisonId); setComparisonId(null);
          }}>Usar como borrador</button>
        </>}>
        <div className="strategy-comparison">
          <section><h3>Versión actual</h3><p>{currentEditorText(local[comparisonId]) ?? formatStrategyEditorText(comparisonBase.strategy, false)}</p></section>
          <section><h3>Alternativa de IA</h3><p>{formatStrategyEditorText(comparison.strategy, false)}</p></section>
        </div>
      </ClinicalTaskDialog>}
      {draftAction && <InterventionStrategyActionDialog
        key={`${draftAction.id}:${draftAction.action}`}
        action={draftAction.action}
        strategyTitle={documentFor(draftAction.id)?.strategy.title ?? ''}
        busy={busy || actionBusy}
        error={actionError}
        onCancel={cancelDraftAction}
        onConfirm={reason => void confirmDraftAction(reason)}
      />}
    </section>
  );
}

function StrategyCard({ document, status, tone, hasAlternative, disabled, onOpen }: {
  document: StrategyDocument;
  status: string;
  tone: string;
  hasAlternative?: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  const strategy = document.strategy;
  const id = useId();
  return <article className="clinical-strategy-card" data-tone={tone}>
    <button type="button" className="strategy-card-button" aria-labelledby={`${id}-state ${id}-title`}
      aria-describedby={`${id}-category${hasAlternative ? ` ${id}-alternative` : ''}`} disabled={disabled} onClick={onOpen}>
      <span className="strategy-card-topline">
        <span id={`${id}-state`} className="strategy-state" data-tone={tone}>{tone === 'proposal' && <Sparkles size={13} aria-hidden="true" />}{status}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </span>
      <strong id={`${id}-title`}>{strategy.title || 'Nueva estrategia'}</strong>
      <span id={`${id}-category`} className="strategy-card-meta">{strategyCategories[strategy.category]} · Prioridad {strategy.priority}</span>
      {strategy.action && <span className="clinical-strategy-summary-action">{strategy.action}</span>}
      {hasAlternative && <span id={`${id}-alternative`} className="strategy-state" data-tone="proposal">Alternativa disponible</span>}
    </button>
  </article>;
}
