import { ArrowRight, BookOpenCheck, Check, CircleHelp, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

type Step = {
  title: string;
  description: string;
  href: string;
  action: string;
};

function storageKey(userId: string) {
  return `nuthrick:beginner-onboarding:hidden:${userId}:v1`;
}

export function BeginnerOnboarding({ userId, includeAI }: { userId: string; includeAI: boolean }) {
  const key = storageKey(userId);
  const [open, setOpen] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });

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

  const hide = () => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // The guide still closes for this session if browser storage is unavailable.
    }
    setOpen(false);
  };

  const reopen = () => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Reopening does not depend on browser storage.
    }
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={reopen}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#dfe5e1] bg-white px-4 py-3 text-sm font-semibold text-[#315e4f] hover:bg-[#f5f8f5]"
      >
        <CircleHelp size={17} />
        Ver guía para principiantes
      </button>
    );
  }

  return (
    <section aria-labelledby="beginner-onboarding-title" className="mt-6 rounded-[28px] border border-[#dfe5e1] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        <button type="button" onClick={hide} className="rounded-xl px-3 py-2 text-sm font-semibold text-[#687672] hover:bg-[#f4f8f4]">Ocultar guía</button>
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
            <Link to={step.href} className="mt-3 inline-flex min-h-10 items-center gap-2 self-start text-xs font-semibold text-[#285647] hover:underline">
              {step.action}<ArrowRight size={14} />
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-center gap-2 text-xs text-[#7b8982]"><Check size={14} />No necesitas completar todo ahora; tu espacio guarda los cambios que realices.</p>
    </section>
  );
}
