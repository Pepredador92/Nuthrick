import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  Circle,
  X,
} from "lucide-react";
import {
  ClinicalStatusBadge,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";
import { AIButton } from "@/src/components/ai/AIControls";
import { RecallNarrativeInput } from "./RecallNarrativeInput";
import { ConsultationGuide } from "./ConsultationGuide";
import { CustomFoodForm } from "@/src/components/diet/MenuEditors";
import {
  AIRequestError,
  type AIState,
  getAIGenerationStatus,
  runAIRequest,
} from "@/src/services/ai";
import {
  type ClinicalWorkspace,
  clinicalWorkspace,
  removeClinicalRecall,
  type SavedRecallRecord,
} from "@/src/services/clinicalCopilot";
import { createCustomFood, listFoodItems } from "@/src/services/foodCatalog";
import { foodUnitLabels } from "@/src/features/menu/units";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import {
  calculateRecall,
  canApprovePes,
  canonicalRecallItem,
  composePesStatement,
  matchRecallFoods,
  type PesDraft,
  pesFromAnswers,
  pesStatementMatches,
  pesReviewNotes,
  type RecallRow,
  type RecallSavedItem,
  updatePesParts,
} from "@/src/features/consultations/clinicalCopilot";
import {
  isRecallEstimate,
  type RecallEstimate,
} from "@/src/features/consultations/recallEstimate";
import {
  RecallEstimateReview,
  RecallEstimateSummary,
} from "./RecallEstimateReview";
import type { FoodItem } from "@/src/types/domain";
import {useConsultationDraft,useConsultationDraftContext,useDurableAIProposal} from './ConsultationDrafts';
import { ClinicalBatchStageRevision, useClinicalBatchProposal } from './ClinicalBatchAI';
import { hasUsablePesEtiology } from '../../../../supabase/functions/_shared/pes';
import { PesContextDialog } from './PesContextDialog';
import type { ConsultationSnapshotStructure } from '@/src/types/domain';
import type { PesContextTarget } from '@/src/features/consultations/pesReadiness';
import { formatPesEditorText, parsePesEditorText, pesEtiologyOffset } from '@/src/features/consultations/pesEditorText';
import './PesDiagnosisEditor.css';

type Props = {
  patientId: string;
  consultationId: string;
  revision: number;
  before: () => Promise<boolean>;
  onPes?: (draft: PesDraft) => void;
  onDiscardPes?: () => Promise<boolean>;
  answers?: Record<string, unknown>;
  active?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onStatusChange?: (status: ClinicalTaskStatus) => void;
  onCompleted?: () => void;
  structure?: ConsultationSnapshotStructure;
  onOpenPesTarget?: (target: PesContextTarget) => Promise<boolean>;
};
const input = "nuth-input mt-1 w-full !text-sm";
const secondary = "nuth-button-secondary !text-sm disabled:opacity-50";
function useClinical(props: Props, feature: "pes_diagnosis" | "recall_24h") {
  const checkpoints=useConsultationDraftContext();
  const storageKey = `clinical-pending:${props.consultationId}:${feature}`;
  const [pendingRequest,setPendingRequest]=useConsultationDraft<string|null>(`request:${feature}`,()=>sessionStorage.getItem(storageKey),true);
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [state, setState] = useState<AIState>(() =>
    (pendingRequest||sessionStorage.getItem(storageKey)) ? "uncertain" : "idle"
  );
  const [message, setMessage] = useState("");
  const [generation, setGeneration] = useConsultationDraft<string|undefined>(`generation:${feature}`,undefined);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void clinicalWorkspace(props.consultationId, props.revision)
      .then((w) => {
        if (alive) setWorkspace(w);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [props.consultationId, props.revision, props.active]);
  async function refresh() {
    if (!(await props.before())) {
      throw new Error("Guarda la entrevista antes de continuar.");
    }
    const w = await clinicalWorkspace(props.consultationId, props.revision);
    setWorkspace(w);
    return w;
  }
  async function generate(narrative?: string) {
    if (pendingRequest||sessionStorage.getItem(storageKey)) {
      setState("uncertain");
      setMessage("Comprueba primero la solicitud pendiente.");
      return null;
    }
    setState("generating");
    setMessage("");
    try {
      await refresh();
      const key = crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      setPendingRequest(key);
      if(checkpoints&&!await checkpoints.flush())throw new Error("Guarda el avance antes de solicitar una nueva propuesta.");
      const result = await runAIRequest({
        feature,
        idempotencyKey: key,
        patientId: props.patientId,
        consultationId: props.consultationId,
        revision: props.revision,
        ...(narrative !== undefined ? { narrative } : {}),
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setMessage("Comprueba el estado antes de generar otra propuesta.");
        return null;
      }
      sessionStorage.removeItem(storageKey);
      setPendingRequest(null);checkpoints?.set(`handled:${feature}`,result.generationId);
      setGeneration(result.generationId);
      setState("ready");
      if(result.draftSaved===false)setMessage('La propuesta está disponible en esta pestaña. Guarda el avance antes de salir; no necesitas generarla otra vez.');
      return result.output;
    } catch (e) {
      const uncertain = e instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(e.code);
      if (!uncertain) {sessionStorage.removeItem(storageKey);setPendingRequest(null);}
      setState(
        uncertain
          ? "uncertain"
          : e instanceof AIRequestError && e.code === "insufficient_credits"
          ? "insufficient"
          : "error",
      );
      setMessage(
        feature === "recall_24h" && e instanceof AIRequestError &&
          e.code === "invalid_output"
          ? "No pudimos obtener una estimación válida. Tu relato sigue aquí; puedes aclarar cantidades y volver a calcular o usar el registro manual."
          : e instanceof Error
          ? e.message
          : "No se pudo generar.",
      );
      return null;
    }
  }
  async function check() {
    const key = pendingRequest||sessionStorage.getItem(storageKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if(result?.status==='succeeded'&&checkpoints){
        const recovered=await checkpoints.refresh();
        const proposal=recovered[`proposal:${feature}`] as {generationId?:string}|undefined;
        setMessage(proposal?.generationId===result.generationId?'Propuesta recuperada. Puedes continuar su revisión.':'La solicitud terminó. Comprueba de nuevo en unos segundos para recuperar la propuesta.');
        return;
      }
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(storageKey);setPendingRequest(null);
        setState("idle");
        setMessage(
          result?.status === "succeeded"
            ? "La solicitud terminó. La propuesta no está disponible en esta sesión; generar otra implica un nuevo consumo."
            : "Solicitud resuelta. Puedes continuar manualmente o volver a generar.",
        );
      } else {
        setMessage(
          "La solicitud sigue pendiente. Puedes continuar manualmente.",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo comprobar.");
    }
  }
  async function approve(kind: "pes" | "recall", payload: object, source?: { generationId?: string }) {
    setSaving(true);
    setMessage("");
    try {
      const w = await refresh();
      await clinicalWorkspace(
        props.consultationId,
        props.revision,
        kind,
        { ...payload, stamp: w.stamp },
        source ? source.generationId : generation,
      );
      setWorkspace(
        await clinicalWorkspace(props.consultationId, props.revision),
      );
      setMessage(kind === "pes" ? "PES aprobado." : "Recordatorio confirmado.");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function removeRecall() {
    setSaving(true);
    setMessage("");
    try {
      const w = await refresh();
      await removeClinicalRecall(props.consultationId, props.revision, w.stamp);
      setWorkspace(
        await clinicalWorkspace(props.consultationId, props.revision),
      );
      setGeneration(undefined);
      setMessage(
        "Recordatorio retirado de esta consulta. Puedes capturarlo de nuevo.",
      );
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No pudimos retirar el recordatorio.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  return {
    removeRecall,
    restoreResult(id:string){setGeneration(id);setPendingRequest(null);sessionStorage.removeItem(storageKey);setState('ready');setMessage('Propuesta recuperada para revisión.');},
    resetPes(keepApproved = false) {
      setGeneration(undefined);
      setMessage(keepApproved ? "Borrador descartado. El PES aprobado se conserva." : "PES descartado y campos limpios.");
      setState((pendingRequest||sessionStorage.getItem(storageKey)) ? "uncertain" : "idle");
      if (keepApproved) return;
      setWorkspace((current) => {
        if (!current) return current;
        const records = { ...current.records };
        delete records.pes;
        return { ...current, records };
      });
    },
    workspace,
    state,
    message,
    setMessage,
    generation,
    setGeneration,
    saving,
    generate,
    approve,
    refresh,
    check,
  };
}
function Feedback({ clinical }: { clinical: ReturnType<typeof useClinical> }) {
  return (
    <>
      {clinical.message && (
        <p role="status" className="mt-3 text-sm text-[var(--nuth-muted)]">
          {clinical.message}
        </p>
      )}
      {clinical.state === "uncertain" && (
        <button
          type="button"
          className={secondary + " mt-2"}
          onClick={() => void clinical.check()}
        >
          Comprobar solicitud
        </button>
      )}
    </>
  );
}
function PesPriorityReview({ notes, approved = false }: { notes: string[]; approved?: boolean }) {
  const review = pesReviewNotes(notes);
  if (!review.priority) return null;
  return (
    <aside aria-label="Prioridad clínica de la propuesta" className={`clinical-notice${review.priorityPending && !approved ? ' is-warning' : ''}`}>
      <h4 className="font-semibold">{approved ? 'Prioridad revisada al aprobar' : review.priorityPending ? 'Prioridad pendiente de revisar' : 'Por qué se propone este problema'}</h4>
      <p className="mt-2">{review.priority}</p>
    </aside>
  );
}
function pesProposalDraft(output: unknown): PesDraft | null {
  if (typeof output !== "object" || output === null) return null;
  const proposal = output as Partial<PesDraft>;
  if (typeof proposal.problem !== "string" || typeof proposal.etiology !== "string" || !Array.isArray(proposal.signsSymptoms)) return null;
  const parts = {
    problem: proposal.problem,
    etiology: proposal.etiology,
    signsSymptoms: proposal.signsSymptoms.filter((sign) => typeof sign === "string"),
  };
  return {
    ...parts,
    pesStatement: composePesStatement(parts),
    evidence: proposal.evidence ?? [],
    missingContext: proposal.missingContext ?? [],
    uncertainties: proposal.uncertainties ?? [],
  };
}

type PesWorkingDraft = PesDraft & { editorText?: string };

function pesEditorValidation(draft: PesDraft) {
  if (!draft.problem.trim()) return 'Identifica el problema.';
  if (draft.problem.length > 500) return 'Resume el problema en 500 caracteres o menos.';
  if (draft.etiology.length > 1500) return 'Resume la etiología en 1500 caracteres o menos.';
  const signs = draft.signsSymptoms.filter(sign => sign.trim());
  if (!signs.length) return 'Registra al menos un signo o síntoma.';
  if (signs.length > 30) return 'Conserva hasta 30 signos o síntomas.';
  if (signs.some(sign => sign.length > 2000)) return 'Resume cada signo o síntoma en 2000 caracteres o menos.';
  if (draft.pesStatement.length > 2000) return 'El enunciado supera 2000 caracteres. Resume los componentes y conserva la evidencia pertinente.';
  if (!draft.pesStatement.trim()) return 'Completa el problema, la etiología y los signos con texto descriptivo.';
  return '';
}

export function PesCopilot(props: Props) {
  const clinical = useClinical(props, "pes_diagnosis");
  const checkpoints = useConsultationDraftContext();
  const [contextIntent, setContextIntent] = useState<'generate' | 'review' | null>(null);
  const [draft, setDraft] = useConsultationDraft<PesWorkingDraft | null>('pes', null);
  const [approvedText, setApprovedText] = useConsultationDraft<{ canonical: string; text: string } | null>('pes-approved-text', null);
  const [replacement, setReplacement] = useConsultationDraft<PesDraft | null>('pes-replacement', null);
  const [previousGeneration, setPreviousGeneration] = useConsultationDraft<string | undefined>('pes-previous-generation', undefined);
  const [edited, setEdited] = useConsultationDraft('pes-edited', false);
  const [action, setAction] = useState<'save' | 'approve' | 'discard' | null>(null);
  const actionLock = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editorId = useId();
  const batch = useClinicalBatchProposal('pes_diagnosis');

  const savedRecord = clinical.workspace?.records.pes;
  const savedDraft = {
    ...pesFromAnswers(props.answers ?? {}),
    evidence: savedRecord?.evidence ?? [],
    missingContext: savedRecord?.missingContext ?? [],
    uncertainties: savedRecord?.uncertainties ?? [],
  };
  const hasSavedParts = !!(savedDraft.problem.trim() || savedDraft.etiology.trim() ||
    savedDraft.signsSymptoms.length || savedDraft.pesStatement.trim());
  const hasApprovedPes = hasSavedParts && !!savedRecord?.approved_at && hasUsablePesEtiology(savedDraft.etiology);
  const availableBatch = batch.proposal && batch.reviewed !== batch.proposal.generationId
    ? batch.proposal : undefined;
  const batchDraft = availableBatch ? pesProposalDraft(availableBatch.output) : null;
  const batchInEditor = !!(batchDraft && !draft && !hasSavedParts && !replacement);
  const current: PesWorkingDraft = draft ?? (batchInEditor && batchDraft ? batchDraft : savedDraft);
  const alternative = replacement ?? (!batchInEditor ? batchDraft : null);
  const generationId = draft ? (replacement ? previousGeneration : clinical.generation)
    : batchInEditor ? availableBatch?.generationId : undefined;
  const showingApproved = hasApprovedPes && !draft;
  const canonicalText = formatPesEditorText(current);
  const text = showingApproved && approvedText?.canonical === canonicalText
    ? approvedText.text : current.editorText ?? canonicalText;
  const organized = current.editorText === undefined || parsePesEditorText(current.editorText) !== null;
  const hasDraft = !!draft || batchInEditor || (hasSavedParts && !showingApproved);
  const status: ClinicalTaskStatus = showingApproved ? 'approved' : hasDraft ? 'progress' : 'pending';
  const generating = clinical.state === 'generating';
  const busy = !!action || generating;
  const editable = !busy && !showingApproved;
  const missingEtiology = !hasUsablePesEtiology(current.etiology);
  const gaps = current.missingContext.filter((value) => value.trim());
  const reviewNotes = pesReviewNotes(current.uncertainties);
  const valid = organized && canApprovePes(current);
  const validation = organized && hasDraft && !missingEtiology ? pesEditorValidation(current) : '';
  const canGuide = !!props.structure && !!props.onOpenPesTarget;
  const { onPendingChange, onStatusChange } = props;

  function focusEditor(offset = 0) {
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(offset, offset);
    });
  }

  function keepDraft(next: PesWorkingDraft) {
    if (!draft && !replacement) {
      clinical.setGeneration(generationId);
      if (batchInEditor && availableBatch) batch.markReviewed(availableBatch.generationId);
    }
    setDraft(next);
  }

  function updateDraft(next: PesWorkingDraft) {
    keepDraft(next);
    setEdited(true);
    clinical.setMessage("");
  }

  function editText(value: string) {
    const parts = parsePesEditorText(value);
    updateDraft({ ...(parts ? updatePesParts(current, parts) : current), editorText: value });
  }

  function restoreProposal(output: unknown, id: string) {
    const proposal = pesProposalDraft(output);
    if (!proposal) return;
    if (hasDraft || showingApproved) {
      if (batchInEditor) keepDraft(current);
      setPreviousGeneration(generationId);
      setReplacement(proposal);
    } else {
      setDraft(proposal);
      setEdited(false);
    }
    clinical.restoreResult(id);
  }

  useDurableAIProposal('pes_diagnosis', restoreProposal);
  const pending = !!(draft || batchInEditor || alternative || busy);
  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  async function saveDraft() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction('save');
    try {
      keepDraft(current);
      const saved = await (checkpoints ? checkpoints.flush() : props.before());
      clinical.setMessage(saved ? 'Borrador guardado.' : 'No pudimos guardar el borrador. Tus cambios siguen aquí.');
    } catch {
      clinical.setMessage('No pudimos guardar el borrador. Tus cambios siguen aquí.');
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  async function approve() {
    if (!valid || actionLock.current) return;
    actionLock.current = true;
    setAction('approve');
    try {
      const { editorText, ...parts } = current;
      const approved = { ...parts, signsSymptoms: parts.signsSymptoms.map((sign) => sign.trim()).filter(Boolean) };
      if (!await clinical.approve('pes', { ...approved, evidenceReviewed: true }, { generationId })) return;
      if (availableBatch?.generationId === generationId && availableBatch) batch.markReviewed(availableBatch.generationId);
      const canonical = formatPesEditorText(approved);
      setApprovedText(editorText !== undefined && editorText !== canonical ? { canonical, text: editorText } : null);
      setDraft(null);
      setEdited(false);
      props.onPes?.(approved);
      await checkpoints?.flush();
      props.onCompleted?.();
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  async function discard() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction('discard');
    clinical.setMessage('');
    try {
      if (!hasApprovedPes && props.onDiscardPes && !(await props.onDiscardPes())) {
        throw new Error();
      }
      if (availableBatch) batch.markReviewed(availableBatch.generationId);
      setDraft(null);
      setReplacement(null);
      setPreviousGeneration(undefined);
      setEdited(false);
      if (!hasApprovedPes) setApprovedText(null);
      clinical.resetPes(hasApprovedPes);
      if (checkpoints && !await checkpoints.flush()) {
        clinical.setMessage('El editor está limpio. Reintenta guardar el avance para confirmar el cambio.');
      }
    } catch {
      clinical.setMessage('No pudimos limpiar el PES guardado. Tu borrador sigue aquí; vuelve a intentarlo.');
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  async function generate() {
    const output = await clinical.generate();
    if (!output) return;
    const next = pesProposalDraft(output);
    if (!next) return;
    if (hasDraft || showingApproved) {
      if (batchInEditor) {
        setDraft(current);
        if (availableBatch) batch.markReviewed(availableBatch.generationId);
      }
      setPreviousGeneration(generationId);
      setReplacement(next);
    } else {
      setEdited(false);
      setDraft(next);
    }
  }

  function chooseAlternative(useNew: boolean) {
    if (!alternative) return;
    if (replacement) {
      if (useNew) {
        setDraft(replacement);
        setEdited(false);
      } else {
        clinical.setGeneration(previousGeneration);
      }
      setPreviousGeneration(undefined);
      setReplacement(null);
    } else if (availableBatch) {
      if (useNew) {
        setDraft(alternative);
        clinical.setGeneration(availableBatch.generationId);
        setEdited(false);
      }
      batch.markReviewed(availableBatch.generationId);
    }
    clinical.setMessage('');
    if (useNew) focusEditor();
  }

  return (
    <section aria-label="Editor del diagnóstico PES" className="clinical-pes-workspace pes-editor">
      {contextIntent && props.structure && props.onOpenPesTarget && <PesContextDialog
        consultationId={props.consultationId} revision={props.revision} structure={props.structure} answers={props.answers ?? {}}
        missingContext={current.missingContext} missingEtiology={hasDraft && missingEtiology}
        intent={contextIntent} before={props.before} onOpenTarget={props.onOpenPesTarget} onGenerate={() => void generate()} onClose={() => setContextIntent(null)} />}
      <header className="pes-editor-header">
        <div className="pes-editor-tools">
          {canGuide && <button type="button" className={secondary} disabled={busy} onClick={() => setContextIntent('review')}>
            Revisar datos para el PES
          </button>}
          <AIButton capability="ai.pes" state={clinical.state} disabled={busy || !clinical.workspace || !!alternative}
            onClick={() => canGuide ? setContextIntent('generate') : void generate()}>
            {hasDraft || showingApproved ? 'Otra propuesta' : 'Generar borrador'}
          </AIButton>
        </div>
      </header>
      {generating && <p role="status" className="clinical-notice">Analizando la información de la consulta…</p>}
      {alternative && <aside className="pes-editor-alternative">
        <h3>Nueva propuesta de IA</h3>
        <p className="pes-editor-alternative-text">{formatPesEditorText(alternative)}</p>
        <div className="pes-editor-tools">
          <button type="button" className="nuth-button !text-sm" disabled={busy} onClick={() => chooseAlternative(true)}>Usar propuesta de IA</button>
          <button type="button" className={secondary} disabled={busy} onClick={() => chooseAlternative(false)}>Conservar anterior</button>
        </div>
      </aside>}
      <div className="pes-editor-content" data-approved={showingApproved || undefined}>
        <div className="pes-editor-title">
          <label htmlFor={editorId}>Texto del diagnóstico PES</label>
          <ClinicalStatusBadge status={status}>
            {showingApproved ? 'PES aprobado' : !hasDraft ? 'Sin empezar'
              : generationId ? (draft && edited ? 'Borrador de IA editado' : 'Borrador de IA') : 'Borrador manual'}
          </ClinicalStatusBadge>
        </div>
        {!showingApproved && <p id={`${editorId}-hint`} className="pes-editor-hint">
          Escribe debajo de cada encabezado. Registra los signos y síntomas uno por línea.
        </p>}
        <textarea
          id={editorId}
          ref={editor}
          className="nuth-input pes-editor-text"
          rows={Math.max(9, Math.min(text.split('\n').length + 2, 18))}
          readOnly={!editable}
          aria-describedby={showingApproved ? undefined : `${editorId}-hint`}
          aria-invalid={hasDraft && !valid ? true : undefined}
          value={text}
          onChange={event => editText(event.target.value)}
        />
        {!organized && <p className="clinical-notice is-warning">
          Conserva los encabezados Problema, Etiología y Signos y síntomas, en ese orden y en líneas separadas.
        </p>}
        {organized && hasDraft && missingEtiology && <div className="clinical-notice is-warning">
          <p>{current.problem.trim() ? 'La causa sigue pendiente. Completa la etiología cuando puedas sustentarla.'
            : 'Información insuficiente para proponer un PES. Identifica el problema y su causa antes de aprobarlo.'}</p>
          {gaps.length > 0 && <ul>{gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>}
          <button type="button" className="clinical-text-action" disabled={!editable} onClick={() => focusEditor(pesEtiologyOffset(text))}>Ir a Etiología <ArrowRight size={16} aria-hidden="true" /></button>
        </div>}
        {organized && hasDraft && !pesStatementMatches(current) && <div className="clinical-notice is-warning">
          <p>El enunciado guardado difiere de los componentes actuales.</p>
          <button type="button" className={secondary} disabled={!editable} onClick={() => updateDraft({ ...current, pesStatement: composePesStatement(current) })}>
            Actualizar enunciado con P, E y S
          </button>
        </div>}
        {validation && <p className="clinical-notice is-warning">{validation}</p>}
        {organized && current.pesStatement && !missingEtiology && <details className="clinical-support-details pes-editor-statement">
          <summary>{showingApproved ? 'Enunciado aprobado' : 'Ver enunciado PES'}</summary>
          <p>{current.pesStatement}</p>
        </details>}

        <details className="clinical-support-details pes-editor-sources">
          <summary>{showingApproved ? 'Fuentes y observaciones' : 'Fuentes, datos faltantes e incertidumbres'}
            {!showingApproved && gaps.length > 0 && <span className="clinical-detail-count">{gaps.length} por confirmar</span>}
          </summary>
          <PesPriorityReview notes={current.uncertainties} approved={showingApproved} />
          {current.evidence.length > 0 ? <ul className="consultation-context-facts">
            {current.evidence.map((item, index) => <li key={index}><strong>{item.source}</strong><p>{item.finding}</p></li>)}
          </ul> : <p>Consulta la revisión clínica para contrastar las fuentes que sustentan el diagnóstico.</p>}
          {(hasDraft || showingApproved) && (['missingContext', 'uncertainties'] as const).map((key) => (
            <label key={key} className="clinical-goal-field mt-4">
              <span>{key === 'missingContext' ? 'Datos faltantes' : 'Incertidumbres y otros hallazgos'}</span>
              <textarea className="nuth-input" readOnly={!editable} rows={3}
                value={(key === 'uncertainties' ? reviewNotes.notes : current[key]).join('\n')}
                onChange={(event) => updateDraft({
                  ...current,
                  [key]: key === 'uncertainties' && reviewNotes.priorityEntry
                    ? [reviewNotes.priorityEntry, ...event.target.value.split('\n')]
                    : event.target.value.split('\n'),
                })} />
            </label>
          ))}
          <div className="clinical-readiness" aria-label="Información disponible">
            {([['interview', 'Entrevista'], ['objective', 'Objetivo'], ['anthropometry', 'Antropometría'], ['laboratories', 'Laboratorios']] as const).map(([key, label]) => {
              const available = clinical.workspace?.readiness[key];
              const Icon = available ? Check : Circle;
              return <span key={key}><Icon size={13} aria-hidden="true" />{label}{available ? ' disponible' : ' sin registrar'}</span>;
            })}
          </div>
        </details>

        <footer className="pes-editor-footer">
          {showingApproved ? <button type="button" className={secondary} disabled={busy} onClick={() => {
            keepDraft({ ...savedDraft, editorText: text });
            setEdited(false);
            focusEditor();
          }}>Editar PES aprobado</button> : <>
            <p>{valid ? 'Al aprobar confirmas que revisaste el diagnóstico y sus fuentes.' : 'Puedes guardar el borrador y completar los campos pendientes después.'}</p>
            <div className="pes-editor-tools">
              {hasDraft && <button type="button" className="pes-editor-discard" disabled={busy} onClick={() => void discard()}>
                {action === 'discard' ? 'Limpiando…' : hasApprovedPes ? 'Descartar borrador' : 'Descartar y limpiar'}
              </button>}
              <button type="button" className={secondary} disabled={busy || !hasDraft} onClick={() => void saveDraft()}>
                {action === 'save' ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button type="button" className="nuth-button !text-sm" disabled={busy || !!replacement || !valid} onClick={() => void approve()}>
                {action === 'approve' ? 'Aprobando…' : 'Aprobar PES'}
              </button>
            </div>
          </>}
        </footer>
        <Feedback clinical={clinical} />
      </div>
      {batch.proposal && props.active !== false && <ClinicalBatchStageRevision feature="pes_diagnosis"
        patientId={props.patientId} consultationId={props.consultationId} revision={props.revision} blocked={busy || clinical.state === 'uncertain'} before={props.before} />}
    </section>
  );
}

export function RecallTotals({
  items,
  target,
  provisional = false,
}: {
  items: RecallSavedItem[];
  target?: ClinicalWorkspace["target"];
  provisional?: boolean;
}) {
  const result = calculateRecall(items);
  return <section className="recall-totals" aria-label="Resumen nutricional del recordatorio">
    <div className="recall-nutrient-grid">
      <div><small>Energía estimada</small><strong>{result.total.energy_kcal.toFixed(0)} <span>kcal</span></strong></div>
      <div><small>Proteína</small><strong>{result.total.protein_g.toFixed(1)} <span>g</span></strong></div>
      <div><small>Carbohidratos</small><strong>{result.total.carbohydrate_g.toFixed(1)} <span>g</span></strong></div>
      <div><small>Grasas</small><strong>{result.total.fat_g.toFixed(1)} <span>g</span></strong></div>
    </div>
    <div className="mt-4" aria-label="Distribución de macronutrientes">
      <div className="recall-macro-bar" aria-hidden="true">{result.macros.map(macro => <span key={macro.code} style={{ width: `${macro.percentage ?? 0}%`, backgroundColor: macro.color }} />)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{result.macros.map(macro => <li key={macro.code}>{macro.label}: {macro.percentage === null ? 'Sin datos' : `${macro.percentage.toFixed(1)} %`}</li>)}</ul>
    </div>
    <p>{provisional ? 'Estimación preliminar. Confirma cada alimento y su cantidad para guardar el recordatorio.' : 'Estimación por equivalentes del catálogo, con los alimentos revisados.'}</p>
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-semibold">Ver distribución por comidas y equivalentes</summary>
      <ul className="mt-3 space-y-1">{result.meals.map(meal => <li key={meal.mealLabel}>{meal.mealLabel}: {meal.energy_kcal.toFixed(0)} kcal · {meal.energyPercent.toFixed(0)} %</li>)}</ul>
      <p className="mt-3">Porcentajes de macros calculados con factores 4/4/9.</p>
      {result.groups.length > 0 && <ul className="mt-3 space-y-1">{[...new Set(result.groups.map(group => group.group_code))].map(code => <li key={code}>{getExchangeGroup(code).shortName}: {result.groups.filter(group => group.group_code === code).reduce((n, group) => n + group.portions, 0).toFixed(2)} equivalentes</li>)}</ul>}
    </details>
    {target?.energy_kcal && <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-semibold">Comparar con el plan de esta consulta</summary>
      <p className="mt-3">Objetivo del plan: {target.energy_kcal} kcal{target.protein_g != null ? ` · Proteína ${Number(target.protein_g).toFixed(1)} g` : ''}{target.carbohydrate_g != null ? ` · Carbohidratos ${Number(target.carbohydrate_g).toFixed(1)} g` : ''}{target.fat_g != null ? ` · Grasa ${Number(target.fat_g).toFixed(1)} g` : ''}. Comparación informativa, sin clasificación automática.</p>
    </details>}
  </section>;
}

export function ConfirmedRecall({
  record,
}: {
  record: SavedRecallRecord;
}) {
  if (record.method === 'ai_estimate' && record.estimate && isRecallEstimate(record.estimate)) return <div className="mt-4 text-sm">
    <h4 className="font-semibold">Recordatorio confirmado · Estimación con IA revisada</h4>
    <RecallEstimateSummary estimate={record.estimate} />
    <details className="mt-3"><summary>Texto registrado</summary><p className="mt-2 whitespace-pre-wrap">{record.narrative}</p></details>
  </div>;
  return (
    <div className="mt-4 text-sm">
      <h4 className="font-semibold">Recordatorio confirmado</h4>
      <div className="recall-meal-list">
      {[...new Set(record.items.map((i) => i.mealLabel))].map((meal) => (
        <div key={meal}>
          <h5>{meal}</h5>
          <ul>
            {record.items
              .filter((i) => i.mealLabel === meal)
              .map((i, index) => (
                <li key={index}>
                  <span>{i.food.name}</span><span>{Number(i.quantity.toFixed(3))} {foodUnitLabels[i.food.portion_unit]}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      </div>
      <details className="mt-3 text-xs">
        <summary>Texto original</summary>
        <p className="mt-2 whitespace-pre-wrap">{record.narrative}</p>
      </details>
      <RecallTotals items={record.items} />
    </div>
  );
}
function recallDraftSignature(text: string, items: RecallRow[]) {
  return JSON.stringify([text, items.map(item => [item.mealLabel, item.rawText, item.search, item.foodId, item.quantity, item.unit, item.confirmed])]);
}
export type RecallNavigation = { open: boolean; stage: number; nextDisabled: boolean; saving: boolean; busy: boolean; mode?: "ai" | "manual" };
export type RecallNavigationActions = { next: () => void; previous: () => void };
export function RecallCopilot(props: Props & { navigationRef?: Ref<RecallNavigationActions>; onNavigationChange?: (navigation: RecallNavigation | null) => void }) {
  const clinical = useClinical(props, "recall_24h");
  const [stage, setStage] = useConsultationDraft('recall-stage',0);
  const [open, setOpen] = useConsultationDraft('recall-open',false);
  const [narrative, setNarrative] = useConsultationDraft('recall-narrative',"");
  const [dictating, setDictating] = useState(false);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [rows, setRows] = useConsultationDraft<RecallRow[]>('recall-rows',[]);
  const [ambiguities, setAmbiguities] = useConsultationDraft<string[]>('recall-ambiguities',[]);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [replacement, setReplacement] = useConsultationDraft<RecallEstimate | null>('recall-replacement',null);
  const [previousGeneration, setPreviousGeneration] = useConsultationDraft<string|undefined>('recall-previous-generation',undefined);
  const [mode, setMode] = useConsultationDraft<'ai' | 'manual'>('recall-mode','ai');
  const [estimate, setEstimate] = useConsultationDraft<RecallEstimate | null>('recall-estimate',null);
  const [reviewedEstimate, setReviewedEstimate] = useConsultationDraft('recall-reviewed-estimate',false);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [estimateNarrative, setEstimateNarrative] = useConsultationDraft('recall-estimate-narrative','');
  useDurableAIProposal('recall_24h',(output,id)=>{
    if(!isRecallEstimate(output))return;
    if(estimate)setReplacement(output);else apply(output);
    setOpen(true);clinical.restoreResult(id);
  });
  const baseline = useRef('');
  const { onPendingChange } = props;
  useEffect(() => {
    onPendingChange?.(open && (dictating || clinical.saving || JSON.stringify([recallDraftSignature(narrative, rows), mode, estimate]) !== baseline.current));
  }, [open, narrative, rows, mode, estimate, dictating, clinical.saving, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const setMessage = clinical.setMessage;
  useEffect(() => {
    if (!open || mode !== 'manual') return;
    let alive = true;
    void listFoodItems()
      .then((v) => {
        if (alive) setFoods(v);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [open, mode, setMessage]);
  function apply(next: RecallEstimate) {
    setEstimate(next); setEstimateNarrative(narrative);
    setReviewedEstimate(false); setMode('ai'); setReplacement(null); setStage(1);
  }
  const update = (id: string, patch: Partial<RecallRow>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const items = rows
    .map((r) => canonicalRecallItem(r, foods))
    .filter((i): i is RecallSavedItem => !!i);
  const previewItems = rows
    .map((r) => canonicalRecallItem({ ...r, confirmed: true }, foods))
    .filter((i): i is RecallSavedItem => !!i);
  const recallSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open && props.active !== false) recallSection.current?.scrollIntoView?.({ block: 'start' });
  }, [open, stage, props.active]);
  const working = clinical.saving || dictating || clinical.state === 'generating';
  const usableEstimate = estimate && isRecallEstimate(estimate) && estimateNarrative === narrative;
  const hasResult = mode === 'ai' ? !!usableEstimate : rows.length > 0;
  const canConfirm = !working && !replacement && (mode === 'ai' ? !!usableEstimate && reviewedEstimate : items.length > 0 && items.length === rows.length);
  const nextDisabled = working || (stage === 2 ? !canConfirm : !hasResult);
  const { onNavigationChange } = props;
  useEffect(() => { onNavigationChange?.({ open, stage, nextDisabled, saving: clinical.saving, busy: working, mode }); }, [open, stage, nextDisabled, clinical.saving, working, mode, onNavigationChange]);
  useEffect(() => () => onNavigationChange?.(null), [onNavigationChange]);
  async function confirmRecall() {
    if (!canConfirm) return;
    const ok = await clinical.approve('recall', mode === 'ai' ? { method: 'ai_estimate', narrative, estimate } : {
      narrative,
      items: rows.map(row => ({ foodId: row.foodId, mealLabel: row.mealLabel, rawText: row.rawText, quantity: Number(row.quantity), unit: row.unit })),
    });
    if (ok) setOpen(false);
  }
  useImperativeHandle(props.navigationRef, () => ({
    next: () => { if (!nextDisabled) { if (stage === 2) void confirmRecall(); else setStage(stage + 1); } },
    previous: () => { if (stage > 0 && !clinical.saving && !dictating && clinical.state !== 'generating') setStage(stage - 1); },
  }));
  function start() {
    const saved = clinical.workspace?.records.recall;
    setAmbiguities([]);
    setReplacement(null);
    setNarrative(saved?.narrative ?? "");
    const nextRows = saved?.items.map((i) => ({
        id: crypto.randomUUID(),
        mealLabel: i.mealLabel,
        rawText: i.rawText,
        search: i.food.name,
        foodId: i.food.id,
        quantity: String(i.quantity),
        unit: i.unit,
        confirmed: true,
      })) ?? [];
    const nextEstimate = saved?.method === 'ai_estimate' && isRecallEstimate(saved.estimate) ? structuredClone(saved.estimate) : null;
    const nextMode = nextRows.length ? 'manual' : 'ai';
    setMode(nextMode); setEstimate(nextEstimate); setEstimateNarrative(saved?.narrative ?? '');
    setReviewedEstimate(false); clinical.setGeneration(undefined);
    baseline.current = JSON.stringify([recallDraftSignature(saved?.narrative ?? '', nextRows), nextMode, nextEstimate]);
    setRows(nextRows);
    setStage(nextRows.length || nextEstimate ? 1 : 0);
    setOpen(true);
  }
  function addFood() {
    setMode('manual'); clinical.setGeneration(undefined);
    setRows(all => [...all, { id: crypto.randomUUID(), mealLabel: "Desayuno", rawText: "", search: "", foodId: "", quantity: "", unit: "", confirmed: false }]);
    setStage(1);
  }
  return (
    <section
      aria-label="Recordatorio estructurado"
      ref={recallSection}
      className="recall-workspace"
    >
      <div className="recall-workspace-heading">
        <div><h3>{clinical.workspace?.records.recall && !open ? "Consumo registrado" : "¿Qué comió y bebió el paciente?"}</h3><p>{clinical.workspace?.records.recall && !open ? "El recordatorio está confirmado. Puedes revisarlo o continuar con las mediciones." : "Escucha un día completo, revisa las cantidades y confirma el registro."}</p></div>
        {!open && (
          <button type="button" className={clinical.workspace?.records.recall ? secondary : 'nuth-button'} onClick={start}>
            {clinical.workspace?.records.recall
              ? "Revisar recordatorio"
              : "Capturar recordatorio"}
          </button>
        )}
      </div>
      {!open && clinical.workspace?.records.recall && (
        <ConfirmedRecall record={clinical.workspace.records.recall} />
      )}
      {!open && !clinical.workspace?.records.recall && <div className="consultation-guided-hint"><ArrowRight size={17} aria-hidden="true" /><p>Empieza con el relato del paciente. Puedes escribirlo, dictarlo o agregar los alimentos manualmente.</p></div>}
      {open && (
        <div>
          <ConsultationGuide label="Pasos del recordatorio" active={stage} onChange={setStage} busy={clinical.saving || clinical.state === 'generating' || dictating} steps={[
            { title: 'Captura', description: 'Escucha el día completo' },
            { title: mode === 'ai' ? 'Estimación' : 'Alimentos', description: mode === 'ai' ? 'Revisa calorías y macros' : 'Revisa cantidades y unidades' },
            { title: 'Confirma', description: 'Guarda el registro revisado', disabled: !hasResult },
          ]} />
          <div hidden={stage !== 0}>
          <div className="recall-stage-heading"><h4>1. Captura lo que recuerda</h4><p>Incluye comidas, bebidas y colaciones, desde que despertó hasta que se durmió.</p></div>
          <RecallNarrativeInput value={narrative} onChange={setNarrative}
            disabled={props.active === false || stage !== 0 || clinical.state === "generating" || clinical.saving} onListeningChange={setDictating} />
          <div className="recall-actions">
            <AIButton capability="ai.recall_24h"
              state={clinical.state}
              disabled={
                !narrative.trim() ||
                dictating ||
                clinical.saving ||
                !!replacement
              }
              onClick={() =>
                void (async () => {
                  setPreviousGeneration(clinical.generation);
                  const result = await clinical.generate(narrative);
                  if (result) {
                    if (!isRecallEstimate(result)) { clinical.setMessage('No se recibió una estimación válida. Conservamos tu relato.'); return; }
                    if (estimate) { setReplacement(result); setStage(1); }
                    else apply(result);
                  }
                })()
              }
            >
              Calcular consumo con IA
            </AIButton>
            <button
              type="button"
              className={secondary}
              disabled={clinical.saving || clinical.state === 'generating' || dictating}
              onClick={addFood}
            >
              Agregar alimento manualmente
            </button>
            {hasResult && <button type="button" className={secondary} disabled={dictating || clinical.saving || clinical.state === 'generating'} onClick={() => setStage(1)}>Continuar con la revisión <ArrowRight size={15} /></button>}
          </div>
          {replacement && <p className="consultation-guided-hint">Ya hay una nueva estimación. Abre la revisión para aceptarla o conservar tu captura.</p>}
          </div>
          <div hidden={stage !== 1}>
          <div className="recall-stage-heading"><h4>{mode === 'ai' ? '2. Revisa la estimación' : '2. Revisa cada alimento'}</h4><p>{mode === 'ai' ? 'Comprueba las porciones asumidas. Puedes corregir los alimentos y los valores de cada comida.' : 'Elige el alimento del catálogo, comprueba su cantidad y marca la casilla de revisión.'}</p></div>
          {replacement && (
            <div className="rounded-xl border p-3 text-sm">
              <p>
                Hay una nueva interpretación. Tu captura actual sigue intacta.
              </p>
              <button
                type="button"
                className={secondary + " mt-2"}
                onClick={() => apply(replacement)}
              >
                Revisar nueva interpretación
              </button>
              <button
                type="button"
                className={secondary + " ml-2"}
                onClick={() => {
                  setReplacement(null);
                  clinical.setGeneration(previousGeneration);
                }}
              >
                Conservar captura
              </button>
            </div>
          )}
          {mode === 'ai' && estimate && <RecallEstimateReview estimate={estimate} onChange={next => { setEstimate(next); setReviewedEstimate(false); }} />}
          {mode === 'ai' && estimate && estimateNarrative !== narrative && <p role="alert">Cambió el relato. Vuelve a Captura y calcula otra estimación antes de confirmar.</p>}
          {mode === 'ai' && <div className="recall-actions"><button type="button" className={secondary} onClick={() => setStage(0)}>Editar relato / volver a calcular</button><button type="button" className="nuth-button" disabled={!usableEstimate || !!replacement} onClick={() => setStage(2)}>Revisar resumen <ArrowRight size={15} /></button></div>}
          <div hidden={mode !== 'manual'}>
          {ambiguities.length > 0 && (
            <p role="status" className="text-xs text-[#856127]">
              Por revisar: {ambiguities.join(" · ")}
            </p>
          )}
          {rows.map((row, index) => {
            const food = foods.find((f) => f.id === row.foodId);
            const matches = matchRecallFoods(row.search, foods).slice(0, 20);
            return (
              <div
                key={row.id}
                className="recall-food-card"
              >
                <div className="recall-food-heading"><span>{index + 1}</span><strong>{food?.name || row.search || 'Alimento por completar'}</strong><button type="button" className="p-2 text-[#8b5750]" aria-label={`Omitir alimento ${index + 1}`} onClick={() => setRows(rows.filter(r => r.id !== row.id))}><X size={16} /></button></div>
                <div className="recall-food-grid">
                  <label className="text-xs">
                    Alimento
                    <input
                      aria-label={`Buscar alimento ${index + 1}`}
                      className={input}
                      value={row.search}
                      placeholder="Buscar en catálogo"
                      onChange={(e) =>
                        update(row.id, {
                          search: e.target.value,
                          foodId: "",
                          confirmed: false,
                        })
                      }
                    />
                    <select
                      aria-label={`Alimento ${index + 1}`}
                      className={input}
                      value={row.foodId}
                      onChange={(e) => {
                        const f = foods.find((f) => f.id === e.target.value);
                        update(row.id, {
                          foodId: e.target.value,
                          unit: f?.portion_unit ?? "",
                          confirmed: false,
                        });
                      }}
                    >
                      <option value="">Selecciona del catálogo</option>
                      {food && !matches.some((f) => f.id === food.id) && (
                        <option value={food.id}>{food.name}</option>
                      )}
                      {matches.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.portion_description}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">Tiempo de comida<input aria-label={`Tiempo ${index + 1}`} className={input} maxLength={120} value={row.mealLabel} onChange={e => update(row.id, { mealLabel: e.target.value })} /></label>
                  <div className="recall-food-amount">
                  <label className="text-xs">
                    Cantidad
                    <input
                      aria-label={`Cantidad ${index + 1}`}
                      className={input}
                      type="number"
                      min="0.001"
                      max="10000"
                      step="any"
                      placeholder="Por confirmar"
                      value={row.quantity}
                      onChange={(e) =>
                        update(row.id, {
                          quantity: e.target.value,
                          confirmed: false,
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Unidad
                    <select
                      aria-label={`Unidad ${index + 1}`}
                      className={input}
                      value={row.unit}
                      onChange={(e) =>
                        update(row.id, {
                          unit: e.target.value,
                          confirmed: false,
                        })
                      }
                    >
                      <option value="">Elegir</option>
                      {row.unit &&
                        row.unit !== food?.portion_unit &&
                        !(row.unit === "g" && food?.edible_grams) && (
                          <option value={row.unit}>
                            {foodUnitLabels[
                              row.unit as keyof typeof foodUnitLabels
                            ] ?? row.unit}{" "}
                            · por verificar
                          </option>
                        )}
                      {food && (
                        <option value={food.portion_unit}>
                          {foodUnitLabels[food.portion_unit]}
                        </option>
                      )}
                      {food?.edible_grams && food.portion_unit !== "g" ? (
                        <option value="g">g comestibles</option>
                      ) : null}
                    </select>
                  </label>
                  </div>
                </div>
                {row.rawText && <p className="recall-food-original">Texto original: {row.rawText}</p>}
                {!row.foodId && row.search && matches.length === 0 && (
                  <p className="mt-2 text-xs">
                    No encontré este alimento en tu catálogo. Busca otro nombre,{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setCreating(true)}
                    >
                      crea un alimento
                    </button>{" "}
                    u omítelo.
                  </p>
                )}
                <label className="recall-food-review">
                  <input
                    type="checkbox"
                    checked={row.confirmed}
                    onChange={(e) =>
                      update(row.id, { confirmed: e.target.checked })
                    }
                  />
                  Revisé alimento, cantidad y unidad
                </label>
              </div>
            );
          })}
          {!rows.length && <p className="recall-empty">Todavía no hay alimentos. Agrégalos manualmente o vuelve a Captura para organizar el relato con IA.</p>}
          {creating && (
            <CustomFoodForm
              initialGroup="VEGETABLES"
              busy={creatingBusy}
              onCancel={() => setCreating(false)}
              onCreate={(v) => {
                setCreatingBusy(true);
                void createCustomFood(v)
                  .then((f) => {
                    setFoods((all) => [...all, f]);
                    setCreating(false);
                  })
                  .catch((e) => clinical.setMessage(e.message))
                  .finally(() => setCreatingBusy(false));
              }}
            />
          )}
          <div className="recall-actions"><button type="button" className={secondary} onClick={addFood}>Agregar otro alimento</button><button type="button" className="nuth-button" disabled={!rows.length} onClick={() => setStage(2)}>Revisar resumen <ArrowRight size={15} /></button></div>
          <p className="recall-confirm-progress" role="status">{items.length} de {rows.length} alimentos revisados.</p>
          </div>
          </div>
          <div hidden={stage !== 2}>
          <div className="recall-stage-heading"><h4>3. Confirma el recordatorio</h4><p>Revisa el resumen. Al confirmar, estos alimentos estarán disponibles para la revisión clínica y el plan.</p></div>
          {mode === 'ai' && estimate && <><RecallEstimateSummary estimate={estimate} /><label className="recall-food-review"><input type="checkbox" checked={reviewedEstimate} disabled={!usableEstimate} onChange={e => setReviewedEstimate(e.target.checked)} />Revisé las porciones, los supuestos y los valores estimados.</label></>}
          {mode === 'manual' && rows.length > 0 && (
            <>
              {previewItems.length > 0 ? (
                <RecallTotals
                  items={previewItems}
                  target={clinical.workspace?.target}
                  provisional={items.length !== rows.length}
                />
              ) : (
                <p className="text-sm text-[var(--nuth-muted)]">
                  Completa alimento, cantidad y unidad para estimar nutrientes.
                </p>
              )}
              <p className="text-xs text-[var(--nuth-muted)]">
                {items.length} de {rows.length} alimentos revisados. {items.length === rows.length ? 'El registro está listo para confirmar.' : 'Resuelve u omite los pendientes antes de confirmar.'}
              </p>
            </>
          )}
          <div className="recall-actions">
            <button
              type="button"
              className="nuth-button"
              disabled={!canConfirm}
              onClick={() => void confirmRecall()}
            >
              {clinical.saving ? "Guardando…" : "Confirmar recordatorio"}
            </button>
            {mode === 'manual' && items.length !== rows.length && <button type="button" className={secondary} onClick={() => setStage(1)}>Completar alimentos pendientes</button>}
            <button
              type="button"
              className={secondary}
              disabled={clinical.saving || clinical.state === "generating"}
              onClick={() => {
                setOpen(false);
                setReplacement(null);
                clinical.setGeneration(undefined);
              }}
            >
              Descartar cambios
            </button>
          </div>
          </div>
          {stage !== 2 && <button type="button" className="mt-5 text-xs font-medium underline" disabled={clinical.saving || clinical.state === 'generating' || dictating} onClick={() => { setOpen(false); setReplacement(null); clinical.setGeneration(undefined); }}>Descartar cambios</button>}
        </div>
      )}
      {!open && clinical.workspace?.records.recall && <div className="recall-actions"><button type="button" className={secondary} disabled={working} onClick={() => setRemoveRequested(true)}>Retirar recordatorio y volver a capturar</button></div>}
      {removeRequested && <div className="recall-removal" role="alert"><p>Se retirará el recordatorio de esta consulta. El PES y el objetivo tendrán que revisarse de nuevo si ya estaban aprobados.</p><div className="recall-actions"><button type="button" className={secondary} disabled={working} onClick={() => setRemoveRequested(false)}>Conservar recordatorio</button><button type="button" className="nuth-button" disabled={working} onClick={() => void clinical.removeRecall().then(ok => { if (ok) { setRemoveRequested(false); setOpen(false); setEstimate(null); setRows([]); setNarrative(''); } })}>Retirar de esta consulta</button></div></div>}
      <Feedback clinical={clinical} />
    </section>
  );
}
