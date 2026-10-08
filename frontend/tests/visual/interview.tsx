import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InterviewWorkspace, InterviewQuestionCard } from '../../src/components/consultations/InterviewWorkspace';
import { QuestionField } from '../../src/components/consultations/QuestionField';
import { InterviewReview } from '../../src/components/consultations/InterviewReview';
import { initialInterview, interviewTemplateName } from '../../src/features/consultations/interviewTemplate';
import { matchesCondition, type Answers } from '../../src/features/consultations/questionnaire';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import '../../app/globals.css';

function Preview() {
  const [active, setActive] = useState(0);
  const [values, setValues] = useState<Answers>({});
  const sections = initialInterview.sections;
  const goTo = (index: number) => { setActive(index); window.scrollTo({ top: 0, behavior: 'instant' }); };
  return <main style={{ padding: '24px clamp(16px, 3vw, 40px)' }}>
    <div className="consultation-workspace">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs">Vista previa · Datos de demostración · Sin guardado real</p><ThemeSwitcher compact /></div>
      <header className="rounded-3xl p-6 text-white"><p className="text-xs uppercase tracking-widest">Consulta inicial · Entrevista</p><h1 className="mt-2 text-2xl font-semibold">Paciente de demostración</h1><p className="mt-2 text-sm">Escucha, registra y continúa a tu ritmo.</p></header>
      <InterviewWorkspace templateName={interviewTemplateName} sections={sections} values={values} active={active} busy={false} onSection={goTo}>
        {active === sections.length ? <div className="interview-review-card"><InterviewReview structure={initialInterview} values={values} onSection={goTo} showEmpty /></div> : <fieldset className="interview-question-grid">
          {sections[active].questions.filter(q => matchesCondition(q.visibility_condition, values)).map(question => <InterviewQuestionCard key={question.question_key} question={question}><QuestionField question={question} value={values[question.question_key]} onChange={value => setValues(previous => ({ ...previous, [question.question_key]: value }))} /></InterviewQuestionCard>)}
        </fieldset>}
      </InterviewWorkspace>
    </div>
    <footer style={{ position: 'fixed', inset: 'auto 0 0', padding: '12px 20px', background: 'var(--nuth-surface)', borderTop: '1px solid var(--nuth-line)', zIndex: 30 }}><div className="interview-footer-inner">
      <button className="nuth-button-secondary" disabled={active === 0} onClick={() => goTo(active - 1)}>Anterior</button>
      <div className="interview-next-step"><strong>{active === sections.length ? 'Último paso: revisar y cerrar' : `Sigue: ${sections[active + 1]?.title ?? 'Revisar resumen'}`}</strong><span>Vista previa · Sin guardado real</span></div>
      <button className="nuth-button" disabled={active === sections.length} onClick={() => goTo(active + 1)}>{active >= sections.length - 1 ? 'Revisar resumen' : 'Siguiente'}</button>
    </div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
