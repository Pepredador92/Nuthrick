import { useState } from "react";
import { AIButton } from "@/src/components/ai/AIControls";
import {
  AIRequestError,
  getAIGenerationStatus,
  runAIRequest,
  type AIState,
} from "@/src/services/ai";

type Evidence = { source: string; finding: string };
type Suggestion = { text: string; evidence: Evidence[] };

export function ConsultationObjectiveAI({
  patientId,
  consultationId,
  revision,
  before,
  onApply,
}: {
  patientId: string;
  consultationId: string;
  revision: number;
  before: () => Promise<boolean>;
  onApply: (text: string) => void;
}) {
  const storageKey = `clinical-pending:${consultationId}:consultation_support`;
  const [state, setState] = useState<AIState>(() =>
    sessionStorage.getItem(storageKey) ? "uncertain" : "idle",
  );
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applied, setApplied] = useState<number[]>([]);

  async function generate() {
    if (sessionStorage.getItem(storageKey)) {
      setState("uncertain");
      setMessage("Comprueba primero el estado de la solicitud pendiente.");
      return;
    }
    setState("generating");
    setMessage("");
    setSuggestions([]);
    try {
      if (!(await before()))
        throw new Error("Guarda la entrevista antes de continuar.");
      const idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const result = await runAIRequest({
        feature: "consultation_support",
        idempotencyKey,
        patientId,
        consultationId,
        revision,
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setMessage("Comprueba el estado antes de volver a solicitar una propuesta.");
        return;
      }
      const output = result.output as {
        objectives?: unknown;
      };
      const next = Array.isArray(output.objectives)
        ? output.objectives.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const candidate = item as Partial<Suggestion>;
            if (typeof candidate.text !== "string" || !candidate.text.trim())
              return [];
            const evidence = Array.isArray(candidate.evidence)
              ? candidate.evidence.filter(
                  (entry): entry is Evidence =>
                    !!entry &&
                    typeof entry === "object" &&
                    typeof (entry as Evidence).source === "string" &&
                    typeof (entry as Evidence).finding === "string",
                )
              : [];
            return [{ text: candidate.text.trim(), evidence }];
          })
        : [];
      sessionStorage.removeItem(storageKey);
      setSuggestions(next);
      setState("ready");
      if (!next.length)
        setMessage(
          "No hay información suficiente para proponer un objetivo concreto. Puedes completar estos datos o redactarlo manualmente.",
        );
    } catch (error) {
      const uncertain =
        error instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(error.code);
      if (!uncertain) sessionStorage.removeItem(storageKey);
      setState(
        uncertain
          ? "uncertain"
          : error instanceof AIRequestError && error.code === "insufficient_credits"
            ? "insufficient"
            : "error",
      );
      setMessage(error instanceof Error ? error.message : "No se pudo generar.");
    }
  }

  async function checkStatus() {
    const key = sessionStorage.getItem(storageKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if (!result || ["succeeded", "failed", "invalid_output"].includes(result.status)) {
        sessionStorage.removeItem(storageKey);
        setState("idle");
        setMessage(
          result?.status === "succeeded"
            ? "La solicitud terminó y no se recuperó la propuesta. Generar otra puede consumir créditos de nuevo."
            : "Solicitud resuelta. Puedes seguir manualmente o generar una propuesta nueva.",
        );
      } else {
        setMessage("La solicitud sigue pendiente. No la vuelvas a generar todavía.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos comprobar la solicitud.");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#173d36]">Proponer objetivos con IA</h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#52675f]">
            Máximo 3 borradores breves, basados en lo registrado. Usa créditos de IA según el consumo real.
          </p>
        </div>
        <AIButton
          capability="ai.consultation_support"
          state={state}
          onClick={() => void generate()}
          aria-label="Proponer objetivos con IA"
        >
          Proponer objetivos
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
      {suggestions.length > 0 && (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold text-[#315e4f]">
            Revisa, conversa y acuerda cada propuesta antes de agregarla.
          </p>
          {suggestions.map((suggestion, index) => (
            <article key={`${suggestion.text}-${index}`} className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-sm leading-6 text-[#29483f]">{suggestion.text}</p>
              {suggestion.evidence.length > 0 && (
                <details className="mt-2 text-xs text-[#52675f]">
                  <summary className="cursor-pointer">Datos utilizados</summary>
                  <ul className="mt-2 space-y-1.5">
                    {suggestion.evidence.map((fact, evidenceIndex) => (
                      <li key={`${fact.source}-${evidenceIndex}`}>
                        <strong>{fact.source}:</strong> {fact.finding}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button
                type="button"
                className="mt-3 rounded-lg border border-[#c9d9ce] px-3 py-2 text-xs font-semibold text-[#315e4f] hover:bg-[#f4f8f5]"
                disabled={applied.includes(index)}
                onClick={() => {
                  onApply(suggestion.text);
                  setApplied((items) => [...items, index]);
                }}
              >
                {applied.includes(index) ? "Agregado · puedes editarlo" : "Agregar a la entrevista"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
