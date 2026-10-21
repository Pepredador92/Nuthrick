import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

export type StrategyDraftAction = "clear" | "delete" | "discard" | "withdraw";
const actionCopy = {
  clear: {
    title: "Limpiar los campos de la estrategia",
    description:
      "Se vaciarán el texto, los objetivos seleccionados y los detalles de esta edición. La tarjeta se conservará como borrador. Si existe una versión aprobada, seguirá en el historial.",
    button: "Limpiar campos",
  },
  delete: {
    title: "Eliminar este borrador",
    description:
      "Se eliminará esta estrategia sin aprobar y desaparecerá de la lista. Esta acción no elimina los objetivos de la consulta.",
    button: "Eliminar borrador",
  },
  discard: {
    title: "Descartar los cambios de la estrategia",
    description:
      "Se quitará la edición pendiente y volverás a ver la versión aprobada, si existe; de lo contrario, el último borrador guardado.",
    button: "Descartar cambios",
  },
  withdraw: {
    title: "Retirar esta estrategia",
    description:
      "Dejará de estar activa. Se conservarán su aprobación y su historial de ejecución.",
    button: "Retirar estrategia",
  },
};

export function InterventionStrategyActionDialog(
  { action, strategyTitle, busy, error, onCancel, onConfirm }: {
    action: StrategyDraftAction;
    strategyTitle: string;
    busy: boolean;
    error: string;
    onCancel: () => void;
    onConfirm: (reason: string) => void;
  },
) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const copy = actionCopy[action];
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal?.();
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      if (element?.open) element.close?.();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="clinical-objective-dialog clinical-strategy-action-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      open={typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onConfirm(reason.trim());
        }}
      >
        <header className="clinical-objective-dialog-heading">
          <h2 id={`${id}-title`}>{copy.title}</h2>
          <button
            type="button"
            aria-label="Cancelar"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </header>
        <div className="clinical-objective-dialog-body">
          <p className="font-semibold">{strategyTitle || "Nueva estrategia"}</p>
          <p id={`${id}-description`} className="mt-3">{copy.description}</p>
          {action === "withdraw" && (
            <label className="clinical-goal-field mt-4">
              <span>Motivo del retiro</span>
              <textarea
                className="nuth-input"
                required
                maxLength={1500}
                rows={3}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}
          {error && <p role="alert" className="clinical-notice mt-3">{error}
          </p>}
        </div>
        <footer className="clinical-objective-dialog-footer">
          <button
            ref={cancel}
            type="button"
            className="nuth-button-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="nuth-button"
            disabled={busy || action === "withdraw" && !reason.trim()}
          >
            {busy ? "Guardando…" : copy.button}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
