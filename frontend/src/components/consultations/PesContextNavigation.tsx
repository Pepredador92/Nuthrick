import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowLeft } from "lucide-react";
import type { PesContextTarget } from "@/src/features/consultations/pesReadiness";
import {
  useConsultationDraft,
  useConsultationDraftContext,
} from "./ConsultationDrafts";

export type PesContextNavigationHandle = {
  open: (target: PesContextTarget) => Promise<boolean>;
};

export function PesContextNavigation({
  ref,
  atPes,
  before,
  beforeReturn,
  onOpen,
  onReturn,
}: {
  ref: Ref<PesContextNavigationHandle>;
  atPes: boolean;
  before: () => Promise<boolean>;
  beforeReturn: () => Promise<boolean>;
  onOpen: (target: PesContextTarget) => void;
  onReturn: () => void;
}) {
  const [target, setTarget] = useConsultationDraft<PesContextTarget | null>(
    "pes-context-navigation",
    null,
  );
  const checkpoints = useConsultationDraftContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useImperativeHandle(ref, () => ({
    open: async (next) => {
      if (lock.current) return false;
      lock.current = true;
      try {
        if (!(await before())) return false;
        setTarget(next);
        if (checkpoints && !(await checkpoints.flush())) {
          setTarget(target);
          return false;
        }
        onOpen(next);
        return true;
      } finally {
        lock.current = false;
      }
    },
  }));
  if (!target || atPes) return null;
  async function back() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await beforeReturn()))
        throw new Error(
          "Guarda las mediciones y estudios pendientes, o confirma el recordatorio antes de volver al PES.",
        );
      setTarget(null);
      if (checkpoints && !(await checkpoints.flush())) {
        setTarget(target);
        throw new Error(
          "No pudimos guardar el avance. Reintenta antes de continuar.",
        );
      }
      onReturn();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar. Tu avance se conserva.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <aside
      className="pes-context-return"
      aria-label="Completar información para el PES"
    >
      <div>
        <strong>Estás completando información para el PES</strong>
        <p>{target.path}</p>
        {target.hint && <p>{target.hint}</p>}
        <p>
          Registra o precisa lo necesario y vuelve al diagnóstico. Tu borrador
          se conserva.
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        className="nuth-button-secondary"
        onClick={() => void back()}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {busy ? "Guardando…" : "Guardar y volver al PES"}
      </button>
    </aside>
  );
}
