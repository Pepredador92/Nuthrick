import './ConsultationGuide.css';
import { Check } from 'lucide-react';
import type { ClinicalTaskStatus } from './ClinicalTaskCard';

export function ConsultationGuide({ steps, active, onChange, label, busy = false }: {
  steps: { title: string; description: string; disabled?: boolean; status?: ClinicalTaskStatus; statusLabel?: string }[];
  active: number;
  onChange: (index: number) => void;
  label: string;
  busy?: boolean;
}) {
  return <nav className="consultation-guide-steps" aria-label={label}>
    {steps.map((step, index) => <button key={step.title} type="button" disabled={busy || step.disabled}
      aria-current={index === active ? 'step' : undefined} aria-label={`${step.title} ${step.description}${step.statusLabel ? ` · ${step.statusLabel}` : ''}`} data-status={step.status} onClick={() => onChange(index)}>
      <span className="consultation-guide-number" aria-hidden="true">{step.status === 'complete' || step.status === 'approved' ? <Check size={15} /> : index + 1}</span>
      <span><strong>{step.title}</strong>{' '}<small>{step.statusLabel ?? step.description}</small></span>
    </button>)}
  </nav>;
}
