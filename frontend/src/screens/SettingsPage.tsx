import { ArrowLeft, ArrowRight, ArrowUpRight, ClipboardList, CreditCard, MoonStar, RefreshCw, Settings, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccess } from '@/src/features/admin/AccessProvider';
import { canReadFeature } from '@/src/features/admin/api';
import { openAIProcessingConsent } from '@/src/features/ai/AIProcessingConsent';
import { ThemeSwitcher } from '@/src/features/theme/ThemeSwitcher';
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
          <p>Administra tu cuenta, tu suscripción y las herramientas que usas en consulta.</p>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="account-settings-title">
        <header className="settings-section-heading">
          <p className="nuth-eyebrow">Cuenta y preferencias</p>
          <h2 id="account-settings-title">Lo que necesitas tener a la mano</h2>
          <p>Encuentra aquí tus datos profesionales, las opciones de tu plan y tus preferencias.</p>
        </header>
        <div className="settings-general-grid">
          <article className="settings-general-card">
            <span className="settings-general-icon settings-profile-icon"><UserRound size={21} /></span>
            <div className="settings-general-copy">
              <h3>Perfil profesional</h3>
              <p>Actualiza tu información, consultorios, disponibilidad y página pública.</p>
            </div>
            <Link to="/app/profile" className="settings-card-link">Abrir perfil <ArrowUpRight size={16} /></Link>
          </article>

          <article className="settings-general-card settings-billing-card">
            <span className="settings-general-icon settings-billing-icon"><CreditCard size={21} /></span>
            <div className="settings-general-copy">
              <h3>Plan y suscripción</h3>
              <p>Consulta tu plan, cambia de nivel o inicia la cancelación cuando lo necesites.</p>
            </div>
            <div className="settings-card-actions">
              <Link to="/app/my-plan#plan-actions" className="nuth-button">Cambiar plan <ArrowRight size={15} /></Link>
              <Link to="/app/my-plan#plan-actions" className="settings-card-link settings-cancel-link">Cancelar suscripción <ArrowUpRight size={16} /></Link>
            </div>
            <p className="settings-card-footnote">La cancelación se confirma en Mi plan antes de aplicarse.</p>
          </article>

          <article className="settings-general-card settings-preferences-card">
            <span className="settings-general-icon settings-appearance-icon"><MoonStar size={21} /></span>
            <div className="settings-general-copy">
              <h3>Apariencia</h3>
              <p>Elige el tema que prefieres para trabajar en Nuthrick.</p>
            </div>
            <ThemeSwitcher />
          </article>

          <article className="settings-general-card settings-preferences-card">
            <span className="settings-general-icon settings-privacy-icon"><ShieldCheck size={21} /></span>
            <div className="settings-general-copy">
              <h3>Privacidad y uso de IA</h3>
              <p>Revisa el aviso y administra el consentimiento para las funciones de inteligencia artificial.</p>
            </div>
            <button type="button" className="settings-card-link settings-consent-action" onClick={openAIProcessingConsent}>Administrar consentimiento <ArrowRight size={16} /></button>
          </article>
        </div>
      </section>

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
