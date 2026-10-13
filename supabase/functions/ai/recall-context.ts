import { calculateRecall, isRecallEstimate, recallEstimateTotals } from './diet-generation-domain.js';
import type { ClinicalSource, ClinicalFact } from './clinical.ts';
type StoredRecallItem = { mealLabel: string; quantity: number; unit: string; food: { name: string; portion_amount: number; [key: string]: unknown } };

/** Only owner-scoped, confirmed records returned by the database reach here. */
export function withConfirmedRecall(source: ClinicalSource): ClinicalSource {
  const record = source.recall as { approved_at?: unknown; items?: unknown; method?: unknown; estimate?: unknown } | undefined;
  if (record?.method === 'ai_estimate' && typeof record.approved_at === 'string' && Number.isFinite(Date.parse(record.approved_at)) && isRecallEstimate(record.estimate)) {
    const estimate = record.estimate as { confidence: string; assumptions: string[]; uncertainties: string[]; meals: { mealLabel: string; description: string; energy_kcal: number; protein_g: number; carbohydrate_g: number; fat_g: number }[] };
    const { total, macros } = recallEstimateTotals(estimate);
    const facts: ClinicalFact[] = [{ source: 'Recordatorio confirmado · Consumo estimado con IA y revisado por profesional',
      finding: `${total.energy_kcal.toFixed(0)} kcal; carbohidratos ${total.carbohydrate_g.toFixed(1)} g; proteína ${total.protein_g.toFixed(1)} g; grasas ${total.fat_g.toFixed(1)} g. Distribución energética 4/4/9: ${macros.map(m => `${m.label} ${m.percentage?.toFixed(1) ?? 'sin datos'} %`).join('; ')}. Estimación aproximada de un día, con incertidumbre ${estimate.confidence}; no representa por sí sola la ingesta habitual ni es una medición exacta.` },
      ...estimate.meals.slice(0, 8).map((meal, i) => ({ source: `Recordatorio confirmado · Comida ${i + 1}`, finding: `${meal.mealLabel}: ${meal.description}`.slice(0, 1200) })),
      ...estimate.assumptions.slice(0, 5).map((finding, i) => ({ source: `Recordatorio confirmado · Supuesto ${i + 1}`, finding })),
      ...estimate.uncertainties.slice(0, 5).map((finding, i) => ({ source: `Recordatorio confirmado · Incertidumbre ${i + 1}`, finding })),
    ];
    return { ...source, facts: [...facts, ...source.facts.filter(f => !f.source.startsWith('Recordatorio confirmado') && !f.source.startsWith('Entrevista · recall 24h v2'))] };
  }
  if (!record || typeof record.approved_at !== 'string' || !Array.isArray(record.items) || !record.items.length) return source;
  const items = record.items as StoredRecallItem[];
  if (items.some(item => !item?.food || typeof item.food.name !== 'string' || typeof item.mealLabel !== 'string'
    || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0
    || !Number.isFinite(item.food.portion_amount) || item.food.portion_amount <= 0)) return source;
  let nutrition: ReturnType<typeof calculateRecall>;
  try { nutrition = calculateRecall(items); } catch { return source; }
  const { total, macros } = nutrition;
  if (Object.values(total).some(value => !Number.isFinite(value))) return source;
  const recall: ClinicalFact[] = [{
    source: 'Recordatorio confirmado · Consumo estimado',
    finding: `${total.energy_kcal.toFixed(0)} kcal; carbohidratos ${total.carbohydrate_g.toFixed(1)} g; proteína ${total.protein_g.toFixed(1)} g; grasas ${total.fat_g.toFixed(1)} g. Distribución energética 4/4/9: ${macros.map(macro => `${macro.label} ${macro.percentage?.toFixed(1) ?? 'sin datos'} %`).join('; ')}. Estimación por equivalentes de un día; no representa por sí sola la ingesta habitual.`,
  }];
  let chunk = '', included = 0;
  for (const item of items) {
    const text = `${item.mealLabel}: ${item.food.name.slice(0, 120)}, ${Number(item.quantity.toFixed(3))} ${item.unit}`;
    if (chunk && chunk.length + text.length > 550) {
      recall.push({ source: `Recordatorio confirmado · Alimentos ${recall.length}`, finding: chunk });
      chunk = '';
    }
    if (recall.length >= 4) break;
    chunk += `${chunk ? '; ' : ''}${text}`;
    included++;
  }
  if (chunk) recall.push({ source: `Recordatorio confirmado · Alimentos ${recall.length}`, finding: chunk });
  if (included < items.length) recall[0].finding += ` Contexto acotado: se describen ${included} de ${items.length} alimentos; los totales incluyen todos los confirmados.`;
  return { ...source, facts: [
    ...recall,
    ...source.facts.filter(fact => !fact.source.startsWith('Recordatorio confirmado') && !fact.source.startsWith('Entrevista · recall 24h v2')),
  ] };
}
