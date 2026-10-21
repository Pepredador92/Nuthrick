import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import "./ClinicalNextSteps.css";

/** Shared presentation only; each task owns its data and explicit save/review action. */
export function ClinicalTaskDialog(
  { open, title, description, busy = false, onClose, children, footer }: {
    open: boolean;
    title: string;
    description: string;
    busy?: boolean;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
  },
) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal?.();
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    return () => {
      if (element?.open) element.close?.();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="clinical-objective-dialog clinical-next-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      open={open &&
          (typeof HTMLDialogElement === "undefined" ||
            !HTMLDialogElement.prototype.showModal)
        ? true
        : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="clinical-objective-dialog-shell">
        <header className="clinical-objective-dialog-heading">
          <div>
            <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{title}</h2>
            <p id={`${id}-help`}>{description}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={`Cerrar ${title.toLocaleLowerCase()}`}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <div className="clinical-objective-dialog-body">{children}</div>
        <footer className="clinical-objective-dialog-footer">{footer}</footer>
      </div>
    </dialog>
  );
}
