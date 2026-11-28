import { useEffect, useId, useRef, useState } from "react";
import { Download, FileText, LoaderCircle, X } from "lucide-react";
import { type PdfDesign, PdfDesignSelector } from "./PdfDesignSelector";

export function PdfExportDialog(
  { title, description, onClose, onDownload, onDownloadText }: {
    title: string;
    description: string;
    onClose: () => void;
    onDownload: (design: PdfDesign) => Promise<void>;
    onDownloadText?: () => Promise<void>;
  },
) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    lock = useRef(false);
  const [design, setDesign] = useState<PdfDesign>("current"),
    [busy, setBusy] = useState<"pdf" | "txt" | null>(null),
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
  async function download(format: "pdf" | "txt") {
    if (lock.current) return;
    lock.current = true;
    setBusy(format);
    setError("");
    try {
      if (format === "pdf") await onDownload(design);
      else await onDownloadText?.();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `No pudimos generar el ${format.toUpperCase()}. Intenta nuevamente.`,
      );
    } finally {
      lock.current = false;
      setBusy(null);
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
            disabled={busy !== null}
            aria-label={onDownloadText ? "Cerrar exportación" : "Cerrar opciones de PDF"}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        <div className="pdf-export-body">
          <PdfDesignSelector
            value={design}
            onChange={setDesign}
            disabled={busy !== null}
          />
          {error && <p role="alert" className="pdf-export-error">{error}</p>}
        </div>
        <footer>
          {onDownloadText ? <button
            type="button"
            className="nuth-button-secondary"
            disabled={busy !== null}
            onClick={() => void download("txt")}
          >
            {busy === "txt" ? <LoaderCircle size={16} className="animate-spin" /> : <FileText size={16} />}
            {busy === "txt" ? "Preparando TXT…" : "Descargar TXT"}
          </button> : <button
            type="button"
            className="nuth-button-secondary"
            disabled={busy !== null}
            onClick={onClose}
          >
            Cancelar
          </button>}
          <button
            type="button"
            className="nuth-button"
            disabled={busy !== null}
            onClick={() => void download("pdf")}
          >
            {busy === "pdf"
              ? <LoaderCircle size={16} className="animate-spin" />
              : <Download size={16} />}
            {busy === "pdf" ? "Preparando PDF…" : "Descargar PDF"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
