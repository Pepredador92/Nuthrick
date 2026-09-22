import { useEffect, useState } from "react";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";

export function ClinicalObjective({
  consultationId,
  revision,
  questionKey,
  value,
  before,
}: {
  consultationId: string;
  revision: number;
  questionKey: string;
  value: unknown;
  before: () => Promise<boolean>;
}) {
  const [workspace, setWorkspace] = useState<ObjectiveWorkspace | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void clinicalObjective(consultationId, revision)
      .then((w) => {
        if (alive) setWorkspace(w);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [consultationId, revision]);
  const approved =
    !!workspace?.objective &&
    workspace.objective.question_key === questionKey &&
    JSON.stringify(workspace.objective.value) === JSON.stringify(value);
  const hasValue =
    typeof value === "string"
      ? !!value.trim()
      : Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === "string" && !!v.trim());
  async function review(action: "approve" | "revoke" | "read") {
    setBusy(true);
    setMessage("");
    try {
      if (!(await before()))
        throw new Error("Guarda la entrevista antes de continuar.");
      const fresh = await clinicalObjective(consultationId, revision);
      setWorkspace(fresh);
      if (action !== "read") {
        setWorkspace(
          await clinicalObjective(
            consultationId,
            revision,
            action,
            fresh.stamp,
            questionKey,
          ),
        );
        setMessage(
          action === "approve"
            ? "Objetivo aprobado. Las kcal y los macros no se modificaron."
            : "Objetivo pendiente de revisión. El texto se conserva.",
        );
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No pudimos revisar el objetivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Revisión del objetivo"
      className="mt-5 rounded-2xl border border-[#dfe5e1] bg-[#f7faf8] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[#173d36]">Objetivo acordado</h3>
        <span className="text-xs text-[#687870]">
          {approved ? "Aprobado" : "Pendiente de revisión"}
        </span>
      </div>
      {workspace?.pes ? (
        <div className="mt-3 text-sm text-[#315e4f]">
          <p className="text-xs font-semibold">PES aprobado</p>
          <p className="mt-1 whitespace-pre-line">
            {workspace.pes.pesStatement}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#687870]">
          Puedes redactar el objetivo abajo. Para aprobarlo, revisa primero el
          PES.
        </p>
      )}
      <p className="mt-3 text-xs text-[#687870]">
        El objetivo expresa lo acordado con el paciente. Las kcal objetivo y los
        macronutrientes se ajustan por separado.
      </p>
      <details className="mt-3 text-xs text-[#52675f]">
        <summary className="cursor-pointer">
          Consultar contexto registrado
        </summary>
        <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">
          {workspace?.facts.map((f, i) => (
            <li key={i}>
              <strong>{f.source}</strong>: {f.finding}
            </li>
          ))}
        </ul>
        {workspace?.target?.energy_kcal != null && (
          <p className="mt-2">
            Prescripción registrada: {workspace.target.energy_kcal} kcal. No es
            el objetivo clínico.
          </p>
        )}
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !hasValue || !workspace?.pes || approved}
          onClick={() => void review("approve")}
          className="rounded-lg bg-[#173d36] px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Aprobar objetivo"}
        </button>
        {approved && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void review("revoke")}
            className="rounded-lg border border-[#dfe5e1] px-3 py-2 text-sm"
          >
            Volver a revisar
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void review("read")}
          className="px-3 py-2 text-sm text-[#315e4f]"
        >
          Actualizar contexto
        </button>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-[#52675f]">
          {message}
        </p>
      )}
    </section>
  );
}
