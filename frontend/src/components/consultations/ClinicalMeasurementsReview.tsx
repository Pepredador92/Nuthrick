import { clinicalMeasurementRows } from '@/src/features/consultations/clinicalMeasurements';
import type { ClinicalMeasurementFact } from '@/src/features/consultations/clinicalCopilot';
const date = (fact: ClinicalMeasurementFact) => fact.consultation_date ? new Date(`${fact.consultation_date}T12:00:00`).toLocaleDateString('es-MX') : 'Fecha no registrada';
export function ClinicalMeasurementsReview({ facts }: { facts: ClinicalMeasurementFact[] }) {
  const rows = clinicalMeasurementRows(facts);
  const baseline = facts.filter(fact => fact.origin === 'baseline');
  return <section className="clinical-measurements-review" aria-label="Medidas actuales e históricas">
    <h3>Medidas actuales e históricas</h3><p>Compara cada indicador con su registro anterior. Revisa la fecha, la unidad y el método.</p>
    {rows.length ? <div className="clinical-measurements-scroll"><table><thead><tr><th scope="col">Indicador</th><th scope="col">Esta consulta</th><th scope="col">Anterior disponible</th><th scope="col">Cambio registrado</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}>
      <th scope="row">{row.label}<small>{row.method}</small></th>
      {[row.current, row.previous].map((readings, column) => <td key={column}>{readings.length ? readings.map((fact, index) => <div key={index}>{fact.numeric_value != null ? `${fact.numeric_value} ${fact.unit ?? ''}` : fact.finding}<small>{date(fact)}</small></div>) : <span>Sin registro</span>}</td>)}
      <td>{row.change !== null ? `${row.change > 0 ? '+' : ''}${row.change} ${row.unit === '%' ? 'puntos porcentuales' : row.unit ?? ''}` : 'Sin comparación'}{(row.current.length > 1 || row.previous.length > 1) && <small>Hay varias lecturas; revísalas antes de comparar.</small>}</td>
    </tr>)}</tbody></table></div> : <p className="clinical-review-empty">Las mediciones guardadas aparecerán aquí al actualizar la revisión. También puedes revisar los registros disponibles en el detalle de fuentes.</p>}
    {baseline.length > 0 && <div className="clinical-baseline"><h4>Datos de ficha</h4><p>Se muestran como antecedentes. No sustituyen una medición realizada hoy.</p><ul>{baseline.map(fact => <li key={fact.metric_code}><strong>{fact.source.replace('Dato de ficha · ', '')}</strong><span>{fact.finding}</span></li>)}</ul></div>}
    <details className="clinical-support-details"><summary>Alcance de la comparación</summary><p>El contexto histórico considera la primera consulta inicial y las tres consultas cerradas anteriores más recientes. La IA conserva el primer y último registro disponibles por indicador y método; ese resumen no representa toda la evolución.</p></details>
  </section>;
}
