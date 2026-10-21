import { useEffect, useId, useRef, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { type PdfDesign, PdfDesignSelector } from "./PdfDesignSelector";

export function PdfExportDialog(
  { title, description, onClose, onDownload }: {
    title: string;
    description: string;
    onClose: () => void;
    onDownload: (design: PdfDesign) => Promise<void>;
  },
) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    lock = useRef(false);
  const [design, setDesign] = useState<PdfDesign>("current"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    element?.showModal?.();
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    return () => {
      if (element?.open) element.close?.();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  async function download() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onDownload(design);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos generar el PDF. Intenta nuevamente.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="pdf-export-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      open={typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="pdf-export-shell">
        <header>
          <div>
            <p className="nuth-eyebrow">Tu documento</p>
            <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>{title}</h2>
            <p id={`${id}-help`}>{description}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Cerrar opciones de PDF"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        <div className="pdf-export-body">
          <PdfDesignSelector
            value={design}
            onChange={setDesign}
            disabled={busy}
          />
          {error && <p role="alert" className="pdf-export-error">{error}</p>}
        </div>
        <footer>
          <button
            type="button"
            className="nuth-button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="nuth-button"
            disabled={busy}
            onClick={() => void download()}
          >
            {busy
              ? <LoaderCircle size={16} className="animate-spin" />
              : <Download size={16} />}
            {busy ? "Preparando PDF…" : "Descargar PDF"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
