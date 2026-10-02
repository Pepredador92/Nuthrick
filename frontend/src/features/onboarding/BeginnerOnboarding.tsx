import { ArrowRight, BookOpenCheck, Check, CircleHelp, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

type Step = {
  title: string;
  description: string;
  href: string;
  action: string;
};

const openEvent = "nuthrick:beginner-onboarding-open";

export function openBeginnerOnboarding() {
  window.dispatchEvent(new Event(openEvent));
}

export function BeginnerOnboarding({ includeAI }: { includeAI: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(openEvent, show);
    return () => window.removeEventListener(openEvent, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const steps: Step[] = [
    {
      title: "Completa tu perfil profesional",
      description: "Agrega una descripción, especialidades y medios de contacto para presentar tu práctica.",
      href: "/app/profile",
      action: "Abrir Perfil",
    },
    {
      title: "Registra a tu primer paciente",
      description: "Crea su ficha y organiza ahí su expediente y seguimiento.",
      href: "/app/patients",
      action: "Abrir Pacientes",
    },
    {
      title: "Inicia una consulta",
      description: "Entra a la ficha de un paciente para registrar una consulta y revisar sus datos clínicos.",
      href: "/app/patients",
      action: "Ver pacientes",
    },
    {
      title: "Organiza tus citas y mensajes",
      description: "Revisa la agenda, responde solicitudes y atiende mensajes que llegan por tu página.",
      href: "/app/agenda",
      action: "Abrir Agenda",
    },
    ...(includeAI
      ? [{
          title: "Conoce las funciones de IA de tu plan",
          description: "Consulta tus funciones y créditos. Antes del primer uso verás un aviso que puedes revisar y aceptar tú.",
          href: "/app/credits",
          action: "Ver Créditos IA",
        }]
      : []),
  ];

  if (!open) return null;

  const close = () => setOpen(false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102d27]/55 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="beginner-onboarding-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eaf1e6] text-[#477363]">
              <BookOpenCheck size={21} />
            </span>
            <div>
              <p className="nuth-eyebrow">GUÍA DE INICIO</p>
              <h2 id="beginner-onboarding-title" className="mt-1 text-xl font-semibold text-[#24463b] sm:text-2xl">Tus primeros pasos en Nuthrick</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#687672]">Prepara tu espacio y conoce lo esencial para empezar. Puedes ir a cada módulo ahora o volver a la guía cuando quieras.</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Cerrar guía" className="grid size-10 shrink-0 place-items-center rounded-xl text-[#687672] hover:bg-[#f4f8f4]">
            <X size={19} />
          </button>
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex min-h-40 flex-col rounded-2xl border border-[#e8ede9] bg-[#fbfcfa] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#728078]">
                <span className="grid size-7 place-items-center rounded-full bg-[#eaf1e6] text-[#477363]">{index + 1}</span>
                {includeAI && index === steps.length - 1 && <Sparkles size={15} aria-label="Inteligencia artificial" />}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[#315e4f]">{step.title}</h3>
              <p className="mt-1 flex-1 text-xs leading-5 text-[#75837d]">{step.description}</p>
              <Link to={step.href} onClick={close} className="mt-3 inline-flex min-h-10 items-center gap-2 self-start text-xs font-semibold text-[#285647] hover:underline">
                {step.action}<ArrowRight size={14} />
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ed] pt-4">
          <p className="flex items-center gap-2 text-xs text-[#7b8982]"><Check size={14} />No necesitas completar todo ahora; tu espacio guarda los cambios que realices.</p>
          <button type="button" onClick={close} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe5e1] px-4 text-sm font-semibold text-[#315e4f] hover:bg-[#f5f8f5]">
            <CircleHelp size={16} />Cerrar guía
          </button>
        </div>
      </section>
    </div>
  );
}
