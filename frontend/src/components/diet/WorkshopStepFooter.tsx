import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  onPrevious?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextHint?: string;
  nextAriaLabel?: string;
  finalStep?: boolean;
};

/** Purely visual, shared navigation for the Diet Workshop steps. */
export function WorkshopStepFooter({ onPrevious, onNext, nextDisabled = false, nextHint, nextAriaLabel = "Ir al siguiente paso del Taller", finalStep = false }: Props) {
  return (
    <footer className="sticky bottom-3 z-10 mt-6 border-t border-[#dfe6e1] bg-white/95 pt-4 backdrop-blur sm:bottom-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#dfe6e1] bg-[#fbfcfa] p-2 shadow-[0_10px_28px_rgba(23,61,54,.08)]">
        {onPrevious ? (
          <button type="button" className="nuth-button-secondary !px-3 !py-2.5" onClick={onPrevious}>
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Anterior</span>
          </button>
        ) : <span />}
        <div className="min-w-0 text-right">
          {nextHint && <p className="hidden text-xs text-[#718078] sm:block">{nextHint}</p>}
          {onNext ? (
            <button
              type="button"
              aria-label={nextAriaLabel}
              disabled={nextDisabled}
              className="nuth-button !px-3 !py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={onNext}
            >
              {finalStep ? "Siguiente" : "Siguiente"} <ArrowRight size={16} />
            </button>
          ) : (
            <span className="px-2 text-xs font-medium text-[#718078]">{nextHint}</span>
          )}
        </div>
      </div>
    </footer>
  );
}
