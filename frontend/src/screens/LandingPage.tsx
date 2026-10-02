/* eslint-disable @next/next/no-html-link-for-pages -- Public links cross the SSR marketing / React Router product boundary. */
import { ArrowDown, ArrowRight, Check, ClipboardList, Heart, MoveUpRight, Sparkles } from 'lucide-react';
import { LandingHeader } from '@/src/components/marketing/LandingHeader';
import { LandingProductTour } from '@/src/components/marketing/LandingProductTour';
import { publicPrice, type PublicPlan } from '@/src/lib/publicCommercial';

const photos = '/images/landing/';
const steps = [
  ['Escucha', 'Retoma la historia, entrevista y antecedentes de tu paciente.'],
  ['Evalúa', 'Registra mediciones y consulta los cálculos de tu valoración.'],
  ['Prepara', 'Trabaja el plan de alimentación y ajusta las indicaciones.'],
  ['Da continuidad', 'Conserva lo acordado y compara la evolución en la siguiente visita.'],
];
const questions = [
  ['¿Para quién está pensado Nuthrick?', 'Para nutriólogos que quieren ofrecer una consulta atenta y organizada, conectar mejor con cada paciente y reducir los pendientes para no llevarse trabajo a casa al terminar.'],
  ['¿Puedo trabajar con mi propia forma de consultar?', 'Puedes organizar el expediente y personalizar tus plantillas de consulta. Tú eliges qué evaluar, cómo ajustar el plan y qué información compartir con el paciente.'],
  ['¿Qué puedo hacer con los planes de alimentación?', 'Puedes trabajar con equivalentes, distribuir tiempos de comida y preparar menús. Aunque hacer los cálculos sea sencillo, armar el menú puede tomar tiempo: si tienes la IA habilitada, te ayuda a avanzar más rápido con una propuesta que después puedes revisar y ajustar a cada paciente. También puedes consultar los planes publicados y dar continuidad al seguimiento.'],
  ['¿Cómo recibe la información mi paciente?', 'Puedes compartir el plan y la información que decidas publicar a través de su portal, o preparar los documentos disponibles para entrega. Las funciones incluidas dependen de tu plan.'],
  ['¿La inteligencia artificial toma decisiones por mí?', 'No. Los borradores requieren tu revisión. Las funciones de IA disponibles dependen de la habilitación de tu cuenta y de tu plan; tu criterio profesional guía lo que se utiliza en consulta.'],
  ['¿Cómo empiezo?', 'Crea tu cuenta desde Registrarme y revisa las funciones, capacidades y condiciones vigentes en la página de planes.'],
];

export function LandingPage({ plans = [], supportEmail = null }: { plans?: PublicPlan[]; supportEmail?: string | null }) {
  return <div className="landing landing-editorial">
    <a href="#contenido" className="landing-skip">Saltar al contenido</a>
    <LandingHeader />
    <main id="contenido">
      <section className="landing-shell landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker"><span aria-hidden="true" />Software para nutriólogos, creado por un nutriólogo</p>
          <h1 id="landing-title">Tu consulta merece tu atención.<br /><em>Tu vida también.</em></h1>
          <p className="landing-lead">Da una consulta de calidad, mantén el control de tu práctica y termina con tus pendientes.</p>
          <p className="landing-body">Expedientes, mediciones, planes de alimentación y seguimiento. Conectados para ayudarte a resolver más durante la consulta.</p>
          <div className="landing-actions">
            <a href="/register" className="landing-cta" data-cta="hero-register">Registrarme <ArrowRight size={18} aria-hidden="true" /></a>
            <a href="#como-funciona" className="landing-text-link">Ver Nuthrick por dentro <ArrowDown size={17} aria-hidden="true" /></a>
          </div>
          <p className="landing-hero-note">Tu criterio. Tu forma de atender. Tu tiempo.</p>
        </div>
        <div className="landing-hero-photos">
          <figure className="landing-hero-portrait"><img src={`${photos}nutriologos-en-grupo.jpg`} width="1538" height="1025" fetchPriority="high" alt="Grupo de nutriólogos reunidos durante una actividad de formación en antropometría" /></figure>
          <div className="landing-photo-note"><p>Muchos nutriólogos ya decidieron <strong>evolucionar su consulta.</strong></p><a href="/planes" className="landing-photo-plans">VER PLANES</a></div>
          <figure className="landing-hero-inset"><img src={`${photos}evaluacion-antropometrica.png`} width="857" height="573" alt="Nutrióloga concentrada mientras marca puntos de referencia para una evaluación antropométrica" decoding="async" /><figcaption>Tu paciente valora que lo escuches con atención y que recuerdes lo que conversaron en la siguiente consulta.</figcaption></figure>
        </div>
      </section>

      <div className="landing-principles"><div className="landing-shell"><span><Heart size={18} aria-hidden="true" /> Calidad para tu paciente</span><span><ClipboardList size={18} aria-hidden="true" /> Control para tu consulta</span><span><MoveUpRight size={18} aria-hidden="true" /> Tiempo para ti</span></div></div>

      <section id="segunda-jornada" className="landing-shell landing-section landing-problem">
        <div><p className="landing-eyebrow">Seguro te ha pasado</p><h2>El paciente se va y<br /><em>los pendientes se quedan.</em></h2></div>
        <div className="landing-problem-copy"><p className="landing-lead">Terminar el plan. Encontrar las mediciones de consultas previas. Volver a hacer un cálculo porque el plan necesita ajustes. Enviar al paciente lo que no alcanzaste a entregarle durante la consulta.</p><p className="landing-body">Elegiste esta profesión para cuidar de las personas. Nuthrick reúne el trabajo de la consulta para ayudarte a cerrar el día con más orden y menos cosas por resolver.</p><a href="#como-funciona" className="landing-text-link">Así se conecta tu consulta <ArrowDown size={17} aria-hidden="true" /></a></div>
      </section>

      <section id="como-funciona" className="landing-product landing-section" aria-labelledby="product-title">
        <div className="landing-shell"><div className="landing-section-intro"><div><p className="landing-eyebrow">Nuthrick, por dentro</p><h2 id="product-title">De escuchar a tu paciente<br /><em>a tener el siguiente paso listo.</em></h2></div><p className="landing-body">La información que capturas acompaña tu trabajo. Revisa, ajusta y avanza con el contexto de cada persona.</p></div><ol className="landing-flow">{steps.map(([title, description], i) => <li key={title}><span className="landing-step-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol><LandingProductTour /></div>
      </section>

      <section id="funciones" className="landing-shell landing-section landing-clinical" aria-labelledby="clinical-title">
        <div className="landing-clinical-photos"><figure className="landing-measuring-photo"><img src={`${photos}medicion-brazo.png`} width="320" height="576" loading="lazy" decoding="async" alt="Nutrióloga realizando una medición antropométrica en el brazo" /></figure><figure className="landing-caliper-photo"><img src={`${photos}plicometria.png`} width="600" height="800" loading="lazy" decoding="async" alt="Detalle de las manos y el plicómetro durante la medición de un pliegue cutáneo" /><figcaption>Detrás de cada dato,<br />está tu criterio.</figcaption></figure></div>
        <div><p className="landing-eyebrow">Calidad de consulta · Control profesional</p><h2 id="clinical-title">Más atención.<br /><em>Crea una conexión.</em></h2><p className="landing-body">Tu atención vale. Ten a la mano lo que necesitas para interpretar, explicar y tomar decisiones junto a tu paciente. Contar con ese contexto te ayuda a comunicar tus recomendaciones con claridad y a transmitir la preparación que hay detrás de tu consulta.</p>
          <div className="landing-feature-list">
            <article><span>01</span><div><h3>Una historia que puedes retomar</h3><p>Consulta cálculos, métodos y evolución a partir de los datos registrados. Compara lo que cambia entre visitas y retoma las mediciones de consultas previas.</p></div></article>
            <article><span>02</span><div><h3>Tu consulta, a tu manera</h3><p>Personaliza tus plantillas y organiza el expediente según lo que necesitas conocer y seguir en cada consulta.</p></div></article>
            <article><span>03</span><div><h3>Tú decides qué entregar</h3><p>Revisa el plan y las indicaciones. Comparte con el paciente la información que elijas publicar en su portal.</p></div></article>
          </div>
          <div id="nuthrick-ai" className="landing-ai-note"><Sparkles size={20} aria-hidden="true" /><div><h3>La IA te ayudará, pero el criterio seguirá siendo tuyo.</h3><p>Los borradores son un apoyo para revisar y ajustar. Su disponibilidad depende de la habilitación de tu cuenta y de tu plan.</p></div></div>
        </div>
      </section>

      <section id="tu-tiempo" className="landing-life" aria-labelledby="life-title"><div className="landing-shell landing-section">
        <div className="landing-life-grid"><div className="landing-life-copy"><p className="landing-eyebrow">La vida después de la consulta</p><h2 id="life-title">Hay algo que<br />también merece<br /><em>un lugar en tu día.</em></h2><p className="landing-lead">Eso que te gusta.<br />Eso que también eres.</p><p className="landing-body">Entrenar, salir con amigos, aprender algo nuevo o simplemente descansar. Reducir los pendientes de la consulta es hacer espacio para tu vida.</p><a href="/register" className="landing-text-link">Empieza a organizar tu consulta <ArrowRight size={18} aria-hidden="true" /></a></div><figure className="landing-exercise-photo"><img src={`${photos}tiempo-para-entrenar.jpg`} width="1080" height="720" loading="lazy" decoding="async" alt="Grupo de personas haciendo ejercicio al aire libre, con una mujer sonriente en primer plano" /><figcaption>El consultorio es parte de tu vida.<br /><em>Hay mucho más afuera.</em></figcaption></figure></div>
        <div className="landing-community"><figure><img src={`${photos}nutriologa-plicometro.jpg`} width="735" height="928" loading="lazy" decoding="async" alt="Nutrióloga sonriendo mientras sostiene un plicómetro" /></figure><div><p className="landing-eyebrow">Compartimos una forma de ver la profesión</p><h3>Ser nutriólogo/a es<br />cuidar de otros y seguir<br />aprendiendo. <em>Pero también<br />es cuidar de ti.</em></h3><p className="landing-body">Nuthrick está pensado para quienes quieren ejercer con atención y hacer sostenible su día a día en consulta.</p></div></div>
      </div></section>

      <section id="creador" aria-labelledby="creador-titulo" className="landing-shell landing-section landing-founder">
        <figure><img src="/images/jose-olmedo-nuthrick-1280.webp" srcSet="/images/jose-olmedo-nuthrick-640.webp 640w, /images/jose-olmedo-nuthrick-1280.webp 1280w" sizes="(min-width: 1024px) 50vw, calc(100vw - 40px)" width="1280" height="907" loading="lazy" decoding="async" alt="José Olmedo, creador de Nuthrick, con su perro frente a las tres computadoras de su espacio de trabajo" /><figcaption><span>José Olmedo</span>Nutriólogo y creador de Nuthrick</figcaption></figure>
        <div><p className="landing-eyebrow">Creado por un nutriólogo</p><h2 id="creador-titulo">Nuthrick nació desde<br /><em>un nutriólogo de verdad.</em></h2><p className="landing-body">Soy <strong>nutriólogo con más de 8 años de experiencia en consulta privada</strong>. Desarrollé Nuthrick a partir de los problemas que he vivido en el día a día y que sé que muchos nutriólogos también enfrentan: hacer cálculos, preparar planes de alimentación, dar seguimiento, llevar agenda y expedientes, promocionar mis servicios, conseguir pacientes y atender todo el trabajo que continúa después de la consulta.</p><p className="landing-body">Intenté resolverlo con hojas de cálculo llenas de fórmulas, documentos de texto, recordatorios en el celular y notas por aquí y por allá. También probé otros softwares de nutrición, pero seguía encontrando huecos en mi consulta. ¿De qué sirve tener un montón de recetas si muchos pacientes suelen irse por lo básico? ¿Y para qué tantas fotos de platillos con presentaciones perfectas si el paciente puede frustrarse cuando lo que prepara no le queda igual?</p><p className="landing-body">Por eso no quería hacer otro software de nutrición lleno de funciones que no siempre responden a lo que vivimos en consulta. Pensé Nuthrick para ayudarte a trabajar de una forma <strong>más simple, rápida y organizada</strong>: tener la información a la mano, avanzar con tus planes y dar seguimiento sin cargar con todo después. Es una herramienta para apoyarte, <strong>no para reemplazar tu criterio profesional</strong>: tú decides qué necesita cada paciente y cómo acompañarlo.</p><p className="landing-founder-signature">Del consultorio al código.</p></div>
      </section>

      <section id="precios" aria-label="Planes vigentes" className="landing-pricing landing-section"><div className="landing-shell">
        <div className="landing-section-intro"><div><p className="landing-eyebrow">El siguiente paso</p><h2>Dale la oportunidad<br /><em>a una mejor forma de trabajar.</em></h2></div><p className="landing-body">Elige el plan que acompañe tu práctica. Las capacidades, funciones y condiciones están disponibles antes de contratar.</p></div>
        {plans.length > 0 ? <div className="landing-plans">{plans.map((plan, index) => <article key={plan.id} className={`landing-plan${index === 1 ? ' landing-plan-featured' : ''}`}><p className="landing-eyebrow">Para tu práctica</p><h3>{plan.name}</h3><p className="landing-price">{publicPrice(plan.monthly_price, plan.currency)}<span>{plan.currency} / mes</span></p>{plan.annual_price !== null && <p className="landing-annual">{publicPrice(plan.annual_price, plan.currency)} {plan.currency} / año · pago anual</p>}<p className="landing-plan-capacity"><Check size={17} aria-hidden="true" />{plan.values['patients.limit'] === 'unlimited' ? 'Pacientes activos ilimitados.' : typeof plan.values['patients.limit'] === 'number' ? `Hasta ${plan.values['patients.limit']} pacientes activos.` : 'Consulta las capacidades incluidas en este plan.'}</p><a href={`/planes?plan=${encodeURIComponent(plan.id)}`} className="landing-cta" aria-label={`Consultar plan ${plan.name}`}>Consultar plan <ArrowRight size={17} aria-hidden="true" /></a></article>)}</div> : <div className="landing-plan-fallback"><p>Consulta la disponibilidad y los precios en la página de planes vigentes.</p></div>}
        <p className="landing-pricing-note">Revisa el importe y la periodicidad antes de confirmar tu contratación.</p>
      </div></section>

      <section id="preguntas" className="landing-shell landing-section landing-faq"><div><p className="landing-eyebrow">Antes de empezar</p><h2>Conoce un poco más.<br /><em>Decide con calma.</em></h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="landing-closing"><div className="landing-shell"><p className="landing-eyebrow">Una consulta de calidad. Una vida con espacio.</p><h2>Que tus pendientes<br />no se lleven <em>el resto del día.</em></h2><a href="/register" className="landing-cta" data-cta="closing-register">Registrarme <ArrowRight size={18} aria-hidden="true" /></a><p>Empieza por tu próxima consulta.</p></div></section>
    </main>
    <footer className="landing-footer landing-shell"><div><a href="/" className="landing-wordmark">Nuthrick</a><p>Más presente en consulta.<br />Más tiempo para ti.</p><small>© 2026 Nuthrick</small></div><nav aria-label="Enlaces del pie"><a href="#creador">Quién lo creó</a><a href="/login">Iniciar sesión</a><a href="/planes">Planes vigentes</a><a href="/register">Registrarme</a><a href="/privacy">Privacidad</a><a href="/terms">Términos</a><a href="/refunds">Reembolsos</a>{supportEmail && <a href={`mailto:${supportEmail}`}>Contacto</a>}</nav></footer>
  </div>;
}
