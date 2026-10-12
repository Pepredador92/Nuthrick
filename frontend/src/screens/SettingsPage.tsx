import { ArrowLeft, ArrowRight, ClipboardList, RefreshCw, Settings, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccess } from '@/src/features/admin/AccessProvider';
import { canReadFeature } from '@/src/features/admin/api';
import './SettingsPage.css';

export function SettingsPage() {
  const { data } = useAccess();
  const canDesign = canReadFeature(data?.access, 'consultation_design');

  return (
    <div className="settings-workspace">
      <Link to="/app" className="settings-back"><ArrowLeft size={16} />Volver a mi espacio</Link>
      <header className="settings-heading">
        <span className="settings-icon"><Settings size={24} /></span>
        <div>
          <p className="nuth-eyebrow">Tu forma de trabajar</p>
          <h1>Configuración</h1>
          <p>Prepara las herramientas que usarás en tus consultas.</p>
        </div>
      </header>

      <section className="settings-card" aria-labelledby="interview-settings-title">
        <header>
          <p className="nuth-eyebrow">01 · Prepara tu entrevista</p>
          <h2 id="interview-settings-title">Diseños de entrevista</h2>
          <p>Define las preguntas, el orden y las secciones que quieres utilizar con tus pacientes.</p>
        </header>
        <p className="settings-purpose">
          Aquí configuras el guion. Los datos y las respuestas de cada paciente se registran en <strong>Pacientes → Nueva consulta</strong>.
        </p>
        {canDesign ? (
          <div className="settings-designs">
            <Link to="/app/consultation-templates/initial" className="settings-design settings-design-initial">
              <span className="settings-design-icon"><ClipboardList size={23} /></span>
              <h3>Entrevista inicial</h3>
              <p>Prepara las preguntas para conocer la historia de tu paciente.</p>
              <span className="settings-design-action">Configurar diseños <ArrowRight size={16} /></span>
            </Link>
            <Link to="/app/consultation-templates/follow_up" className="settings-design settings-design-followup">
              <span className="settings-design-icon"><RefreshCw size={23} /></span>
              <h3>Entrevista de seguimiento</h3>
              <p>Define cómo revisarás sus avances y los acuerdos de la consulta anterior.</p>
              <span className="settings-design-action">Configurar diseños <ArrowRight size={16} /></span>
            </Link>
          </div>
        ) : (
          <p className="settings-purpose">Los diseños de entrevista no están incluidos en tu acceso actual. <Link to="/app/my-plan" className="font-semibold underline">Revisar mi plan</Link></p>
        )}
        <p className="settings-hint">Puedes partir de una base de Nuthrick o personalizar tus propios diseños. Los cambios se usan en nuevas consultas y conservan las consultas anteriores.</p>
      </section>

      {canReadFeature(data?.access, 'patients') && (
        <section className="settings-next" aria-label="Siguiente paso">
          <div><p className="nuth-eyebrow">Después de preparar el diseño</p><h2>Inicia una consulta desde la ficha del paciente.</h2><p>Ahí elegirás el diseño y completarás la entrevista real.</p></div>
          <Link to="/app/patients" className="nuth-button"><UsersRound size={17} />Ir a Pacientes</Link>
        </section>
      )}
    </div>
  );
}
