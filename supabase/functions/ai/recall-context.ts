import { calculateRecall } from './diet-generation-domain.js';
import type { ClinicalSource, ClinicalFact } from './clinical.ts';
type StoredRecallItem = { mealLabel: string; quantity: number; unit: string; food: { name: string; portion_amount: number; [key: string]: unknown } };

/** Only owner-scoped, confirmed records returned by the database reach here. */
export function withConfirmedRecall(source: ClinicalSource): ClinicalSource {
  const record = source.recall as { approved_at?: unknown; items?: unknown } | undefined;
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
    ...source.facts.filter(fact => !fact.source.startsWith('Recordatorio confirmado') && fact.source !== 'Entrevista · recall 24h v2'),
  ] };
}
