import type { ClinicalMeasurementFact } from './clinicalCopilot';
export function clinicalMeasurementRows(facts: ClinicalMeasurementFact[]) {
  const groups = new Map<string, ClinicalMeasurementFact[]>();
  for (const fact of facts.filter(item => item.metric_code && (item.origin === 'measurement' || item.origin === 'calculation'))) {
    const key = [fact.metric_code, fact.unit, fact.method, fact.origin].join('|');
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const current = group.filter(fact => !fact.source.startsWith('Historial'));
    const historical = group.filter(fact => fact.source.startsWith('Historial')).sort((a, b) => (b.consultation_date ?? '').localeCompare(a.consultation_date ?? ''));
    const previous = historical.filter(fact => fact.consultation_date === historical[0]?.consultation_date);
    const comparable = current.length === 1 && previous.length === 1 && typeof current[0].numeric_value === 'number' && typeof previous[0].numeric_value === 'number';
    return { key, label: group[0].source.replace(/^(Antropometría|Cálculo registrado|Historial( calculado)?) · /, '').split(' · ')[0],
      method: group[0].method, unit: group[0].unit, current, previous,
      change: comparable ? Number((current[0].numeric_value! - previous[0].numeric_value!).toFixed(3)) : null,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
