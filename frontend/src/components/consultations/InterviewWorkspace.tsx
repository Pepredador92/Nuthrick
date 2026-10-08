import type { ReactNode, Ref } from 'react';
import { Check, ClipboardCheck, MessageCircle, Route } from 'lucide-react';
import { sectionProgress } from '@/src/features/consultations/questionnaire';
import type { Answers, Question } from '@/src/features/consultations/questionnaire';
import type { ConsultationSnapshotStructure } from '@/src/types/domain';
import './InterviewWorkspace.css';

export function InterviewWorkspace({ templateName, sections, values, active, busy, onSection, headingRef, children }: {
  templateName: string;
  sections: ConsultationSnapshotStructure['sections'];
  values: Answers;
  active: number;
  busy: boolean;
  onSection: (index: number) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  const progress = sections.map(section => sectionProgress(section, values));
  const answered = progress.reduce((sum, item) => sum + item.answered, 0);
  const total = progress.reduce((sum, item) => sum + item.total, 0);
  const reviewing = active === sections.length;
  const current = sections[active];
  return <div className="interview-layout">
    <section className="interview-guide" aria-label="Tu entrevista">
      <div className="interview-card-title"><span className="interview-icon"><Route size={19} aria-hidden="true" /></span><div><p className="nuth-eyebrow">Tu entrevista</p><h2>{templateName}</h2></div></div>
      <p className="interview-progress-label">{answered} de {total} preguntas visibles con respuesta</p>
      <progress className="interview-progress" value={answered} max={total || 1} aria-label="Preguntas con respuesta" />
      <p className="interview-guide-hint">Completa lo relevante. Los campos opcionales no bloquean el cierre.</p>
      <label htmlFor="interview-section" className="interview-section-label">Ir a una sección</label>
      <select id="interview-section" className="nuth-input interview-section-select" disabled={busy} value={active} onChange={event => onSection(Number(event.target.value))}>
        {sections.map((section, index) => <option key={section.section_key} value={index}>{index + 1}. {section.title}</option>)}
        <option value={sections.length}>Revisar y cerrar</option>
      </select>
      <nav aria-label="Secciones de la entrevista" className="interview-section-nav">
        {sections.map((section, index) => <button type="button" key={section.section_key} disabled={busy} aria-current={active === index ? 'step' : undefined} onClick={() => onSection(index)}>
          <span className="interview-step-number" aria-hidden="true">{progress[index].total > 0 && progress[index].answered === progress[index].total ? <Check size={14} /> : index + 1}</span>
          <span><span className="interview-step-title">{section.title}</span><small>{progress[index].answered} de {progress[index].total} con respuesta</small></span>
        </button>)}
        <button type="button" disabled={busy} aria-current={reviewing ? 'step' : undefined} onClick={() => onSection(sections.length)}><span className="interview-step-number"><ClipboardCheck size={16} aria-hidden="true" /></span><span className="interview-step-title">Revisar y cerrar</span></button>
      </nav>
    </section>
    <div className="interview-content">
      <header className="interview-section-header">
        <p className="nuth-eyebrow">{reviewing ? 'Antes de cerrar' : `Sección ${active + 1} de ${sections.length}`}</p>
        <h2 ref={headingRef} tabIndex={-1}>{reviewing ? 'Revisa lo conversado' : current?.title}</h2>
        {current?.description && current.section_key !== 'nutrition_diagnosis' && <div className="interview-conversation-guide"><MessageCircle size={18} aria-hidden="true" /><div><p>Para acompañar la conversación</p><p>{current.description}</p></div></div>}
      </header>
      {children}
    </div>
  </div>;
}

export function InterviewQuestionCard({ question, children }: { question: Question; children: ReactNode }) {
  const wide = ['long_text', 'multi_select', 'repeatable_group'].includes(question.question_type) || question.configuration.widget === 'frequency_grid';
  return <div className={`interview-question-card${wide ? ' is-wide' : ''}`} data-field-type={question.question_type}>{children}</div>;
}
