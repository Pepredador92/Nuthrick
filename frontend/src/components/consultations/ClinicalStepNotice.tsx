import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useEffect, useRef } from 'react';
import "./ClinicalStepNotice.css";
export type ClinicalCompletion = {
  id: number;
  message: string;
  nextStage?: number;
};
export function ClinicalStepNotice(
  { completion, onClose, onContinue }: {
    completion: ClinicalCompletion | null;
    onClose: () => void;
    onContinue: (stage: number) => void;
  },
) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!completion) return;
    const timer = window.setTimeout(() => close.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [completion]);
  if (!completion) return null;
  return (
    <aside className="clinical-step-notice" aria-label="Avance de la consulta">
      <CheckCircle2 size={24} aria-hidden="true" />
      <div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          key={completion.id}
        >
          {completion.message}
        </p>
        {completion.nextStage !== undefined && (
          <button
            type="button"
            onClick={() => onContinue(completion.nextStage!)}
          >
            Continuar al siguiente paso<ArrowRight size={15} />
          </button>
        )}
      </div>
      <button
        type="button"
        className="clinical-step-notice-close"
        aria-label="Cerrar aviso de avance"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
