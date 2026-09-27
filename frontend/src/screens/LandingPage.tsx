/* eslint-disable @next/next/no-html-link-for-pages -- Full document links cross the SSR marketing / React Router product boundary without prefetching private application code. */
import { ArrowDown, ArrowRight, CalendarDays } from "lucide-react";
import { LandingHeader } from "@/src/components/marketing/LandingHeader";
import { individualPlans } from "@/src/config/marketing";

function SectionHeading({ eyebrow, title, description, inverse = false }: { eyebrow?: string; title: React.ReactNode; description?: string; inverse?: boolean }) {
  return <div>
    {eyebrow && <p className={`text-xs font-bold uppercase tracking-[.16em] ${inverse ? "text-[#efbd6b]" : "text-[#477363]"}`}>{eyebrow}</p>}
    <h2 className={`mt-4 text-balance text-3xl font-semibold leading-[1.12] tracking-[-.04em] sm:text-4xl lg:text-5xl ${inverse ? "text-white" : "text-[#17312c]"}`}>{title}</h2>
    {description && <p className={`mt-6 max-w-2xl text-pretty text-lg leading-8 ${inverse ? "text-white/80" : "text-[#65746f]"}`}>{description}</p>}
  </div>;
}

function WindowFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="rounded-[28px] border border-white/80 bg-white/85 p-2.5 shadow-[0_30px_80px_rgba(23,61,54,.13)] backdrop-blur">
    <div className="overflow-hidden rounded-[21px] border border-[#e0e7e2] bg-[#fbfcfa]">
      <div className="flex h-10 items-center gap-1.5 border-b border-[#e5ebe6] px-4" role="group" aria-label={label}>
        <span className="h-2 w-2 rounded-full bg-[#e5a0a0]" /><span className="h-2 w-2 rounded-full bg-[#efd38d]" /><span className="h-2 w-2 rounded-full bg-[#90c6a4]" />
        <span className="ml-3 h-4 w-32 rounded bg-[#edf1ed]" />
      </div>
      {children}
    </div>
  </div>;
}

function HeroProductMockup() {
  const appointments = [
    ["10:00", "Mariana López", "Seguimiento", "bg-[#e9f4ed] text-[#356653]"],
    ["12:30", "Carlos Hernández", "Primera consulta", "bg-[#fff2df] text-[#975d2e]"],
    ["16:00", "Daniela Ruiz", "Seguimiento", "bg-[#eef2f0] text-[#53655d]"],
  ];
  return <div className="relative mx-auto w-full max-w-[650px]" role="group" aria-label="Vista conceptual de la agenda y pendientes de Nuthrick">
    <div className="relative"><WindowFrame label="Panel de inicio de Nuthrick"><div className="grid min-h-[430px] grid-cols-[58px_1fr] sm:grid-cols-[146px_1fr]">
      <aside className="border-r border-[#e4e9e5] bg-[#f5f7f4] p-3 sm:p-4"><div className="grid h-8 w-8 place-items-center rounded-xl bg-[#173d36] text-xs font-bold text-white">N</div><div className="mt-8 space-y-3">{["Inicio", "Pacientes", "Consultas", "Agenda"].map((item, index) => <div key={item} className={`flex h-8 items-center rounded-lg px-2 text-[10px] font-medium ${index === 0 ? "bg-white text-[#24483d] shadow-sm" : "text-[#52655d]"}`}><span className={`mr-2 h-3 w-3 rounded ${index === 0 ? "bg-[#72a48e]" : "bg-[#dbe2dd]"}`} /><span className="hidden sm:block">{item}</span></div>)}</div></aside>
      <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#52655d]">Martes, 9 de septiembre</p><p className="mt-2 text-xl font-semibold tracking-[-.04em] text-[#173d36]">Buenos días, Andrea</p></div><div className="grid h-9 w-9 place-items-center rounded-full bg-[#ebbb7c] text-[10px] font-bold text-[#674018]">AR</div></div>
        <div className="mt-6 grid gap-3 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-[#e2e8e3] bg-white p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#28493f]">Hoy</p><CalendarDays size={14} className="text-[#6d887c]" /></div><div className="mt-3 space-y-2">{appointments.map(([time, patient, type, tone]) => <div key={time} className="flex items-center gap-2.5"><span className="w-8 text-[10px] font-semibold text-[#6c7973]">{time}</span><span className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 ${tone}`}><strong className="block truncate text-[10px]">{patient}</strong><span className="block truncate text-[9px] ">{type}</span></span></div>)}</div></section><section className="rounded-2xl bg-[#173d36] p-4 text-white"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Pendientes</p><span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">4</span></div><div className="mt-4 space-y-3 text-[10px] text-white/78">{["Evaluación de Mariana completa", "Revisar borrador de Carlos", "Daniela respondió al seguimiento", "1 indicación por entregar"].map((item, index) => <p key={item} className="flex gap-2"><span className={index === 0 ? "text-[#edbf6d]" : "text-white/50"}>{index === 0 ? "✓" : "○"}</span>{item}</p>)}</div></section></div>
        <div className="mt-3 rounded-2xl border border-[#e3e9e4] bg-[#f7faf7] px-4 py-3"><p className="text-[10px] text-[#5d7167]"><strong className="text-[#294c40]">Tu consultorio, en movimiento.</strong> La información de cada consulta sigue trabajando contigo.</p></div>
      </div>
    </div></WindowFrame></div>
  </div>;
}

function FlowVisual() {
  const steps = [["Consulta", "Entrevista, antecedentes, alimentación y mediciones."], ["Resuelve", "Resultados, cálculos, borradores y decisiones."], ["Entrega", "Indicaciones, objetivos y documentos aprobados."], ["Sigue", "Citas, comunicación y seguimiento."]];
  return <div className="relative mt-14 grid gap-4 md:grid-cols-4">{steps.map(([title, text], index) => <article key={title} className="relative rounded-[26px] border border-[#dde6e0] bg-white p-6 shadow-[0_14px_35px_rgba(24,61,53,.05)]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9f3ec] text-sm font-bold text-[#3e735f]">0{index + 1}</span><h3 className="mt-7 text-xl font-semibold tracking-[-.03em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#6a7873]">{text}</p>{index < steps.length - 1 && <ArrowRight aria-hidden="true" className="absolute -right-7 top-1/2 z-10 hidden -translate-y-1/2 text-[#82a493] md:block" size={22} />}</article>)}</div>;
}

function AIContextVisual() {
  const context = ["Entrevista", "Antropometría", "Recordatorio 24 h", "Laboratorios", "Evolución", "Objetivos"];
  return <div className="rounded-[28px] border border-white/15 bg-white/[.06] p-5 sm:p-7"><div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]"><div className="grid gap-2">{context.map((item) => <span key={item} className="rounded-xl border border-white/10 bg-white/[.07] px-3 py-2.5 text-sm text-white/82">{item}</span>)}</div><ArrowRight className="mx-auto rotate-90 text-[#efbd6b] sm:rotate-0" aria-hidden="true" /><div className="rounded-[22px] bg-[#f5bb65] p-5 text-[#17312c]"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#674318]">Nuthrick prepara</p><p className="mt-8 text-xl font-semibold tracking-[-.03em]">Borrador listo para tu revisión.</p><div className="mt-6 rounded-xl bg-white/60 p-3 text-xs leading-5 text-[#5b4c38]">Mantienes el contexto, revisas la propuesta y decides qué se convierte en parte de la atención.</div></div></div></div>;
}

function CalculationsMockup() {
  const cards = [["IMC", "22.4", "kg/m²", "#4e846b"], ["Relación cintura/talla", "0.46", "razón", "#b37537"], ["Grasa corporal", "28.1", "%", "#69799b"]];
  return <div className="rounded-[28px] border border-[#dbe5df] bg-white p-5 shadow-[0_18px_45px_rgba(23,61,54,.06)] sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#4c7766]">Resultados de Mariana López</p><p className="mt-2 text-lg font-semibold text-[#173d36]">Listos cuando los necesitas</p></div><span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-semibold text-[#41775f]">Consulta 09 sep 2026</span></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{cards.map(([name, value, unit, color]) => <article key={name} className="rounded-2xl border border-[#e3eae5] p-4"><p className="text-xs font-semibold text-[#66776f]">{name}</p><p className="mt-6 text-3xl font-semibold tracking-[-.05em]" style={{ color }}><span>{value}</span><small className="ml-1 text-xs font-medium text-[#52655d]">{unit}</small></p><p className="mt-5 text-[10px] text-[#52655d]">Procedencia disponible · comparar evolución</p></article>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f4f7f4] px-4 py-3 text-xs"><span className="font-semibold text-[#385c4e]">Mifflin–St Jeor · v1.0.0</span><span className="text-[#52655d]">Datos conectados, sin volver a capturar</span></div></div>;
}

const features = [
  ['01', 'Expediente clínico nutricional', 'Reúne antecedentes, entrevista, mediciones y consultas en la ficha del paciente. Retoma su historia sin reconstruirla en cada visita.'],
  ['02', 'Planes de alimentación', 'Organiza equivalentes, tiempos de comida y menús. Revisa la propuesta y ajusta cada plan a las necesidades de tu paciente.'],
  ['03', 'Seguimiento nutricional', 'Compara mediciones entre consultas, revisa la evolución y prepara un reporte para compartir los avances con tu paciente.'],
] as const;

export function LandingPage() {
  return <div className="landing bg-[#f7f8f4] text-[#17312c]">
    <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-5 focus:top-5 focus:z-[100] focus:rounded-xl focus:bg-white focus:p-4">Saltar al contenido</a>
    <LandingHeader />
    <main id="contenido">
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[.95fr_1.05fr] lg:px-12 lg:pb-24 lg:pt-20">
        <div className="relative z-10 min-w-0">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#477363]">Nuthrick · Tu consulta, conectada</p>
          <h1 className="mt-6 max-w-xl text-balance text-4xl font-semibold leading-[1.04] tracking-[-.05em] sm:text-5xl lg:text-6xl">Software para nutriólogos.<span className="mt-4 block text-[#477863]">Termina cada consulta con el trabajo hecho.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#53665d]">Expedientes, cálculos, planes de alimentación y seguimiento en un mismo lugar. Menos trabajo repetitivo durante y después de la consulta; más atención a tu paciente.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><a href="/register" className="nuth-button justify-center px-6 py-3.5" data-cta="hero-register">Registrarme <ArrowRight size={17} aria-hidden="true" /></a><a href="#segunda-jornada" className="nuth-button-secondary justify-center px-6 py-3.5">Ver cómo funciona <ArrowDown size={16} aria-hidden="true" /></a></div>
          <p className="mt-5 text-sm font-medium text-[#53665d]">Creado por un nutriólogo, desde la experiencia en consulta.</p>
        </div>
        <figure className="min-w-0"><HeroProductMockup /><figcaption className="relative mt-5 text-center text-xs leading-5 text-[#53665d]">Vista ilustrativa del flujo de trabajo · datos de ejemplo</figcaption></figure>
      </section>

      <section id="segunda-jornada" className="border-y border-[#dfe7e1] bg-white py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:px-12">
          <SectionHeading eyebrow="La segunda jornada" title={<>Tu paciente se va.<br />El trabajo no debería empezar de nuevo.</>} />
          <div className="self-center"><p className="text-lg leading-8 text-[#53665d]">Recalcular, buscar notas, terminar el plan y preparar documentos. Lo que queda pendiente también ocupa tu tiempo.</p><p className="mt-5 text-lg leading-8 text-[#53665d]">Nuthrick es un software de nutrición que conecta la información que ya capturaste para ayudarte a avanzar hasta el cierre de la consulta.</p><a href="#como-funciona" className="mt-6 inline-flex items-center gap-2 py-3 font-semibold text-[#365f4d]">Conoce el flujo de consulta <ArrowRight size={16} aria-hidden="true" /></a></div>
        </div>
      </section>

      <section id="como-funciona" className="py-16 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><div className="max-w-3xl"><SectionHeading eyebrow="Cómo funciona" title="Captura una vez. Avanza en cada etapa." description="Desde la entrevista hasta las indicaciones: trabaja con el contexto del paciente y revisa lo que vas a entregar." /></div><FlowVisual /></div></section>

      <section id="funciones" className="bg-[#eef4ef] py-16 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><SectionHeading eyebrow="Para tu consulta" title="La historia, el plan y la evolución. Juntos." /><div className="mt-12 grid gap-8 md:grid-cols-3">{features.map(([number,title,description]) => <article key={number} className="border-t border-[#bccfc1] pt-6"><span className="text-sm font-semibold text-[#477363]">{number}</span><h3 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-4 leading-7 text-[#53665d]">{description}</p></article>)}</div>
        <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]"><figure className="min-w-0"><CalculationsMockup /><figcaption className="mt-4 text-xs text-[#53665d]">Ejemplo ilustrativo de resultados; cada evaluación depende de los datos capturados.</figcaption></figure><div><h3 className="text-3xl font-semibold leading-tight tracking-tight">Cálculos conectados con tu evaluación.</h3><p className="mt-5 text-lg leading-8 text-[#53665d]">Consulta resultados, métodos y evolución a partir de las mediciones registradas. Dedica tu atención a interpretarlos y decidir el siguiente paso.</p></div></div>
      </div></section>

      <section id="nuthrick-ai" className="bg-[#173d36] py-16 sm:py-24"><div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:px-12"><div><SectionHeading inverse eyebrow="Inteligencia artificial como apoyo" title="Nuthrick prepara. Tú decides." description="Usa el contexto de la consulta para trabajar con borradores que puedes revisar y ajustar. Tu criterio profesional guía cada decisión y cada indicación." /><p className="mt-6 text-sm leading-6 text-white/80">La visión de automatización de Nuthrick AI continúa en desarrollo. Los borradores requieren revisión profesional antes de utilizarlos.</p></div><AIContextVisual /></div></section>

      <section className="py-16 sm:py-24"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:px-12"><SectionHeading eyebrow="Después de la consulta" title="Da continuidad sin perder el contexto." description="Retoma las mediciones, el plan y los objetivos acordados en la siguiente visita. La evolución del paciente tiene un lugar en su expediente." /><div className="self-center border-l-2 border-[#bd8a42] pl-7"><h3 className="text-2xl font-semibold">Menos cosas que buscar.<br />Menos cosas que hacer dos veces.</h3><p className="mt-5 leading-7 text-[#53665d]">Agenda, documentación y seguimiento acompañan tu trabajo. Las nuevas automatizaciones de comunicación y de recordatorio de 24 horas se incorporarán conforme estén disponibles.</p><p className="mt-5 text-sm font-semibold text-[#765221]">Automatizaciones adicionales: próximamente.</p></div></div></section>

      <section id="creador" aria-labelledby="creador-titulo" className="border-y border-[#d9e2d9] bg-[#e9eee6] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-12">
          <figure className="min-w-0"><img src="/images/jose-olmedo-nuthrick-1280.webp" srcSet="/images/jose-olmedo-nuthrick-640.webp 640w, /images/jose-olmedo-nuthrick-1280.webp 1280w" sizes="(min-width: 1280px) 535px, (min-width: 1024px) 45vw, calc(100vw - 40px)" width="1280" height="907" loading="lazy" decoding="async" alt="José Olmedo, creador de Nuthrick, en su espacio de trabajo con su perro" className="h-auto w-full rounded-[24px]" /><figcaption className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-[#405d4e]"><span className="font-semibold">José Olmedo</span><span>Nutriólogo y creador de Nuthrick</span></figcaption></figure>
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#477363]">De la consulta al software</p><h2 id="creador-titulo" className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-.04em] sm:text-4xl lg:text-5xl">Creado desde la experiencia de un nutriólogo.</h2><p className="mt-7 text-xl font-semibold leading-8">Nuthrick nació desde un nutriólogo de verdad.</p><p className="mt-5 text-base leading-8 text-[#40584c]">Soy <strong className="font-semibold text-[#17312c]">José Olmedo, nutriólogo con más de 8 años de experiencia en consulta privada</strong>, y desarrollé Nuthrick a partir de los problemas que he vivido día a día atendiendo pacientes: cálculos, planes de alimentación, seguimiento, expedientes y todo el trabajo que continúa después de que termina la consulta.</p><p className="mt-5 text-base leading-8 text-[#40584c]">Por eso Nuthrick no fue diseñado únicamente como un software de nutrición, sino como una herramienta pensada para <strong className="font-semibold text-[#17312c]">hacer más simple, rápido y organizado el trabajo del nutriólogo</strong>, sin reemplazar su criterio profesional.</p></div>
        </div>
      </section>

      <section id="precios" className="bg-white py-16 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><div className="max-w-3xl"><SectionHeading eyebrow="Planes individuales" title="Un plan para acompañar tu práctica." description="Precios de referencia mensuales en pesos mexicanos. Consulta las condiciones y funciones vigentes de cada plan antes de elegir." /></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{individualPlans.map(plan => <article key={plan.code} className={`flex flex-col rounded-[24px] border p-7 ${plan.tone}`}><h3 className="text-xl font-semibold">{plan.name}</h3><p className="mt-6 text-4xl font-semibold tracking-tight">${plan.monthlyPriceMxn}<span className={`ml-2 text-sm font-normal tracking-normal ${plan.value ? 'text-white/80' : 'text-[#53665d]'}`}>MXN / mes</span></p><p className={`mb-7 mt-5 leading-7 ${plan.value ? 'text-white/80' : 'text-[#53665d]'}`}>{plan.note}</p><a href="/planes" className={`mt-auto inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold ${plan.value ? 'bg-white text-[#173d36]' : 'bg-[#edf4ef] text-[#285441]'}`} aria-label={`Consultar plan ${plan.name}`}>Consultar plan <ArrowRight className="ml-2" size={16} aria-hidden="true" /></a></article>)}</div><p className="mt-6 max-w-3xl text-sm leading-6 text-[#53665d]">Esta presentación no activa una suscripción. Las condiciones vigentes se muestran en la página de planes.</p></div></section>

      <section id="preguntas" className="border-t border-[#dfe7e1] py-16 sm:py-24"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:px-12"><SectionHeading eyebrow="Antes de empezar" title="Preguntas sobre Nuthrick" /><div className="divide-y divide-[#d5dfd7]">{[
        ['¿Para quién está pensado Nuthrick?', 'Para nutriólogos que trabajan en consulta y buscan organizar expedientes, evaluación, planes de alimentación y seguimiento en un mismo flujo.'],
        ['¿Puedo preparar planes de alimentación?', 'Sí. Puedes trabajar con equivalentes, tiempos de comida y menús, revisando y ajustando el plan según las necesidades de cada paciente.'],
        ['¿La inteligencia artificial reemplaza mi criterio?', 'No. Las propuestas y borradores son un apoyo. Tú revisas, ajustas y decides qué forma parte de la atención nutricional.'],
        ['¿Cómo empiezo?', 'Crea tu cuenta desde Registrarme y consulta las condiciones vigentes en la página de planes.']
      ].map(([question,answer]) => <article key={question} className="py-6 first:pt-0"><h3 className="text-lg font-semibold">{question}</h3><p className="mt-3 leading-7 text-[#53665d]">{answer}</p></article>)}</div></div></section>

      <section className="px-5 pb-20 sm:px-8"><div className="mx-auto max-w-6xl rounded-[28px] bg-[#173d36] px-6 py-14 text-center text-white sm:px-12"><p className="font-semibold text-[#efbd6b]">Hasta el mejor nutriólogo tiene sus trucos.</p><h2 className="mx-auto mt-5 max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Haz que tu consulta termine cuando termina la consulta.</h2><p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/80">Conecta el trabajo de hoy con la atención que sigue mañana.</p><a href="/register" className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#efbd6b] px-7 py-4 font-bold text-[#173d36]" data-cta="closing-register">Registrarme <ArrowRight size={17} aria-hidden="true" /></a></div></section>
    </main>
    <footer className="border-t border-[#d8e1d9] px-5 py-10 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 lg:flex-row lg:px-4"><div><a href="/" className="text-xl font-bold">Nuthrick</a><p className="mt-3 max-w-sm text-sm leading-6 text-[#53665d]">Software para una consulta nutricional más simple y organizada.</p><p className="mt-5 text-xs text-[#53665d]">© 2026 Nuthrick</p></div><nav aria-label="Enlaces del pie" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-[#405d4e]"><a className="py-2" href="#creador">Quién lo creó</a><a className="py-2" href="/login">Iniciar sesión</a><a className="py-2" href="/planes">Planes vigentes</a><a className="py-2" href="/register">Registrarme</a><a className="py-2" href="/privacy">Privacidad</a><a className="py-2" href="/terms">Términos</a><a className="py-2" href="/refunds">Reembolsos</a><a className="py-2" href="mailto:hola@nuthrick.com">Contacto</a></nav></div></footer>
  </div>;
}
