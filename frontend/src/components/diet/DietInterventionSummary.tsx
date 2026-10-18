import type { DietGenerationContext } from "@/src/features/diet-workshop/generationContext";
export function DietInterventionSummary(
  { items }: { items: DietGenerationContext["clinical"]["interventions"] },
) {
  if (!items?.length) return null;
  return (
    <details className="rounded-xl border border-[var(--nuth-line)] p-3 text-sm">
      <summary className="font-semibold">
        Estrategias de alimentación aprobadas
      </summary>
      <ul className="mt-3 space-y-3">
        {items.map((s, i) => (
          <li key={i}>
            <strong>{s.title}</strong>
            <p className="mt-1 whitespace-pre-line">{s.action}</p>
            <p className="mt-1 text-xs text-[var(--nuth-muted)]">
              {[s.method, s.frequency, s.adaptations, s.composition].filter(
                Boolean,
              ).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--nuth-muted)]">
        Revisa su coherencia con la prescripción y las restricciones
        confirmadas.
      </p>
    </details>
  );
}
