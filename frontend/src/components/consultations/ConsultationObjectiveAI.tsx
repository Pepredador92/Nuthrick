import {useConsultationDraft,useConsultationDraftContext,useDurableAIProposal} from './ConsultationDrafts';
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  composeObjective,
  emptyObjective,
  type ObjectiveGoal,
} from "../../../../supabase/functions/_shared/objectives";
import { AIButton } from "@/src/components/ai/AIControls";
import {
  AIRequestError,
  type AIState,
  getAIGenerationStatus,
  runAIRequest,
} from "@/src/services/ai";

type Evidence = { source: string; finding: string };
type Suggestion = {
  text: string;
  evidence: Evidence[];
  goal?: ObjectiveGoal;
  references?: { title: string; url: string }[];
};

function SuggestionEvidence({ suggestion }: { suggestion: Suggestion }) {
  return (
    <>
      {suggestion.evidence.length > 0 && (
        <details className="mt-2 text-xs text-[#52675f]">
          <summary className="cursor-pointer">Datos utilizados</summary>
          <ul className="mt-2 space-y-1.5">
            {suggestion.evidence.map((fact, index) => (
              <li key={`${fact.source}-${index}`}>
                <strong>{fact.source}:</strong> {fact.finding}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!suggestion.references?.length && (
        <details className="mt-2 text-xs text-[#52675f]">
          <summary className="cursor-pointer">
            Fuentes para revisar la propuesta
          </summary>
          <ul className="mt-2 space-y-1.5">
            {suggestion.references.map((reference) => (
              <li key={reference.url}>
                <a
                  className="underline"
                  href={reference.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {reference.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

type SuggestionProps = {
  patientId: string;
  consultationId: string;
  revision: number;
  before: () => Promise<boolean>;
  onApply: (text: string) => void;
  disabled?: boolean;
  onApplyGoal?: (goal: ObjectiveGoal) => void;
  draftKey?: string;
};

function parseSuggestions(output: {objectives?:unknown;instructions?:unknown},kind:"objectives"|"instructions"):Suggestion[]{
      const drafts = output[kind];
      const next = Array.isArray(drafts)
        ? drafts.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const candidate = item as Partial<Suggestion>;
          const goal = candidate.goal && typeof candidate.goal === "object" &&
              typeof candidate.goal.outcome === "string"
            ? {
              ...emptyObjective(),
              ...candidate.goal,
              agreement: "pending" as const,
            }
            : undefined;
          const text = goal ? composeObjective(goal) : candidate.text;
          if (typeof text !== "string" || !text.trim()) {
            return [];
          }
          const evidence = Array.isArray(candidate.evidence)
            ? candidate.evidence.filter(
              (entry): entry is Evidence =>
                !!entry &&
                typeof entry === "object" &&
                typeof (entry as Evidence).source === "string" &&
                typeof (entry as Evidence).finding === "string" &&
                !!(entry as Evidence).source.trim() &&
                !!(entry as Evidence).finding.trim(),
            )
            : [];
          const references = Array.isArray(candidate.references)
            ? candidate.references.filter((reference) =>
              reference && typeof reference.title === "string" &&
              !!reference.title.trim() && typeof reference.url === "string" &&
              /^https:\/\//.test(reference.url)
            )
            : [];
          return evidence.length
            ? [{ text: text.trim(), evidence, goal, references }]
            : [];
        })
        : [];

return next;
}

export function ConsultationObjectiveAI(props: SuggestionProps) {
  return <ClinicalSuggestionsAI {...props} kind="objectives" />;
}

export function ClinicalSuggestionsAI({
  patientId,
  consultationId,
  revision,
  before,
  onApply,
  kind,
  disabled = false,
  onApplyGoal,
  compactInstructions = false,
  draftKey,
}: SuggestionProps & {
  kind: "objectives" | "instructions";
  compactInstructions?: boolean;
}) {
  const instructions = kind === "instructions";
  const feature = instructions
    ? "patient_instructions"
    : "consultation_support";
  const label = instructions ? "indicaciones" : "objetivos";
  const storageKey = `clinical-pending:${consultationId}:${feature}`;
  const checkpoints=useConsultationDraftContext();
  const slot=`suggestions:${kind}:${draftKey??'main'}`;
  const [pendingRequest,setPendingRequest]=useConsultationDraft<string|null>(`request:${feature}`,()=>sessionStorage.getItem(storageKey),true);
  const [state, setState] = useState<AIState>(() =>
    (pendingRequest||sessionStorage.getItem(storageKey)) ? "uncertain" : "idle"
  );
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useConsultationDraft<Suggestion[]>(slot,[]);
  const [applied, setApplied] = useConsultationDraft<number[]>(`${slot}:applied`,[]);

  useDurableAIProposal(feature,(output)=>{setSuggestions(parseSuggestions(output,kind));setApplied([]);setPendingRequest(null);sessionStorage.removeItem(storageKey);setState('ready');setMessage('Propuestas recuperadas para revisión.');},slot);

  async function generate() {
    if (disabled || state === "generating") return;
    if (pendingRequest||sessionStorage.getItem(storageKey)) {
      setState("uncertain");
      setMessage("Comprueba primero el estado de la solicitud pendiente.");
      return;
    }
    setState("generating");
    setMessage("");
    setSuggestions([]);
    setApplied([]);
    try {
      if (!(await before())) {
        throw new Error("Guarda la entrevista antes de continuar.");
      }
      const idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      setPendingRequest(idempotencyKey);checkpoints?.set(`destination:${feature}`,slot);
      if(checkpoints&&!await checkpoints.flush())throw new Error('Guarda el avance antes de solicitar una nueva propuesta.');
      const result = await runAIRequest({
        feature,
        idempotencyKey,
        patientId,
        consultationId,
        revision,
        ...(!instructions ? { objectiveTextStyle: "patient_v1" as const } : {}),
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setMessage(
          "Comprueba el estado antes de volver a solicitar una propuesta.",
        );
        return;
      }
      const output = result.output as {
        objectives?: unknown;
        instructions?: unknown;
      };
      const next=parseSuggestions(output,kind);
      sessionStorage.removeItem(storageKey);setPendingRequest(null);checkpoints?.set(`handled:${feature}`,result.generationId);
      setSuggestions(next);
      setState("ready");
      if (!next.length) {
        setMessage(
          `No hay acuerdos suficientes para proponer ${label}. Puedes completar lo conversado con el paciente o redactar manualmente.`,
        );
      }
    } catch (error) {
      const uncertain = error instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(
          error.code,
        );
      if (!uncertain) {sessionStorage.removeItem(storageKey);setPendingRequest(null);}
      setState(
        uncertain ? "uncertain" : error instanceof AIRequestError &&
            error.code === "insufficient_credits"
          ? "insufficient"
          : "error",
      );
      setMessage(
        error instanceof Error ? error.message : "No se pudo generar.",
      );
    }
  }

  async function checkStatus() {
    const key = pendingRequest||sessionStorage.getItem(storageKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if(result?.status==='succeeded'&&checkpoints){await checkpoints.refresh();setMessage('Recuperando las propuestas guardadas.');return;}
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(storageKey);setPendingRequest(null);
        setState("idle");
        setMessage(
          result?.status === "succeeded"
            ? "La solicitud terminó y no se recuperó la propuesta. Generar otra puede consumir créditos de nuevo."
            : "Solicitud resuelta. Puedes seguir manualmente o generar una propuesta nueva.",
        );
      } else {
        setMessage(
          "La solicitud sigue pendiente. No la vuelvas a generar todavía.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos comprobar la solicitud.",
      );
    }
  }

  const pendingCount = suggestions.length - applied.length;
  return (
    <section className="clinical-ai-assistance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#173d36]">
            Proponer {label} con IA
          </h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#52675f]">
            {instructions
              ? "Borradores basados en lo registrado."
              : "Propuestas basadas en el PES aprobado. Agrégalas para revisarlas paso a paso."}
            {" "}
            Usa créditos de IA según el consumo real.
          </p>
        </div>
        <AIButton
          capability={instructions
            ? "ai.patient_instructions"
            : "ai.consultation_support"}
          disabled={disabled}
          state={state}
          onClick={() => void generate()}
          aria-label={`Proponer ${label} con IA`}
        >
          Proponer {label}
        </AIButton>
      </div>
      {state === "uncertain" && (
        <button
          type="button"
          className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold text-blue-800 underline"
          onClick={() => void checkStatus()}
        >
          Comprobar solicitud
        </button>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-[#52675f]">
          {message}
        </p>
      )}
      {suggestions.length > 0 &&
        ((instructions && !compactInstructions) || pendingCount > 0) && (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold text-[#315e4f]">
            {instructions && !compactInstructions
              ? "Revisa cada propuesta antes de agregarla."
              : `${pendingCount} ${
                pendingCount === 1
                  ? "propuesta por revisar"
                  : "propuestas por revisar"
              }`}
          </p>
          {suggestions.map((suggestion, index) => {
            if (
              (!instructions || compactInstructions) && applied.includes(index)
            ) return null;
            return (
              <article
                key={`${suggestion.text}-${index}`}
                className={`rounded-lg border border-blue-100 bg-white p-3${
                  instructions
                    ? compactInstructions
                      ? " clinical-instruction-suggestion"
                      : ""
                    : " clinical-objective-suggestion"
                }`}
              >
                {instructions
                  ? (
                    <>
                      <p
                        className={compactInstructions
                          ? "clinical-next-excerpt"
                          : "text-sm leading-6 text-[#29483f]"}
                      >
                        {suggestion.text}
                      </p>
                      {compactInstructions
                        ? (
                          <details className="clinical-suggestion-preview">
                            <summary>Ver texto completo y fuentes</summary>
                            <p>{suggestion.text}</p>
                            <SuggestionEvidence suggestion={suggestion} />
                          </details>
                        )
                        : <SuggestionEvidence suggestion={suggestion} />}
                    </>
                  )
                  : (
                    <>
                      <h5>{suggestion.goal?.outcome || suggestion.text}</h5>
                      {suggestion.goal && (
                        <dl className="clinical-goal-summary-facts">
                          <div>
                            <dt>Meta propuesta</dt>
                            <dd>
                              {suggestion.goal.target ||
                                "Por definir con la persona"}
                            </dd>
                          </div>
                          <div>
                            <dt>Revisión</dt>
                            <dd>
                              {suggestion.goal.timeframe || "Plazo por acordar"}
                            </dd>
                          </div>
                        </dl>
                      )}
                      <details className="clinical-suggestion-preview">
                        <summary>Vista previa y datos utilizados</summary>
                        <p>{suggestion.text}</p>
                        <SuggestionEvidence suggestion={suggestion} />
                      </details>
                    </>
                  )}
                <div className="clinical-suggestion-actions">
                  {!instructions && (
                    <span>Acuerdo con el paciente pendiente</span>
                  )}
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-[#c9d9ce] px-3 py-2 text-xs font-semibold text-[#315e4f] hover:bg-[#f4f8f5]"
                    disabled={disabled || applied.includes(index)}
                    onClick={() => {
                      if (suggestion.goal && onApplyGoal) {
                        onApplyGoal(suggestion.goal);
                      } else onApply(suggestion.text);
                      setApplied((items) => [...items, index]);
                    }}
                  >
                    {applied.includes(index)
                      ? "Agregado · puedes editarlo"
                      : instructions
                      ? compactInstructions
                        ? "Agregar y revisar"
                        : "Agregar a indicaciones"
                      : onApplyGoal
                      ? (
                        <>
                          Agregar y revisar<ArrowRight
                            size={14}
                            aria-hidden="true"
                          />
                        </>
                      )
                      : "Agregar a la entrevista"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {(!instructions || compactInstructions) && suggestions.length > 0 &&
        pendingCount === 0 && (
        <p role="status" className="clinical-suggestions-complete">
          <Check size={16} aria-hidden="true" />
          {instructions
            ? "Propuestas agregadas. Revisa y guarda tus indicaciones."
            : "Propuestas agregadas. Continúa con la revisión de tus objetivos."}
        </p>
      )}
    </section>
  );
}
