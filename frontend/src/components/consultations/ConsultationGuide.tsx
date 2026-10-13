import './ConsultationGuide.css';

export function ConsultationGuide({ steps, active, onChange, label, busy = false }: {
  steps: { title: string; description: string; disabled?: boolean }[];
  active: number;
  onChange: (index: number) => void;
  label: string;
  busy?: boolean;
}) {
  return <nav className="consultation-guide-steps" aria-label={label}>
    {steps.map((step, index) => <button key={step.title} type="button" disabled={busy || step.disabled}
      aria-current={index === active ? 'step' : undefined} onClick={() => onChange(index)}>
      <span className="consultation-guide-number" aria-hidden="true">{index + 1}</span>
      <span><strong>{step.title}</strong>{' '}<small>{step.description}</small></span>
    </button>)}
  </nav>;
}
