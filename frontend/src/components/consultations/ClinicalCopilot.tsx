import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  Circle,
  FilePenLine,
  Sparkles,
  X,
} from "lucide-react";
import {
  ClinicalStatusBadge,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";
import { PesDiagnosisCards } from "./PesDiagnosisCards";
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

type Props = {
  patientId: string;
  consultationId: string;
  revision: number;
  before: () => Promise<boolean>;
  onPes?: (draft: PesDraft) => void;
  answers?: Record<string, unknown>;
  active?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onStatusChange?: (status: ClinicalTaskStatus) => void;
};
const input = "nuth-input mt-1 w-full !text-sm";
const secondary = "nuth-button-secondary !text-sm disabled:opacity-50";
function useClinical(props: Props, feature: "pes_diagnosis" | "recall_24h") {
  const storageKey = `clinical-pending:${props.consultationId}:${feature}`;
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [state, setState] = useState<AIState>(() =>
    sessionStorage.getItem(storageKey) ? "uncertain" : "idle"
  );
  const [message, setMessage] = useState("");
  const [generation, setGeneration] = useState<string>();
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
    if (sessionStorage.getItem(storageKey)) {
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
      setGeneration(result.generationId);
      setState("ready");
      return result.output;
    } catch (e) {
      const uncertain = e instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(e.code);
      if (!uncertain) sessionStorage.removeItem(storageKey);
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
    const key = sessionStorage.getItem(storageKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(storageKey);
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
  async function approve(kind: "pes" | "recall", payload: object) {
    setSaving(true);
    setMessage("");
    try {
      const w = await refresh();
      await clinicalWorkspace(
        props.consultationId,
        props.revision,
        kind,
        { ...payload, stamp: w.stamp },
        generation,
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
export function PesCopilot(props: Props) {
  const clinical = useClinical(props, "pes_diagnosis");
  const [draft, setDraft] = useState<PesDraft | null>(null);
  const [replacement, setReplacement] = useState<PesDraft | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<string>();
  const [editing, setEditing] = useState(true);
  const { onPendingChange, onStatusChange } = props;
  const savedDraft = pesFromAnswers(props.answers ?? {});
  const hasSavedParts =
    !!(savedDraft.problem.trim() || savedDraft.etiology.trim() ||
      savedDraft.signsSymptoms.some((sign) => sign.trim()) ||
      savedDraft.pesStatement.trim());
  const status: ClinicalTaskStatus = draft
    ? "progress"
    : clinical.workspace?.records.pes
    ? "approved"
    : hasSavedParts
    ? "progress"
    : "pending";
  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);
  useEffect(() => {
    onPendingChange?.(
      Boolean(
        draft || replacement || clinical.saving ||
          clinical.state === "generating",
      ),
    );
  }, [draft, replacement, clinical.saving, clinical.state, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  async function generate() {
    setPreviousGeneration(clinical.generation);
    const output = await clinical.generate();
    if (!output) return;
    const next = output as PesDraft;
    const composed = { ...next, pesStatement: composePesStatement(next) };
    if (draft) setReplacement(composed);
    else setDraft(composed);
  }
  return (
    <section aria-label="Asistencia PES" className="clinical-pes-workspace">
      <div className="clinical-pes-overview">
        <div>
          <h3>Construye el diagnóstico en tres partes</h3>
          <p>
            Identifica el problema, explica su causa y respáldalo con datos.
          </p>
        </div>
        <ClinicalStatusBadge status={status}>
          {draft
            ? "Borrador por revisar"
            : status === "approved"
            ? "PES aprobado"
            : hasSavedParts
            ? "Pendiente de aprobación"
            : "Sin empezar"}
        </ClinicalStatusBadge>
      </div>
      {!draft && (
        <>
          <PesDiagnosisCards draft={savedDraft} />
          {savedDraft.pesStatement.trim() && (
            <div className="clinical-pes-statement">
              <p className="nuth-eyebrow">Enunciado guardado</p>
              <p>{savedDraft.pesStatement}</p>
            </div>
          )}
          <div className="clinical-pes-start-actions">
            <div>
              <FilePenLine size={20} aria-hidden="true" />
              <div>
                <strong>
                  {hasSavedParts
                    ? "Revisa lo que registraste"
                    : "Redáctalo con tu criterio"}
                </strong>
                <p>Completa P, E y S con los datos de la consulta.</p>
              </div>
              <button
                type="button"
                className="nuth-button !text-sm"
                disabled={clinical.saving || clinical.state === "generating"}
                onClick={() => {
                  setDraft(pesFromAnswers(props.answers ?? {}));
                  setReplacement(null);
                  clinical.setGeneration(undefined);
                  setEditing(true);
                  clinical.setMessage("");
                }}
              >
                {hasSavedParts
                  ? "Revisar PES escrito"
                  : "Redactar PES manualmente"}
              </button>
            </div>
            <div>
              <Sparkles size={20} aria-hidden="true" />
              <div>
                <strong>Parte de una propuesta de IA</strong>
                <p>Usa los datos disponibles. Consume créditos de IA.</p>
              </div>
              <AIButton
                capability="ai.pes"
                state={clinical.state}
                disabled={clinical.saving || !clinical.workspace}
                onClick={() => void generate()}
              >
                Generar borrador
              </AIButton>
            </div>
          </div>
        </>
      )}
      {clinical.state === "generating" && (
        <p role="status" className="clinical-notice">
          Analizando la información de la consulta…
        </p>
      )}
      {draft && (
        <div className="clinical-pes-draft">
          {!draft.problem.trim() && !draft.pesStatement.trim() &&
            draft.missingContext.length > 0 && (
            <p role="status" className="clinical-notice is-warning">
              Información insuficiente para proponer un PES. Revisa los datos
              faltantes antes de completar o aprobar el diagnóstico.
            </p>
          )}
          {!draft.etiology.trim() && (
            <div role="status" className="clinical-notice is-warning">
              <p>
                Falta completar la etiología con sustento clínico antes de
                aprobar el PES. Confirma con el paciente los factores que siguen
                vigentes.
              </p>
              {draft.missingContext.length > 0 && (
                <ul>
                  {draft.missingContext.map((missing, i) => (
                    <li key={i}>{missing}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <PesDiagnosisCards
            draft={draft}
            editable={editing}
            onChange={(parts) => setDraft(updatePesParts(draft, parts))}
          />
          <div className="clinical-pes-statement">
            <p className="nuth-eyebrow">Así quedará el diagnóstico</p>
            <h4>Enunciado PES final</h4>
            <output
              aria-label="Enunciado PES final"
              aria-live="off"
              aria-describedby="pes-statement-help"
            >
              {draft.pesStatement ||
                "Completa P, E y S para construir el enunciado."}
            </output>
            <small id="pes-statement-help">
              Problema → relacionado con → Etiología → evidenciado por → Signos
              y síntomas.
            </small>
          </div>
          {!pesStatementMatches(draft) && (
            <div role="alert" className="clinical-notice is-warning">
              <p>
                El enunciado guardado no coincide con los componentes actuales.
                Revisa P, E y S y actualízalo antes de aprobar.
              </p>
              <button
                type="button"
                className={secondary + " mt-3"}
                onClick={() =>
                  setDraft({
                    ...draft,
                    pesStatement: composePesStatement(draft),
                  })}
              >
                Actualizar enunciado con P, E y S
              </button>
            </div>
          )}
          {draft.pesStatement.length > 2000 && (
            <p role="alert" className="clinical-notice is-warning">
              El enunciado supera 2000 caracteres. Resume los componentes y
              conserva la evidencia pertinente.
            </p>
          )}
          <details className="clinical-support-details">
            <summary>
              Información utilizada y
              límites{draft.missingContext.filter((value) => value.trim())
                    .length > 0 && (
                <span className="clinical-detail-count">
                  {draft.missingContext.filter((value) => value.trim()).length}
                  {" "}
                  datos por confirmar
                </span>
              )}
            </summary>
            <ul className="consultation-context-facts">
              {draft.evidence.map((e, i) => (
                <li key={i}>
                  <strong>{e.source}</strong>
                  <p>{e.finding}</p>
                </li>
              ))}
            </ul>
            {!draft.evidence.length && (
              <p>
                Redacción manual: contrasta los signos y síntomas con las
                mediciones, entrevista y estudios de la revisión clínica.
              </p>
            )}
            {(["missingContext", "uncertainties"] as const).map((key) => (
              <label key={key} className="clinical-goal-field mt-4">
                <span>
                  {key === "missingContext"
                    ? "Datos faltantes"
                    : "Incertidumbres y otros hallazgos"}
                </span>
                <textarea
                  className="nuth-input"
                  readOnly={!editing}
                  value={draft[key].join("\n")}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [key]: event.target.value.split("\n"),
                    })}
                />
              </label>
            ))}
          </details>
          <div
            className="clinical-approval-card"
            data-status={canApprovePes(draft) ? "complete" : "progress"}
          >
            <div className="clinical-approval-copy">
              <span className="clinical-stage-icon">
                {canApprovePes(draft)
                  ? <Check size={20} aria-hidden="true" />
                  : <FilePenLine size={20} aria-hidden="true" />}
              </span>
              <div>
                <h4>
                  {canApprovePes(draft)
                    ? "Revisa y aprueba el diagnóstico"
                    : "Completa el diagnóstico para aprobar"}
                </h4>
                <p>
                  Al aprobar confirmas que revisaste P, E y S, sus fuentes y la
                  vigencia de los datos.
                </p>
              </div>
            </div>
            <div className="clinical-approval-actions">
              <button
                type="button"
                className={secondary}
                disabled={clinical.saving}
                onClick={() =>
                  setEditing(!editing)}
              >
                {editing ? "Ver propuesta" : "Editar"}
              </button>
              <button
                type="button"
                className="nuth-button !text-sm"
                disabled={clinical.saving || !!replacement ||
                  clinical.state === "generating" || !canApprovePes(draft)}
                onClick={() => {
                  const approved = {
                    ...draft,
                    signsSymptoms: draft.signsSymptoms.map((sign) =>
                      sign.trim()
                    ).filter(Boolean),
                  };
                  void clinical.approve("pes", {
                    ...approved,
                    evidenceReviewed: true,
                  }).then((ok) => {
                    if (ok) {
                      props.onPes?.(approved);
                      setDraft(null);
                    }
                  });
                }}
              >
                {clinical.saving ? "Guardando…" : "Aprobar"}
              </button>
              <button
                type="button"
                className={secondary}
                disabled={clinical.state === "generating" || clinical.saving}
                onClick={() => {
                  setDraft(null);
                  setReplacement(null);
                  clinical.setGeneration(undefined);
                }}
              >
                Descartar
              </button>
              <AIButton
                capability="ai.pes"
                state={clinical.state}
                disabled={clinical.saving || !!replacement}
                onClick={() => void generate()}
              >
                Otra propuesta
              </AIButton>
            </div>
          </div>
          {replacement && (
            <div className="clinical-notice">
              <p className="font-semibold">
                Nueva propuesta · aún no reemplaza la anterior
              </p>
              <p className="mt-2">{replacement.pesStatement}</p>
              <div className="clinical-approval-actions">
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setDraft(replacement);
                    setReplacement(null);
                  }}
                >
                  Revisar nueva propuesta
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setReplacement(null);
                    clinical.setGeneration(previousGeneration);
                  }}
                >
                  Conservar anterior
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <details className="clinical-support-details">
        <summary>Datos disponibles y cómo se usa la IA</summary>
        <div className="clinical-readiness" aria-label="Información disponible">
          {([["interview", "Entrevista"], ["objective", "Objetivo"], [
            "anthropometry",
            "Antropometría",
          ], ["laboratories", "Laboratorios"]] as const).map(([key, label]) => {
            const available = clinical.workspace?.readiness[key];
            const Icon = available ? Check : Circle;
            return (
              <span key={key}>
                <Icon size={13} aria-hidden="true" />
                {label}
                {available ? " disponible" : " sin registrar"}
              </span>
            );
          })}
        </div>
        <p>
          {clinical.workspace?.readiness.anthropometry
            ? "Los laboratorios no son obligatorios."
            : "Agregar antropometría puede aportar más contexto; no es obligatorio."}
          {" "}
          Puedes redactar el PES manualmente.
        </p>
        <p>
          La propuesta prioriza esta consulta. Si falta la entrevista actual,
          puede usar antecedentes de consultas cerradas con su fecha. Revisa
          cuáles siguen vigentes.
        </p>
      </details>
      <Feedback clinical={clinical} />
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
  const [stage, setStage] = useState(0);
  const [open, setOpen] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [dictating, setDictating] = useState(false);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [rows, setRows] = useState<RecallRow[]>([]);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [replacement, setReplacement] = useState<RecallEstimate | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<string>();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [estimate, setEstimate] = useState<RecallEstimate | null>(null);
  const [reviewedEstimate, setReviewedEstimate] = useState(false);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [estimateNarrative, setEstimateNarrative] = useState('');
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
