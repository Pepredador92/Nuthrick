import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Globe2,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Menu,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/src/components/ui/Logo';

const benefits = [
  { icon: Clock3, title: 'Recupera tiempo', text: 'Un espacio claro para la información de tu práctica, sin hojas dispersas.' },
  { icon: Globe2, title: 'Comparte tu perfil', text: 'Presenta tus servicios desde una página pública profesional y fácil de compartir.' },
  { icon: LockKeyhole, title: 'Privacidad desde el origen', text: 'Tus datos quedan aislados por cuenta mediante políticas de seguridad en la base de datos.' },
];

const features = [
  { icon: UserRound, title: 'Perfil profesional', text: 'Biografía, especialidades, formación, establecimiento y enlaces, todo en un mismo lugar.', accent: 'bg-[#edf4ef] text-[#487563]' },
  { icon: Link2, title: 'Página pública', text: 'Un enlace propio para mostrar sólo la información que tú decidas publicar.', accent: 'bg-[#fdf0e5] text-[#a96534]' },
  { icon: CalendarDays, title: 'Disponibilidad', text: 'Configura duración, zona horaria y rangos semanales sin horarios superpuestos.', accent: 'bg-[#f7f0dc] text-[#95742e]' },
  { icon: LayoutDashboard, title: 'Una base para crecer', text: 'Arquitectura preparada para pacientes, consultas y agenda en las siguientes etapas.', accent: 'bg-[#eaf0f4] text-[#476875]' },
];

const questions = [
  ['¿Nuthrick tiene costo?', 'No en esta primera etapa. La plataforma comienza gratuita y no te pedirá una tarjeta para crear tu cuenta.'],
  ['¿Mis datos están separados de los de otros profesionales?', 'Sí. Además de los controles en la aplicación, la base de datos aplica Row Level Security para que cada cuenta acceda únicamente a sus registros.'],
  ['¿Ya incluye pacientes y agenda?', 'Todavía no. Esta versión se concentra en tu cuenta, onboarding, perfil profesional, disponibilidad y página pública.'],
  ['¿Puedo iniciar con Google?', 'Sí. Puedes registrarte con Google —el método recomendado— o usar email y contraseña.'],
];

function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]" aria-label="Vista previa del dashboard de Nuthrick">
      <div className="absolute -left-14 -top-16 h-52 w-52 rounded-full bg-[#f4c985]/35 blur-3xl" />
      <div className="absolute -bottom-12 -right-10 h-60 w-60 rounded-full bg-[#80b9a8]/30 blur-3xl" />
      <div className="relative rounded-[30px] border border-white/80 bg-white/85 p-3 shadow-[0_30px_90px_rgba(37,68,58,.16)] backdrop-blur">
        <div className="overflow-hidden rounded-[22px] border border-[#e4e9e5] bg-[#fbfcfa]">
          <div className="flex h-11 items-center gap-2 border-b border-[#e5eae6] px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e9a0a0]" /><span className="h-2.5 w-2.5 rounded-full bg-[#efd38d]" /><span className="h-2.5 w-2.5 rounded-full bg-[#93c8a7]" />
            <span className="ml-3 h-5 w-36 rounded-md bg-[#eef1ed]" />
          </div>
          <div className="grid min-h-[390px] grid-cols-[72px_1fr] sm:grid-cols-[155px_1fr]">
            <aside className="border-r border-[#e7ebe7] bg-[#f5f7f3] p-4">
              <div className="mb-8 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#173d36] text-xs font-bold text-white">N</span><span className="hidden text-xs font-semibold sm:block">Nuthrick</span></div>
              <div className="space-y-3">
                {['Inicio', 'Perfil', 'Pacientes', 'Agenda'].map((item, index) => (
                  <div key={item} className={`flex h-9 items-center gap-2 rounded-lg px-2 ${index === 0 ? 'bg-white text-[#173d36] shadow-sm' : 'text-[#8a9691]'}`}>
                    <span className={`h-4 w-4 rounded ${index === 0 ? 'bg-[#6da18f]' : 'bg-[#dce2de]'}`} /><span className="hidden text-[11px] font-medium sm:block">{item}</span>
                  </div>
                ))}
              </div>
            </aside>
            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between"><div><p className="text-[10px] font-medium uppercase tracking-widest text-[#8b9792]">Tu espacio profesional</p><h2 className="mt-1 text-lg font-semibold">Hola, Susy</h2></div><div className="h-9 w-9 rounded-full bg-[#e6b782]" /></div>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#183f37] p-4 text-white"><p className="text-[10px] text-white/60">Tu perfil</p><p className="mt-4 text-lg font-semibold">En progreso</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full w-2/3 bg-[#efbd6b]" /></div></div>
                <div className="rounded-2xl border border-[#e2e7e3] bg-white p-4"><p className="text-[10px] text-[#7f8d88]">Página pública</p><p className="mt-4 text-sm font-semibold">Lista para compartir</p><span className="mt-3 inline-block rounded-lg bg-[#edf4ef] px-2 py-1 text-[9px] text-[#497363]">Ver página →</span></div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#e2e7e3] bg-white p-4">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold">Próximos pasos</p><span className="text-[9px] text-[#83908b]">Personaliza tu espacio</span></div>
                <div className="mt-4 space-y-3">{['Completa tus enlaces', 'Configura tu disponibilidad'].map((label, index) => <div key={label} className="flex items-center gap-3 text-[10px] text-[#5b6964]"><span className={`h-7 w-7 rounded-lg ${index ? 'bg-[#79aa98]' : 'bg-[#e5b36a]'}`} /><span>{label}</span></div>)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main className="overflow-hidden bg-[#f7f8f4] text-[#17312c]">
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#53645f] md:flex" aria-label="Navegación principal"><a href="#funciones">Características</a><a href="#como-funciona">Cómo funciona</a><a href="#preguntas">Preguntas frecuentes</a></nav>
        <div className="hidden items-center gap-3 sm:flex"><Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold">Iniciar sesión</Link><Link to="/register" className="nuth-button">Crear cuenta gratis</Link></div>
        <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[#d9e0dc] sm:hidden" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><Menu size={19} /></button>
        {menuOpen && <div className="absolute inset-x-5 top-17 rounded-2xl border border-[#dfe5e1] bg-white p-4 shadow-xl sm:hidden"><nav className="grid gap-2"><a href="#funciones" className="p-2" onClick={() => setMenuOpen(false)}>Características</a><a href="#como-funciona" className="p-2" onClick={() => setMenuOpen(false)}>Cómo funciona</a><Link to="/login" className="p-2">Iniciar sesión</Link><Link to="/register" className="nuth-button mt-2 text-center">Crear cuenta gratis</Link></nav></div>}
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:px-12 lg:pb-32 lg:pt-20">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d7e0d9] bg-white px-3 py-1.5 text-xs font-semibold text-[#52645f]"><Sparkles size={13} className="text-[#c77d3c]" />Tu práctica nutricional, en un solo lugar</div>
          <h1 className="max-w-2xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-6xl lg:text-7xl">Más tiempo para tus pacientes. <span className="text-[#c77d3c]">Menos para administrar.</span></h1>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-[#62716d]">Nuthrick reúne tu perfil profesional y las bases de tu consulta en una experiencia clara, segura y hecha para nutriólogos.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link to="/register" className="nuth-button justify-center px-6 py-3.5">Crear cuenta gratis <ArrowRight size={17} /></Link><a href="#funciones" className="nuth-button-secondary justify-center px-6 py-3.5">Conocer Nuthrick</a></div>
          <p className="mt-4 flex items-center gap-2 text-xs text-[#73817d]"><Check size={14} />Gratis en esta primera etapa · Sin tarjeta</p>
        </div>
        <ProductMockup />
      </section>

      <section className="border-y border-[#e1e7e2] bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-2xl text-center"><p className="nuth-eyebrow">Pensado para tu día a día</p><h2 className="nuth-heading mt-4">Una práctica más ordenada comienza con una base sencilla</h2></div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">{benefits.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-[26px] border border-[#e1e6e2] bg-[#fbfcf9] p-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e9f1ec] text-[#3e705f]"><Icon size={22} /></span><h3 className="mt-6 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-[#687672]">{text}</p></article>)}</div>
        </div>
      </section>

      <section id="funciones" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="grid items-end gap-8 lg:grid-cols-2"><div><p className="nuth-eyebrow">Funciones esenciales</p><h2 className="nuth-heading mt-4 max-w-xl">Todo lo necesario para presentar y organizar tu práctica</h2></div><p className="max-w-xl text-lg leading-8 text-[#687672] lg:justify-self-end">Esta primera versión se enfoca en los fundamentos: tu identidad, tu información profesional y la seguridad que deberá sostener cada módulo futuro.</p></div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">{features.map(({ icon: Icon, title, text, accent }) => <article key={title} className="group rounded-[28px] border border-[#dde4df] bg-white p-7 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(24,61,53,.08)] sm:p-8"><div className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${accent}`}><Icon size={22} /></span><ChevronRight className="text-[#9ba7a2] transition group-hover:translate-x-1" size={20} /></div><h3 className="mt-8 text-xl font-semibold">{title}</h3><p className="mt-3 max-w-lg leading-7 text-[#687672]">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-[#173d36] py-24 text-white sm:py-32">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:px-12">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f1bd6a]">Tu perfil, con tu identidad</p><h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Una página profesional lista para compartir</h2><p className="mt-6 max-w-lg text-lg leading-8 text-white/65">Publica únicamente lo que elijas: especialidades, educación, modalidades, enlaces, galería y establecimiento.</p><div className="mt-8 space-y-3">{['Slug único y amigable', 'Diseño adaptable a cualquier pantalla', 'Datos públicos separados de los privados'].map((item) => <p key={item} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Check size={14} /></span>{item}</p>)}</div></div>
          <div className="relative"><div className="absolute inset-10 rounded-full bg-[#efb356]/20 blur-3xl" /><div className="relative mx-auto max-w-lg rounded-[32px] bg-[#f8f5ed] p-5 text-[#17312c] shadow-2xl"><div className="rounded-[24px] bg-white p-7 sm:p-9"><div className="flex flex-col items-center text-center"><div className="grid h-24 w-24 place-items-center rounded-full bg-[#e8b779] text-2xl font-semibold">SO</div><span className="mt-5 rounded-full bg-[#edf4ef] px-3 py-1 text-xs font-semibold text-[#4c7566]">Nutrióloga</span><h3 className="mt-3 text-2xl font-semibold">Susy Olmedo</h3><p className="mt-2 text-sm text-[#73807c]">Nutrición clínica · Consulta en línea</p></div><p className="mt-7 border-t border-[#edf0ed] pt-6 text-center text-sm leading-6 text-[#65736e]">Acompañamiento nutricional cercano, práctico y basado en tus objetivos.</p><div className="mt-6 flex justify-center gap-2">{['Diabetes', 'Salud digestiva', 'Adultos'].map((tag) => <span key={tag} className="rounded-full bg-[#f4f5f1] px-3 py-1.5 text-[11px]">{tag}</span>)}</div><button disabled className="mt-7 w-full rounded-xl bg-[#d9dfdb] py-3 text-sm font-semibold text-[#7d8984]">Agendar — Próximamente</button></div></div></div>
        </div>
      </section>

      <section id="como-funciona" className="py-24 sm:py-32"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12"><div className="mx-auto max-w-2xl text-center"><p className="nuth-eyebrow">Cómo funciona</p><h2 className="nuth-heading mt-4">Empieza en tres pasos sencillos</h2></div><div className="mt-16 grid gap-8 md:grid-cols-3">{[['01', 'Crea tu cuenta', 'Regístrate con Google o con tu email y contraseña.'], ['02', 'Configura tu perfil', 'Completa los datos esenciales y personaliza lo que mostrarás.'], ['03', 'Comparte tu página', 'Activa tu perfil público y usa tu enlace en redes o con pacientes.']].map(([number, title, text]) => <article key={number} className="relative"><span className="text-6xl font-semibold tracking-[-.06em] text-[#dfe7e1]">{number}</span><h3 className="mt-4 text-xl font-semibold">{title}</h3><p className="mt-3 max-w-xs leading-7 text-[#687672]">{text}</p></article>)}</div></div></section>

      <section id="preguntas" className="border-y border-[#e0e6e1] bg-white py-24"><div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[.72fr_1.28fr]"><div><p className="nuth-eyebrow">Preguntas frecuentes</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em]">Lo esencial antes de empezar</h2></div><div className="divide-y divide-[#e4e8e5]">{questions.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{question}<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f0f3ef] text-lg transition group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-4 leading-7 text-[#687672]">{answer}</p></details>)}</div></div></section>

      <section className="px-5 py-20 sm:px-8 sm:py-28"><div className="mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-[#eab76b] px-6 py-16 text-center text-[#17312c] shadow-[0_25px_80px_rgba(174,115,45,.18)] sm:px-12"><p className="text-xs font-bold uppercase tracking-[.16em]">Tu espacio empieza aquí</p><h2 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Construye una presencia profesional que se sienta tuya</h2><p className="mx-auto mt-5 max-w-xl text-[#4f554e]">Crea tu cuenta gratis y configura las bases de tu práctica en Nuthrick.</p><Link to="/register" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#173d36] px-6 py-3.5 text-sm font-semibold text-white">Crear cuenta gratis <ArrowRight size={17} /></Link></div></section>

      <footer className="border-t border-[#dde4df] bg-[#f1f3ee] px-5 py-12 sm:px-8"><div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]"><div><Logo /><p className="mt-4 max-w-xs text-sm leading-6 text-[#687672]">Tecnología clara y segura para profesionales de la nutrición.</p></div><div><p className="font-semibold">Producto</p><div className="mt-4 grid gap-3 text-sm text-[#687672]"><a href="#funciones">Características</a><a href="#como-funciona">Cómo funciona</a><Link to="/register">Crear cuenta</Link></div></div><div><p className="font-semibold">Recursos</p><div className="mt-4 grid gap-3 text-sm text-[#687672]"><a href="#preguntas">Preguntas frecuentes</a><a href="mailto:hola@nuthrick.com">Contacto</a></div></div><div><p className="font-semibold">Legal</p><div className="mt-4 grid gap-3 text-sm text-[#687672]"><Link to="/privacy">Privacidad</Link><Link to="/terms">Términos</Link></div></div></div><div className="mx-auto mt-12 flex max-w-7xl flex-col gap-2 border-t border-[#d9e0db] pt-6 text-xs text-[#7c8884] sm:flex-row sm:justify-between"><p>© 2026 Nuthrick</p><p>Hecho para una práctica nutricional más humana.</p></div></footer>
    </main>
  );
}
