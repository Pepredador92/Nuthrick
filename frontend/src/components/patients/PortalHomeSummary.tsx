import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ClipboardList, MessageCircle, Target, Utensils } from "lucide-react";
import { formatFoodQuantity } from "@/src/features/menu/units";
import { portalAction, type PortalAccess, type PortalPlan, type PortalView } from "@/src/services/patientPortal";
import { portalDate } from "./PortalContentView";

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

function latestValue(result: PortalView["shared"]["results"][number]) {
  return [...result.points].sort((a, b) => b.date.localeCompare(a.date))[0];
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
  const results = view.shared.results.slice(0, 3);

  return (
    <div className="portal-home space-y-4">
      <section className="portal-card portal-home-today">
        <div className="flex items-start justify-between gap-4">
          <div><p className="nuth-eyebrow">Hoy</p><h2 className="mt-2 text-2xl font-semibold">Tu guía para hoy</h2><p className="mt-2 text-sm text-[#63796d]">Un resumen sencillo de lo que puedes hacer ahora.</p></div>
          <span className="grid size-11 place-items-center rounded-2xl bg-[#e8f1e6] text-[#477363]"><Utensils size={20} /></span>
        </div>
        {loading ? <p role="status" className="mt-5 text-sm text-[#74817d]">Cargando tu plan…</p> : error ? <p role="alert" className="mt-5 text-sm text-[#963f34]">{error}</p> : !plan || !today ? <p className="mt-5 text-sm text-[#74817d]">Tu nutriólogo aún no ha compartido un plan publicado en este espacio.</p> : <div className="portal-home-meals mt-5">{today.meals.slice(0, 4).map((meal) => <article key={meal.name} className="portal-home-meal"><p className="text-xs font-semibold uppercase tracking-wide text-[#477363]">{meal.name}{meal.time ? ` · ${meal.time}` : ""}</p><h3 className="mt-2 font-semibold text-[#24463b]">{meal.title}</h3><p className="mt-2 text-xs leading-5 text-[#63796d]">{meal.ingredients.slice(0, 3).map((item) => `${formatFoodQuantity(item.amount)} ${item.unit} de ${item.name}`).join(" · ")}</p></article>)}</div>}
        <button type="button" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#477363]" onClick={() => onOpenTab("plan")}>Ver mi plan completo <ArrowRight size={16} /></button>
      </section>

      <div className="portal-home-grid">
        <section className="portal-card">
          <div className="flex items-center gap-2 text-[#416955]"><Target size={18} /><h2 className="font-semibold">Mi objetivo</h2></div>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#53685e]">{view.shared.goal || "Tu nutriólogo compartirá aquí el objetivo que acuerden."}</p>
          <h3 className="mt-5 border-t border-[#edf1ed] pt-4 text-sm font-semibold text-[#416955]">Mis indicaciones</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#53685e]">{view.shared.instructions || "Todavía no hay indicaciones compartidas."}</p>
        </section>
        <section className="portal-card">
          <div className="flex items-center gap-2 text-[#416955]"><MessageCircle size={18} /><h2 className="font-semibold">Mensajes</h2></div>
          <p className="mt-4 text-sm leading-6 text-[#53685e]">{view.unread ? `Tienes ${view.unread} mensaje${view.unread === 1 ? "" : "s"} nuevo${view.unread === 1 ? "" : "s"} de tu nutriólogo.` : "No tienes mensajes pendientes."}</p>
          <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#477363]" onClick={() => onOpenTab("chat")}>Abrir chat <ArrowRight size={16} /></button>
        </section>
        <section className="portal-card">
          <div className="flex items-center gap-2 text-[#416955]"><CalendarDays size={18} /><h2 className="font-semibold">Mi progreso</h2></div>
          {results.length ? <div className="mt-4 grid gap-3">{results.map((result) => { const latest = latestValue(result); return <div key={result.id} className="flex items-end justify-between gap-3 border-b border-[#edf1ed] pb-3 last:border-0 last:pb-0"><span className="min-w-0 text-sm text-[#53685e]">{result.label}<span className="mt-1 block text-xs text-[#89958f]">{latest ? portalDate(latest.date) : ""}</span></span><strong className="shrink-0 text-lg text-[#285d4d]">{latest?.value || "—"} <span className="text-xs font-normal">{result.unit}</span></strong></div>; })}</div> : <p className="mt-4 text-sm text-[#74817d]">Tu nutriólogo compartirá aquí los resultados que decida mostrarte.</p>}
          <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#477363]" onClick={() => onOpenTab("results")}>Ver progreso <ArrowRight size={16} /></button>
        </section>
        <section className="portal-card">
          <div className="flex items-center gap-2 text-[#416955]"><ClipboardList size={18} /><h2 className="font-semibold">Consultas compartidas</h2></div>
          <p className="mt-4 text-sm leading-6 text-[#53685e]">{view.shared.consultations.length ? `Tienes ${view.shared.consultations.length} resumen${view.shared.consultations.length === 1 ? "" : "es"} disponible${view.shared.consultations.length === 1 ? "" : "s"}.` : "Aún no hay resúmenes de consulta compartidos."}</p>
          <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#477363]" onClick={() => onOpenTab("history")}>Ver consultas <ArrowRight size={16} /></button>
        </section>
      </div>
    </div>
  );
}
