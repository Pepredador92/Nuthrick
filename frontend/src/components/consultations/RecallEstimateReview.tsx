import { isRecallEstimate, recallEstimateTotals, recallNutrients, type RecallEstimate } from '@/src/features/consultations/recallEstimate';

const confidenceLabels = { low: 'Alta incertidumbre', moderate: 'Incertidumbre moderada', high: 'Porciones bien descritas' };
export function RecallEstimateSummary({ estimate }: { estimate: RecallEstimate }) {
  if (!isRecallEstimate(estimate)) return <p role="alert">Completa valores válidos para todas las comidas antes de confirmar.</p>;
  const { total, macros } = recallEstimateTotals(estimate);
  return <section className="recall-totals" aria-label="Resumen nutricional estimado con IA">
    <div className="recall-nutrient-grid">{recallNutrients.map(n => <div key={n.key}><small>{n.key === 'energy_kcal' ? 'Energía estimada' : n.label}</small><strong>{total[n.key].toFixed(n.key === 'energy_kcal' ? 0 : 1)} <span>{n.unit}</span></strong></div>)}</div>
    <div className="mt-4" aria-label="Distribución de macronutrientes">
      <div className="recall-macro-bar" aria-hidden="true">{macros.map(m => <span key={m.code} style={{ width: `${m.percentage ?? 0}%`, backgroundColor: m.color }} />)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{macros.map(m => <li key={m.code}>{m.label}: {m.percentage === null ? 'Sin datos' : `${m.percentage.toFixed(1)} %`}</li>)}</ul>
    </div>
    <p>Consumo aproximado del relato de un día · {confidenceLabels[estimate.confidence]}. Distribución calculada con factores 4/4/9.</p>
    <details className="mt-3"><summary>Ver alimentos y consumo por comida</summary><div className="recall-meal-list">{estimate.meals.map((m, i) => <div key={i}><h5>{m.mealLabel} · {m.energy_kcal.toFixed(0)} kcal</h5><p>{m.description}</p><small>Proteína {m.protein_g.toFixed(1)} g · Carbohidratos {m.carbohydrate_g.toFixed(1)} g · Grasas {m.fat_g.toFixed(1)} g</small></div>)}</div></details>
    {(estimate.assumptions.length > 0 || estimate.uncertainties.length > 0) && <details className="mt-3" open><summary>Porciones asumidas y detalles por confirmar</summary>{estimate.assumptions.length > 0 && <><h5 className="mt-3 font-semibold">Supuestos del cálculo</h5><ul className="list-disc pl-5 text-sm">{estimate.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul></>}{estimate.uncertainties.length > 0 && <><h5 className="mt-3 font-semibold">Lo que falta precisar</h5><ul className="list-disc pl-5 text-sm">{estimate.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul></>}</details>}
  </section>;
}
export function RecallEstimateReview({ estimate, onChange }: { estimate: RecallEstimate; onChange: (next: RecallEstimate) => void }) {
  const update = (index: number, patch: Partial<RecallEstimate['meals'][number]>) => onChange({ ...estimate, meals: estimate.meals.map((meal, i) => i === index ? { ...meal, ...patch } : meal) });
  return <div className="recall-estimate-review">
    <p className="consultation-guided-hint">La IA estimó las porciones que faltaban. Revisa esos supuestos con el paciente y corrige lo necesario.</p>
    {estimate.meals.map((meal, i) => <article className="recall-estimate-meal" key={i}>
      <header><strong>{meal.mealLabel}</strong><button type="button" className="text-xs underline" disabled={estimate.meals.length === 1} onClick={() => onChange({ ...estimate, meals: estimate.meals.filter((_, index) => i !== index) })}>Quitar comida</button></header>
      <label>Tiempo de comida<input aria-label={`Comida ${i + 1}`} className="nuth-input" maxLength={120} value={meal.mealLabel} onChange={e => update(i, { mealLabel: e.target.value })} /></label>
      <label>Alimentos y porciones<textarea aria-label={`Alimentos y porciones ${i + 1}`} className="nuth-input" rows={3} maxLength={1000} value={meal.description} onChange={e => update(i, { description: e.target.value })} /></label>
      <div className="recall-estimate-values">{recallNutrients.map(n => <label key={n.key}>{n.label} · {n.unit}<input className="nuth-input" aria-label={`${n.label} ${i + 1}`} type="number" min={0} max={n.max} step={n.key === 'energy_kcal' ? 1 : 0.1} value={Number.isFinite(meal[n.key]) ? meal[n.key] : ''} onChange={e => update(i, { [n.key]: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>)}</div>
    </article>)}
    <label>Porciones o preparación asumidas<textarea className="nuth-input" aria-label="Supuestos del cálculo" rows={3} value={estimate.assumptions.join('\n')} onChange={e => onChange({ ...estimate, assumptions: e.target.value.split('\n').filter(s => s.trim()) })} /></label>
    <label>Detalles por confirmar<textarea className="nuth-input" aria-label="Detalles por confirmar" rows={3} value={estimate.uncertainties.join('\n')} onChange={e => onChange({ ...estimate, uncertainties: e.target.value.split('\n').filter(s => s.trim()) })} /></label>
    <RecallEstimateSummary estimate={estimate} />
  </div>;
}
