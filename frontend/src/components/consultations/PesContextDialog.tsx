import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardList, RefreshCw, X } from "lucide-react";
import {
  clinicalObjective,
  clinicalWorkspace,
  type ObjectiveWorkspace,
  type ClinicalWorkspace,
} from "@/src/services/clinicalCopilot";
import type { ConsultationSnapshotStructure } from "@/src/types/domain";
import type { Answers } from "@/src/features/consultations/questionnaire";
import {
  pesGapTargets,
  pesSuggestedFields,
  type PesContextField,
  type PesContextTarget,
} from "@/src/features/consultations/pesReadiness";
import { useConsultationDraft } from "./ConsultationDrafts";

export function PesContextDialog({
  consultationId,
  revision,
  structure,
  answers,
  missingContext,
  missingEtiology,
  intent,
  before,
  onOpenTarget,
  onGenerate,
  onClose,
}: {
  consultationId: string;
  revision: number;
  structure: ConsultationSnapshotStructure;
  answers: Answers;
  missingContext: string[];
  missingEtiology: boolean;
  intent: "generate" | "review";
  before: () => Promise<boolean>;
  onOpenTarget: (target: PesContextTarget) => Promise<boolean>;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialBefore = useRef(before);
  const [context, setContext] = useState<ObjectiveWorkspace | null>(null);
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [notes, setNotes] = useConsultationDraft<string>(
    "pes-clinical-context",
    "",
  );
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (!(await initialBefore.current()))
          throw new Error(
            "Guarda los cambios pendientes de la consulta y vuelve a abrir esta guía.",
          );
        const [next, saved] = await Promise.all([
          clinicalObjective(consultationId, revision),
          clinicalWorkspace(consultationId, revision),
        ]);
        if (alive) {
          setContext(next);
          setWorkspace(saved);
        }
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar los datos guardados. Cierra esta guía y vuelve a abrirla.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [consultationId, revision]);

  async function act(action: () => void | Promise<boolean>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await before()))
        throw new Error(
          "No pudimos guardar el avance. Tus datos siguen aquí; reintenta antes de continuar.",
        );
      const result = await action();
      if (result === false)
        throw new Error("Guarda los cambios pendientes antes de continuar.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos continuar. Tus datos se conservan.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const facts = context?.facts ?? [];
  const historical = (source: string) =>
    /^(Historial|Antecedente de entrevista|PES previo aprobado)/.test(source);
  const current = facts.filter((fact) => !historical(fact.source));
  const sources: {
    title: string;
    detail: string;
    available: boolean;
    target: PesContextTarget;
  }[] = [
    {
      title: "Entrevista y valoración",
      detail:
        "Motivo, síntomas, alimentación habitual, antecedentes, medicamentos y factores que podrían explicar el problema.",
      available: current.some((fact) => /^Entrevista/.test(fact.source)),
      target: { module: "interview", label: "Entrevista", path: "Entrevista" },
    },
    {
      title: "Alimentación del día",
      detail:
        "Recordatorio confirmado. Describe un día y complementa la alimentación habitual.",
      available: !!workspace?.records.recall,
      target: {
        module: "recall",
        label: "Alimentación del día",
        path: "Recordatorio de 24 horas",
      },
    },
    {
      title: "Mediciones y cálculos",
      detail:
        "Valores registrados, composición corporal, métodos y fechas. Los datos de ficha se distinguen de las mediciones de esta consulta.",
      available: current.some(
        (fact) =>
          fact.origin === "measurement" || fact.origin === "calculation",
      ),
      target: {
        module: "measurements",
        label: "Mediciones",
        path: "Mediciones",
      },
    },
    {
      title: "Estudios",
      detail:
        "Resultados registrados con sus unidades y referencias, cuando sean pertinentes para este problema.",
      available: current.some((fact) => fact.origin === "laboratory"),
      target: {
        module: "laboratories",
        label: "Estudios",
        path: "Laboratorios",
      },
    },
    {
      title: "Consultas anteriores",
      detail:
        "Antecedentes de la consulta inicial y seguimientos seleccionados, con su fecha. Confirma qué sigue vigente.",
      available: facts.some((fact) => historical(fact.source)),
      target: {
        module: "clinical",
        label: "Consultas anteriores",
        path: "Revisión clínica → Datos → Consultas anteriores",
      },
    },
  ];
  const gaps = [
    ...new Set(missingContext.map((text) => text.trim()).filter(Boolean)),
  ];
  function fields(items: PesContextField[]) {
    return (
      <div className="pes-context-targets">
        {items.map(({ target, recorded }) => (
          <div key={`${target.module}:${target.questionKey ?? ""}`}>
            <span className="pes-context-field-status">
              {recorded
                ? "Ya tiene información · revisa si responde lo solicitado"
                : "Por registrar o confirmar"}
            </span>
            <button
              type="button"
              disabled={busy || loading}
              className="pes-context-link"
              onClick={() =>
                void act(async () => {
                  const ok = await onOpenTarget(target);
                  if (ok) onClose();
                  return ok;
                })
              }
            >
              {target.path}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            {target.hint && <p>{target.hint}</p>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="pes-context-title"
      aria-describedby="pes-context-description"
      className="pes-context-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="pes-context-header">
        <div>
          <p className="nuth-eyebrow">Antes de generar · sin consumo de IA</p>
          <h2 id="pes-context-title" tabIndex={-1}>
            Información para completar el PES
          </h2>
        </div>
        <button
          autoFocus
          type="button"
          aria-label="Cerrar guía del PES"
          className="nuth-button-secondary !p-2"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="pes-context-body">
        <p id="pes-context-description">
          Para redactar un buen PES necesitas identificar el problema,
          documentar los factores que podrían explicarlo y registrar los datos
          que lo respaldan. Completa lo pertinente para este caso.
        </p>
        <p className="pes-context-help">
          Una medición elevada puede apoyar el problema sin demostrar su causa.
          Tener campos llenos no confirma la etiología. No es obligatorio
          completar todos los módulos.
        </p>
        {loading && <p role="status">Consultando los datos guardados…</p>}
        {error && (
          <p role="alert" className="clinical-notice is-warning">
            {error}
          </p>
        )}
        {gaps.length > 0 && (
          <section aria-labelledby="pes-context-gaps">
            <h3 id="pes-context-gaps">Preguntas de la última propuesta</h3>
            <p>
              Siguen por confirmar hasta revisar la información y generar una
              nueva propuesta. Si ya registraste el dato, comprueba su detalle y
              vigencia.
            </p>
            {gaps.map((gap, index) => {
              const targets = pesGapTargets(gap, structure, answers);
              return (
                <article key={gap} className="pes-context-gap">
                  <h4>
                    {index + 1}. {gap}
                  </h4>
                  {fields(targets)}
                  <p className="pes-context-help">
                    {targets.length
                      ? "Si el campo no permite detallar toda la respuesta, usa el complemento clínico de abajo."
                      : "No encontramos un campo específico en este diseño. Registra lo confirmado en el complemento clínico de abajo."}
                  </p>
                  <button
                    type="button"
                    className="pes-context-link"
                    onClick={() => {
                      notesRef.current?.focus();
                      notesRef.current?.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    }}
                  >
                    Añadir aclaración clínica
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </section>
        )}
        {!gaps.length && (
          <section aria-labelledby="pes-context-fields">
            <h3 id="pes-context-fields">
              Campos útiles para documentar el caso
            </h3>
            <p>
              Revisa lo registrado y completa lo que corresponda. Esta guía
              comprueba presencia de información; la suficiencia clínica se
              valora con el PES.
            </p>
            {fields(pesSuggestedFields(structure, answers))}
            {missingEtiology && (
              <p className="clinical-notice is-warning">
                La causa todavía no está sustentada. Confirma con el paciente
                los factores relacionados con el problema y registra lo que
                encuentres, sin sustituirlo por «NA».
              </p>
            )}
          </section>
        )}
        <section aria-labelledby="pes-context-sources">
          <h3 id="pes-context-sources">Fuentes que revisará la IA</h3>
          <div className="pes-context-sources">
            {sources.map((source) => (
              <article key={source.title}>
                <div className="flex items-start gap-2">
                  {source.available ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <ClipboardList size={18} aria-hidden="true" />
                  )}
                  <div>
                    <h4>{source.title}</h4>
                    <span>
                      {loading
                        ? "Consultando…"
                        : context
                          ? source.available
                            ? "Con información guardada"
                            : "Sin información en esta fuente"
                          : "No se pudo comprobar"}
                    </span>
                  </div>
                </div>
                <p>{source.detail}</p>
                <button
                  type="button"
                  className="pes-context-link"
                  disabled={busy || loading}
                  onClick={() =>
                    void act(async () => {
                      const ok = await onOpenTarget(source.target);
                      if (ok) onClose();
                      return ok;
                    })
                  }
                >
                  Ir a {source.title.toLocaleLowerCase("es")}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </section>
        <section aria-labelledby="pes-context-notes">
          <h3 id="pes-context-notes">
            Complemento clínico para el PES · opcional
          </h3>
          <p>
            Si tu diseño no tiene un campo para la respuesta, registra aquí lo
            confirmado con el paciente y tu valoración. Se guarda en esta
            consulta y se incluye en el contexto de la IA; no aprueba el
            diagnóstico.
          </p>
          <label htmlFor="pes-context-notes-input" className="sr-only">
            Información clínica adicional para el PES
          </label>
          <textarea
            id="pes-context-notes-input"
            ref={notesRef}
            className="nuth-input mt-3 min-h-32"
            value={notes}
            maxLength={12000}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Indica qué dato confirmaste, desde cuándo ocurre y cómo se relaciona con el problema, si se conoce."
          />
        </section>
      </div>
      <footer className="pes-context-footer">
        <p>
          Solo generar una propuesta consume créditos. Tu borrador actual se
          conserva al consultar o completar los datos.
        </p>
        <div>
          <button
            type="button"
            className="nuth-button-secondary"
            disabled={busy}
            onClick={() => void act(onClose)}
          >
            {busy ? "Guardando…" : "Guardar y volver al PES"}
          </button>
          {intent === "generate" && (
            <button
              type="button"
              className="nuth-button"
              disabled={busy || loading || !context}
              onClick={() =>
                void act(() => {
                  onClose();
                  onGenerate();
                })
              }
            >
              <RefreshCw size={16} aria-hidden="true" />
              Generar con estos datos
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
