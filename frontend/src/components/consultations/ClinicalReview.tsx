import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw, Utensils, History } from 'lucide-react';
import { clinicalObjective, clinicalWorkspace, type ClinicalWorkspace, type ObjectiveWorkspace } from '@/src/services/clinicalCopilot';
import { InterviewReview } from './InterviewReview';
import { ConfirmedRecall } from './ClinicalCopilot';
import { emptyValue, matchesCondition } from '@/src/features/consultations/questionnaire';
import type { Answers } from '@/src/features/consultations/questionnaire';
import type { ConsultationSnapshot } from '@/src/types/domain';
import { workflowSections } from '@/src/features/consultations/consultationWorkflow';

export function ClinicalReview({ consultationId, snapshot, values, active, before }: {
  consultationId: string; snapshot: ConsultationSnapshot; values: Answers; active: boolean; before: () => Promise<boolean>;
}) {
  const [context, setContext] = useState<ObjectiveWorkspace | null>(null);
  const [records, setRecords] = useState<ClinicalWorkspace['records']>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void Promise.all([clinicalObjective(consultationId, snapshot.revision), clinicalWorkspace(consultationId, snapshot.revision)])
      .then(([next, workspace]) => { if (alive) { setContext(next); setRecords(workspace.records); setError(''); } })
      .catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : 'No pudimos cargar la revisión.'); });
    return () => { alive = false; };
  }, [active, consultationId, snapshot.revision]);
  const historical = (source: string) => /^(Historial|Antecedente de entrevista|PES previo aprobado)/.test(source);
  const facts = context?.facts ?? [];
  const currentFacts = facts.filter(fact => !historical(fact.source));
  const historyFacts = facts.filter(fact => historical(fact.source));
  const interviewStructure = { ...snapshot.structure, sections: workflowSections(snapshot.structure, 'interview') };
  const hasInterviewAnswers = interviewStructure.sections.some(section => section.questions.some(question => matchesCondition(question.visibility_condition, values) && !emptyValue(values[question.question_key])));
  async function refresh() {
    setLoading(true);
    try {
      if (!await before()) return;
      const [next, workspace] = await Promise.all([clinicalObjective(consultationId, snapshot.revision), clinicalWorkspace(consultationId, snapshot.revision)]);
      setContext(next); setRecords(workspace.records); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos actualizar la revisión.'); }
    finally { setLoading(false); }
  }
  return <section className="consultation-clinical-card" aria-labelledby="clinical-review-title">
    <header className="consultation-clinical-title"><span className="consultation-clinical-icon"><ClipboardCheck size={21} /></span><div><p className="nuth-eyebrow">01 · Revisa</p><h2 id="clinical-review-title">Revisión clínica</h2></div><button type="button" className="nuth-button-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} />{loading ? 'Actualizando…' : 'Actualizar revisión'}</button></header>
    <p className="consultation-clinical-description">Comprueba los datos que usarás para el diagnóstico. Abre solo lo que necesites revisar.</p>
    {!context && !error && <p role="status" className="clinical-review-empty">Reuniendo los datos de la consulta…</p>}
    <div className="clinical-review-summary">
      <div><ClipboardCheck size={19} aria-hidden="true" /><strong>Esta consulta</strong><span>{context ? `${currentFacts.length} datos disponibles` : 'Cargando datos'}</span></div>
      <div><Utensils size={19} aria-hidden="true" /><strong>Recordatorio de 24 horas</strong><span>{records.recall ? 'Confirmado y listo para usar' : 'Aún sin confirmar'}</span></div>
      <div><History size={19} aria-hidden="true" /><strong>Antecedentes</strong><span>{context ? `${historyFacts.length} datos de consultas anteriores` : 'Cargando datos'}</span></div>
    </div>
    {error && <p role="alert" className="admin-error">{error}</p>}
    <div className="clinical-review-sources">
      <details><summary>Lo conversado en la entrevista</summary><div className="mt-4">{hasInterviewAnswers ? <InterviewReview structure={interviewStructure} values={values} /> : <p className="clinical-review-empty">No hay respuestas registradas en la entrevista actual. Revisa los antecedentes disponibles antes de formular el diagnóstico.</p>}</div></details>
      <details><summary>Lo que comió y bebió</summary>{records.recall ? <ConfirmedRecall record={records.recall} /> : <p className="clinical-review-empty">Confirma el recordatorio en el paso anterior para incluir sus alimentos y cantidades.</p>}</details>
      <details><summary>Datos actuales: mediciones, estudios y contexto</summary><ul className="consultation-context-facts">{currentFacts.map((fact, index) => <li key={index}><strong>{fact.source}</strong><p>{fact.finding}</p></li>)}</ul>{!currentFacts.length && <p className="clinical-review-empty">Aún no hay datos actuales disponibles para esta revisión.</p>}</details>
      {historyFacts.length > 0 && <details><summary>Antecedentes de consultas anteriores</summary><p className="clinical-review-empty">Comprueba la fecha y confirma con el paciente qué sigue vigente.</p><ul className="consultation-context-facts">{historyFacts.map((fact, index) => <li key={index}><strong>{fact.source}</strong><p>{fact.finding}</p></li>)}</ul></details>}
      <details><summary>Cómo se utiliza esta información</summary><p className="clinical-review-empty">La IA prioriza esta consulta. Si falta la entrevista actual, puede usar entrevistas de consultas cerradas anteriores, indicando sus fechas. Revisa la propuesta antes de aprobarla.</p></details>
    </div>
    <p className="consultation-guided-hint">Cuando hayas revisado los datos, pulsa Siguiente para formular el diagnóstico PES.</p>
  </section>;
}
