import { useEffect, useState } from "react";
import { portalAction, type PortalContent } from "@/src/services/patientPortal";
import {
  type ClinicalCandidates,
  clinicalSourceKey,
  type SharedObjective,
  type SharedStrategy,
} from "../../../../supabase/functions/_shared/clinical-guidance";
import {
  SharedObjectiveCard,
  SharedStrategyCard,
} from "./SharedClinicalGuidance";
import { portalDate } from "./PortalContentView";

export function PortalClinicalSharing(
  { patientId, content, onChange, disabled = false }: {
    patientId: string;
    content: PortalContent;
    onChange: (content: PortalContent) => void;
    disabled?: boolean;
  },
) {
  const [candidates, setCandidates] = useState<
      ClinicalCandidates["consultations"]
    >([]),
    [selectedConsultation, setSelectedConsultation] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true, inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await portalAction<ClinicalCandidates>(
          { patientId },
          "clinical_candidates",
        );
        if (alive) {
          setCandidates(result.consultations ?? []);
          setError("");
        }
      } catch {
        if (alive) {
          setError(
            "No pudimos cargar los acuerdos de consulta. Vuelve a intentar.",
          );
        }
      } finally {
        inFlight = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [patientId, retry]);
  const sourceId = selectedConsultation ||
    content.objectives?.[0]?.source.consultationId ||
    content.strategies?.[0]?.source.consultationId || candidates[0]?.id;
  const current = candidates.find((c) => c.id === sourceId) ?? candidates[0];
  const chosen = (
    kind: "objectives" | "strategies",
    entry: SharedObjective | SharedStrategy,
  ) =>
    content[kind]?.some((value) =>
      clinicalSourceKey(value.source) === clinicalSourceKey(entry.source)
    ) ?? false;
  function toggle(
    kind: "objectives" | "strategies",
    entry: SharedObjective | SharedStrategy,
    checked: boolean,
  ) {
    const key = clinicalSourceKey(entry.source), previous = content[kind] ?? [];
    const next = checked
      ? [
        ...previous.filter((value) => clinicalSourceKey(value.source) !== key),
        entry,
      ]
      : previous.filter((value) => clinicalSourceKey(value.source) !== key);
    onChange({
      ...content,
      [kind]: next,
      ...(checked && kind === "objectives" && content.goalSource
        ? { goal: "", goalSource: null }
        : {}),
    });
  }
  return (
    <section
      className="mt-5"
      aria-label="Objetivos y estrategias para compartir"
    >
      <div className="clinical-share-heading">
        <h3 className="font-semibold">Acuerdos de la consulta</h3>
        <span className="clinical-share-count">
          {content.objectives?.length ?? 0} {content.objectives?.length===1?"objetivo":"objetivos"} ·{" "}
          {content.strategies?.length ?? 0} {content.strategies?.length===1?"estrategia seleccionada":"estrategias seleccionadas"}
        </span>
      </div>
      <p className="mb-3 text-sm text-[var(--nuth-muted)]">
        Selecciona las tarjetas que verá el paciente. Revisa su contenido antes
        de publicar.
      </p>
      {loading
        ? <p role="status">Buscando acuerdos aprobados…</p>
        : error
        ? (
          <div role="alert">
            <p>{error}</p>
            <button
              className="clinical-text-action"
              onClick={() => {
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              Volver a intentar
            </button>
          </div>
        )
        : !candidates.length
        ? (
          <p className="text-sm text-[var(--nuth-muted)]">
            Los objetivos y estrategias aprobados estarán disponibles cuando
            finalices la consulta.
          </p>
        )
        : (
          <>
            <label className="block text-xs font-semibold text-[var(--nuth-muted)]">
              Consulta de origen<select
                className="nuth-input mt-2"
                aria-label="Consulta de origen de los acuerdos"
                value={current?.id ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  setSelectedConsultation(event.target.value)}
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    Consulta del {portalDate(c.date)} · Revisión {c.revision}
                  </option>
                ))}
              </select>
            </label>
            {!current?.objectives.length && !current?.strategies.length && (
              <p className="mt-3 text-sm text-[var(--nuth-muted)]">
                Esta consulta todavía no tiene objetivos SMART ni estrategias
                aprobadas vigentes.
              </p>
            )}
            {current?.objectives.map((goal, index) => (
              <div
                key={clinicalSourceKey(goal.source)}
                className={`clinical-share-choice${
                  chosen("objectives", goal) ? " is-selected" : ""
                }`}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={chosen("objectives", goal)}
                    disabled={disabled ||
                      !chosen("objectives", goal) &&
                        (content.objectives?.length ?? 0) >= 12}
                    onChange={(e) =>
                      toggle("objectives", goal, e.target.checked)}
                  />Compartir objetivo {index + 1}
                </label>
                <SharedObjectiveCard goal={goal} />
              </div>
            ))}
            {current?.strategies.map((strategy, index) => (
              <div
                key={clinicalSourceKey(strategy.source)}
                className={`clinical-share-choice${
                  chosen("strategies", strategy) ? " is-selected" : ""
                }`}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={chosen("strategies", strategy)}
                    disabled={disabled ||
                      !chosen("strategies", strategy) &&
                        (content.strategies?.length ?? 0) >= 30}
                    onChange={(e) =>
                      toggle("strategies", strategy, e.target.checked)}
                  />Compartir estrategia {index + 1}
                </label>
                <SharedStrategyCard strategy={strategy} />
              </div>
            ))}
          </>
        )}
      {Boolean(content.objectives?.length || content.strategies?.length) && (
        <details className="clinical-share-selection">
          <summary>Revisar toda la selección</summary>
          <ul>
            {content.objectives?.map((goal) => (
              <li key={clinicalSourceKey(goal.source)}>
                <span>{goal.outcome}</span>
                <button
                  disabled={disabled}
                  onClick={() =>
                    toggle("objectives", goal, false)}
                >
                  Quitar objetivo
                </button>
              </li>
            ))}
            {content.strategies?.map((strategy) => (
              <li key={clinicalSourceKey(strategy.source)}>
                <span>{strategy.title}</span>
                <button
                  disabled={disabled}
                  onClick={() =>
                    toggle("strategies", strategy, false)}
                >
                  Quitar estrategia
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
