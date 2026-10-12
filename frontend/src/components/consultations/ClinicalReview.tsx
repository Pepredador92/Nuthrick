import { useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { clinicalObjective, clinicalWorkspace, type ClinicalWorkspace, type ObjectiveWorkspace } from '@/src/services/clinicalCopilot';
import { InterviewReview } from './InterviewReview';
import { ConfirmedRecall } from './ClinicalCopilot';
import type { Answers } from '@/src/features/consultations/questionnaire';
import type { ConsultationSnapshot } from '@/src/types/domain';

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
    <header className="consultation-clinical-title"><span className="consultation-clinical-icon"><ClipboardCheck size={21} /></span><div><p className="nuth-eyebrow">01 · Revisa el contexto</p><h2 id="clinical-review-title">Revisión clínica</h2></div><button type="button" className="nuth-button-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} />{loading ? 'Actualizando…' : 'Actualizar revisión'}</button></header>
    <p className="consultation-clinical-description">Reúne lo conversado, el consumo registrado y las mediciones antes de formular el PES y acordar objetivos.</p>
    <p className="consultation-context-priority">La IA usa primero esta consulta. Si no hay entrevista actual registrada, puede apoyarse en consultas cerradas anteriores, conservando sus fechas y señalando qué debes confirmar.</p>
    <div className="consultation-context-counts"><span><strong>{facts.filter(fact => !historical(fact.source)).length}</strong> datos de esta consulta</span><span><strong>{facts.filter(fact => historical(fact.source)).length}</strong> antecedentes fechados</span><span>{records.recall ? 'Recordatorio confirmado' : 'Recordatorio sin confirmar'}</span></div>
    {error && <p role="alert" className="admin-error">{error}</p>}
    <details className="consultation-context-detail"><summary>Entrevista y acuerdos registrados</summary><div className="mt-4"><InterviewReview structure={snapshot.structure} values={values} /></div></details>
    {records.recall && <details className="consultation-context-detail"><summary>Recordatorio de esta consulta</summary><ConfirmedRecall record={records.recall} /></details>}
    <details className="consultation-context-detail"><summary>Mediciones, estudios y fuentes disponibles para la IA</summary><ul className="consultation-context-facts">{facts.map((fact, index) => <li key={index}><strong>{fact.source}</strong><p>{fact.finding}</p></li>)}</ul>{!facts.length && <p className="mt-3 text-sm">Aún no hay contexto disponible.</p>}</details>
  </section>;
}
