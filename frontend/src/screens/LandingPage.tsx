/* eslint-disable @next/next/no-html-link-for-pages -- Public links cross the SSR marketing / React Router product boundary. */
import { ArrowDown, ArrowRight, Check, MessageCircle, Sparkles } from 'lucide-react';
import { LandingHeader } from '@/src/components/marketing/LandingHeader';
import { LandingProductTour } from '@/src/components/marketing/LandingProductTour';
import { Brand, BrandMark } from '@/src/components/ui/Brand';
import { publicPrice, type PublicPlan } from '@/src/lib/publicCommercial';

const questions = [
  ['¿Puedo trabajar con mi propia forma de consultar?', 'Sí. Organiza el expediente y personaliza tus plantillas. Tú eliges qué evaluar, cómo ajustar el plan y qué información compartir con cada paciente.'],
  ['¿Cómo recibe la información mi paciente?', 'Comparte el contenido que revisaste y publicaste en su Super Link, o entrega los documentos disponibles en tu plan.'],
  ['¿Cómo empiezo?', 'Revisa los planes vigentes y crea tu cuenta. Antes de contratar podrás consultar el precio, la periodicidad y las condiciones aplicables.'],
];

export function LandingPage({ plans = [], supportEmail = null }: { plans?: PublicPlan[]; supportEmail?: string | null }) {
  return <div className="landing landing-discovery">
    <a href="#contenido" className="landing-skip">Saltar al contenido</a>
    <LandingHeader />
    <main id="contenido">
      <section className="landing-hero landing-shell" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Software para nutriólogos</p>
          <h1 id="landing-title">¿Terminó tu consulta…<br /><em>o apenas empezó<br />el trabajo?</em></h1>
          <p className="landing-lead">Planes por terminar. Mensajes por responder.<br />Información por encontrar.</p>
          <div className="landing-actions">
            <a href="#como-funciona" className="landing-cta">Sí me pasa <ArrowDown size={17} aria-hidden="true" /></a>
            <a href="/planes" className="landing-text-link">Ver planes <ArrowRight size={17} aria-hidden="true" /></a>
          </div>
          <div className="landing-trust"><span className="landing-trust-mark" aria-hidden="true"><BrandMark size={30} /></span><div><span className="landing-trust-label">Ya es parte de otras consultas</span><p>Nutriólogos ya utilizan Nuthrick para organizar su consulta.</p></div></div>
        </div>
        <figure className="landing-patient-scene" aria-label="Ejemplo de conversación entre paciente y nutriólogo">
          <img className="landing-patient-photo" src="/images/landing/paciente-conversacion.png" width="736" height="1104" fetchPriority="high" alt="Una mujer sonríe mientras consulta su teléfono en casa." />
          <figcaption className="landing-scene-caption"><MessageCircle size={14} aria-hidden="true" /> Ejemplo ilustrativo</figcaption>
          <div className="landing-conversation">
            <div className="landing-chat landing-chat-patient"><span>Paciente</span><p>¡Ya tengo mi plan! Gracias por enviarlo tan rápido.</p></div>
            <div className="landing-chat-bottom">
              <div className="landing-chat landing-chat-professional"><span>Nutriólogo</span><p>Ahí tienes tu plan y las indicaciones que revisamos juntos.</p></div>
              <div className="landing-chat landing-chat-patient"><span>Paciente</span><p>Todo muy claro y organizado. ¡Qué atención tan profesional!</p></div>
            </div>
          </div>
        </figure>
      </section>

      <section id="como-funciona" className="landing-product" aria-labelledby="product-title">
        <div className="landing-shell landing-section">
          <div className="landing-section-intro"><div><p className="landing-eyebrow">Menos buscar. Más acompañar.</p><h2 id="product-title">Tu consulta ahora sí<br /><em>se sentirá organizada.</em></h2></div><p>Encuentra la historia. Prepara el plan.<br />Continúa el seguimiento.<br /><strong>Descubre cómo se ve en Nuthrick.</strong></p></div>
          <LandingProductTour />
          <div id="nuthrick-ai" className="landing-ai-note"><Sparkles size={22} aria-hidden="true" /><p><strong>Un apoyo extra cuando lo necesitas.</strong> Con IA puedes preparar borradores para revisar y ajustar. Consulta su disponibilidad y créditos en cada plan. El criterio sigue siendo tuyo.</p></div>
        </div>
      </section>

      <section id="creador" className="landing-founder landing-shell" aria-label="Creado por un nutriólogo"><BrandMark size={48} /><div><p className="landing-eyebrow">Del consultorio al código</p><p>Creado por <strong>José Olmedo</strong>, nutriólogo con más de 8 años de experiencia en consulta privada. Nuthrick nace de los pendientes que también conocemos.</p></div></section>

      <section id="precios" className="landing-shell landing-section landing-pricing" aria-labelledby="pricing-title">
        <div className="landing-section-intro"><div><p className="landing-eyebrow">Tu siguiente paso</p><h2 id="pricing-title">Dale espacio a lo<br /><em>que mejor haces: atender.</em></h2></div><a href="/planes" className="landing-cta">Ver planes <ArrowRight size={17} aria-hidden="true" /></a></div>
        {plans.length > 0 ? <div className="landing-plans">{plans.map((plan) => <article key={plan.id} className="landing-plan"><div><h3>{plan.name}</h3><p className="landing-price">{publicPrice(plan.monthly_price, plan.currency)}<span> {plan.currency} / mes</span></p>{plan.annual_price !== null && <p className="landing-annual">{publicPrice(plan.annual_price, plan.currency)} {plan.currency} / año · pago anual</p>}</div><p className="landing-plan-capacity"><Check size={16} aria-hidden="true" />{plan.values['patients.limit'] === 'unlimited' ? 'Pacientes activos ilimitados.' : typeof plan.values['patients.limit'] === 'number' ? `Hasta ${plan.values['patients.limit']} pacientes activos.` : 'Consulta las capacidades incluidas en este plan.'}</p><a href={`/planes?plan=${encodeURIComponent(plan.id)}`} className="landing-text-link" aria-label={`Consultar plan ${plan.name}`}>Consultar plan <ArrowRight size={17} aria-hidden="true" /></a></article>)}</div> : <p className="landing-plan-fallback">Consulta la disponibilidad y los precios en la página de planes vigentes.</p>}
        <p className="landing-pricing-note">Revisa el importe y la periodicidad antes de confirmar tu contratación. <a href="/register" data-cta="hero-register">Crear mi cuenta →</a></p>
        <div id="preguntas" className="landing-faq" aria-label="Antes de empezar">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
      </section>
    </main>
    <footer className="landing-footer"><div className="landing-shell"><div><a href="/" aria-label="Nuthrick, inicio"><Brand /></a><p>Más presente en consulta.<br />Más tiempo para ti.</p><small>© 2026 Nuthrick</small></div><nav aria-label="Enlaces del pie"><a href="/login">Iniciar sesión</a><a href="/planes">Ver planes</a><a href="/register">Crear mi cuenta</a><a href="/privacy">Privacidad</a><a href="/terms">Términos</a><a href="/refunds">Reembolsos</a>{supportEmail && <a href={`mailto:${supportEmail}`}>Contacto</a>}</nav></div></footer>
  </div>;
}
