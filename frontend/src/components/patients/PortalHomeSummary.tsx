import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ClipboardList, MessageCircle, Target, Utensils } from "lucide-react";
import { formatFoodQuantity } from "@/src/features/menu/units";
import { portalAction, type PortalAccess, type PortalPlan, type PortalView } from "@/src/services/patientPortal";
import { portalProgress } from "@/src/features/patients/portalProgress";
import { isPortalSomatochart, portalSomatochart } from "@/src/features/patients/portalSomatochart";
import { PortalResultCard } from "./PortalResultCard";
import { PortalCardHeading } from "./PortalCardHeading";

const dayNames: Record<string, string> = {
  sun: "Domingo",
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
};

function currentDayName() {
  const code = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Mexico_City" }).format(new Date()).slice(0, 3).toLowerCase();
  return dayNames[code] || "";
}

export function PortalHomeSummary({
  access,
  view,
  onOpenTab,
}: {
  access: PortalAccess;
  view: PortalView;
  onOpenTab: (tab: string) => void;
}) {
  const [plan, setPlan] = useState<PortalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadPlan = useCallback(async () => {
    try {
      const result = await portalAction<{ plan: PortalPlan | null }>(access, "plan");
      setPlan(result.plan);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tu plan.");
    } finally {
      setLoading(false);
    }
  }, [access]);
  useEffect(() => {
    queueMicrotask(() => void loadPlan());
    const timer = window.setInterval(() => void loadPlan(), 30000);
    return () => window.clearInterval(timer);
  }, [loadPlan]);

  const today = useMemo(() => {
    if (!plan?.days.length) return null;
    const name = currentDayName();
    return plan.days.find((day) => day.name === name) || plan.days[0];
  }, [plan]);
  const results = view.shared.results;
  const featured = results.find((result) => isPortalSomatochart(result) ? portalSomatochart(result).valid.length > 0 : portalProgress(result).numeric.length > 0) ?? results[0];

  return (
    <div className="portal-home">
      <div className="portal-home-primary">
        <section className="portal-card portal-home-today">
          <PortalCardHeading icon={Utensils} title="Tu guía para hoy" subtitle="Comienza con tu alimentación" />
          <div className="portal-card-body">
            <p className="portal-muted text-sm leading-6">Un resumen sencillo de lo que puedes hacer ahora.</p>
            {loading ? <p role="status" className="mt-5 text-sm text-[#74817d]">Cargando tu plan…</p> : error ? <p role="alert" className="mt-5 text-sm text-[#963f34]">{error}</p> : !plan || !today ? <p className="mt-5 text-sm text-[#74817d]">Tu nutriólogo aún no ha compartido un plan publicado en este espacio.</p> : <div className="portal-home-meals mt-5">{today.text!==undefined&&<article className="portal-home-meal"><h3 className="font-semibold">{today.name}</h3><p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-6">{today.text}</p></article>}{today.meals.slice(0, 4).map((meal) => <article key={meal.name} className="portal-home-meal"><p className="text-xs font-semibold uppercase tracking-wide text-[#477363]">{meal.name}{meal.time ? ` · ${meal.time}` : ""}</p><h3 className="mt-2 font-semibold text-[#24463b]">{meal.title}</h3><p className="mt-2 text-xs leading-5 text-[#63796d]">{meal.ingredients.slice(0, 3).map((item) => `${formatFoodQuantity(item.amount)} ${item.unit} de ${item.name}`).join(" · ")}</p></article>)}</div>}
            <button type="button" className="portal-card-action is-primary mt-5" onClick={() => onOpenTab("plan")}>Ver mi plan completo <ArrowRight size={16} /></button>
          </div>
        </section>

        <section className="portal-card portal-home-progress">
          <PortalCardHeading icon={CalendarDays} title="Mi progreso" subtitle="Tu recorrido, consulta a consulta" tone="blue" />
          <div className="portal-card-body">
            {featured ? <div className="mt-4"><PortalResultCard key={featured.id} result={featured} compact /></div> : <p className="mt-4 text-sm text-[#74817d]">Tu nutriólogo compartirá aquí los resultados que decida mostrarte.</p>}
            <button type="button" className="portal-card-action mt-4" onClick={() => onOpenTab("results")}>Ver todas mis gráficas <ArrowRight size={16} /></button>
          </div>
        </section>
      </div>
      <div className="portal-home-grid">
        <section className="portal-card portal-home-goal">
          <PortalCardHeading icon={Target} title="Mi objetivo" subtitle="Lo que acordamos trabajar" tone="amber" />
          <div className="portal-card-body">
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#53685e]">{view.shared.goal || "Tu nutriólogo compartirá aquí el objetivo que acuerden."}</p>
            <h3 className="mt-5 border-t border-[#edf1ed] pt-4 text-sm font-semibold text-[#416955]">Mis indicaciones</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#53685e]">{view.shared.instructions || "Todavía no hay indicaciones compartidas."}</p>
          </div>
        </section>
        <section className="portal-card portal-home-messages">
          <PortalCardHeading icon={MessageCircle} title="Mensajes" subtitle="Cerca de tu nutriólogo" tone="violet" trailing={view.unread > 0 ? <span className="portal-count">{view.unread}</span> : undefined} />
          <div className="portal-card-body">
            <p className="mt-4 text-sm leading-6 text-[#53685e]">{view.unread ? `Tienes ${view.unread} mensaje${view.unread === 1 ? "" : "s"} nuevo${view.unread === 1 ? "" : "s"} de tu nutriólogo.` : "No tienes mensajes pendientes."}</p>
            <button type="button" className="portal-card-action mt-4" onClick={() => onOpenTab("chat")}>Abrir chat <ArrowRight size={16} /></button>
          </div>
        </section>
        <section className="portal-card portal-home-history">
          <PortalCardHeading icon={ClipboardList} title="Consultas compartidas" subtitle="Los acuerdos que llevamos contigo" />
          <div className="portal-card-body">
            <p className="mt-4 text-sm leading-6 text-[#53685e]">{view.shared.consultations.length ? `Tienes ${view.shared.consultations.length} resumen${view.shared.consultations.length === 1 ? "" : "es"} disponible${view.shared.consultations.length === 1 ? "" : "s"}.` : "Aún no hay resúmenes de consulta compartidos."}</p>
            <button type="button" className="portal-card-action mt-4" onClick={() => onOpenTab("history")}>Ver consultas <ArrowRight size={16} /></button>
          </div>
        </section>
      </div>
    </div>
  );
}
