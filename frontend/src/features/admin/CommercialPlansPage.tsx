import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/src/lib/supabase";
import { valueLabel, type Plan } from "./api";
import "./admin.css";
import "../billing/billing.css";
import { CheckoutChoice } from '../billing/CheckoutChoice';

function formatPrice(amount: number | null, currency: string) {
  if (amount === null) return "Por definir";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

// This endpoint only returns active public plans; no account or internal plan data.
export function CommercialPlansPage() {
  const [params] = useSearchParams();
  const [selection, setSelection] = useState<string | null>(params.get("plan"));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<"monthly" | "annual">(params.get("interval") === "annual" ? "annual" : "monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.rpc("plan_catalog").then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) setError("No pudimos cargar los planes. Intenta nuevamente.");
      else setPlans(data ?? []);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="admin-shell commercial-plans">
      <div className="commercial-plans-inner">
        <div className="commercial-plans-topbar">
          <Link className="admin-link" to="/app">
            ← Volver a mi espacio
          </Link>
          <span className="commercial-plans-wordmark">NUTHRICK <i /> PLANES</span>
        </div>
        <header className="commercial-plans-hero">
          <div className="commercial-plans-intro">
            <p className="admin-eyebrow">PLANES PARA NUTRIÓLOGOS</p>
            <h1>Un plan para tu consulta<span>.</span></h1>
            <p className="admin-description">
              Conserva tus expedientes. Elige la capacidad que necesitas para
              seguir atendiendo.
            </p>
          </div>
          <div className="commercial-plans-billing">
            <p className="commercial-plans-billing-label">Elige tu modalidad</p>
            <div className="admin-tabs commercial-plan-switch" role="group" aria-label="Modalidad de precios">
              <button
                className={`admin-button ${interval === "monthly" ? "" : "secondary"}`}
                aria-pressed={interval === "monthly"}
                onClick={() => setInterval("monthly")}
              >
                Mensual
              </button>
              <button
                className={`admin-button ${interval === "annual" ? "" : "secondary"}`}
                aria-pressed={interval === "annual"}
                onClick={() => setInterval("annual")}
              >
                Anual
              </button>
            </div>
          </div>
        </header>
        {selection && plans.find(p=>p.id===selection) && <div className="commercial-plans-checkout"><CheckoutChoice key={`${selection}:${interval}`} plan={plans.find(p=>p.id===selection)!} interval={interval} close={()=>setSelection(null)} /></div>}
        {error && <p role="alert" className="commercial-plans-message">{error}</p>}
        {loading && <p role="status" className="commercial-plans-message">Cargando planes…</p>}
        {!loading && !error && !plans.length && (
          <p className="commercial-plans-message">No hay planes disponibles por el momento.</p>
        )}
        <div className="commercial-plan-grid" aria-busy={loading}>
          {plans.map((p) => (
            <section key={p.name} className="admin-card commercial-plan-card">
              {p.welcome_trial_days === 30 && <div className="commercial-plan-trial"><strong>30 días gratis</strong><span>Para nuevos usuarios · Con tarjeta</span></div>}
              <div className="commercial-plan-heading">
                <p className="commercial-plan-label">PARA TU PRÁCTICA</p>
                <h2 className="admin-plan-name">{p.name}</h2>
                <p className="admin-note commercial-plan-description">{p.description}</p>
              </div>
              <p className="commercial-plan-price">
                {formatPrice(
                  interval === "monthly" ? p.monthly_price : p.annual_price,
                  p.currency,
                )}
                <span>{p.currency} / {interval === "monthly" ? "mes" : "año"}</span>
              </p>
              <ul className="commercial-plan-features">
                <li>
                  {p.values["patients.limit"] === "unlimited"
                    ? "Pacientes activos ilimitados"
                    : `${valueLabel(p.values["patients.limit"])} pacientes activos`}
                </li>
                {[
                  ["consultations", "Consultas"],
                  ["consultation_design", "Diseño de consulta"],
                  ["diet_workshop", "Taller manual"],
                  ["public_profile", "Perfil público"],
                  ["patient_superlink", "Superlink con chat"],
                ]
                  .filter(([key]) => p.values[key] === true)
                  .map(([key, label]) => (
                    <li key={key}>{label}</li>
                  ))}
                <li>
                  {["ai.recall_24h", "ai.pes", "ai.diet_draft", "ai.consultation_support", "ai.patient_instructions"].some(key => p.values[key] === true)
                    ? <>IA: {[["ai.recall_24h", "R24h"], ["ai.pes", "PES"], ["ai.diet_draft", "Taller"], ["ai.consultation_support", "Objetivos de consulta"], ["ai.patient_instructions", "Indicaciones del paciente"]].filter(([key]) => p.values[key] === true).map(([, label]) => label).join(", ")} · {valueLabel(p.values["ai.monthly_credits"])} créditos incluidos por mes {p.credits_provisional && "(provisionales)"}</>
                    : "Funciones básicas · Sin IA"}
                </li>
                {p.values["diet_library"] === true && (
                  <li>
                    {p.values["diet_library.full"]
                      ? "Biblioteca compartida completa"
                      : "Biblioteca personal y selección inicial compartida"}
                  </li>
                )}
                {[
                  ["exports", "PDF de planes"],
                  ["exports.tex", "LaTeX para el profesional"],
                  ["exports.advanced", "Exportaciones avanzadas"],
                ]
                  .filter(([key]) => p.values[key] === true)
                  .map(([key, label]) => (
                    <li key={key}>{label}</li>
                  ))}
              </ul>
              <button className="admin-button commercial-plan-action" disabled={!p.id || (interval === 'monthly' ? p.monthly_price : p.annual_price) === null} onClick={()=>{setSelection(p.id!);window.scrollTo({top:0,behavior:'smooth'});}}>Elegir {p.name}</button>
            </section>
          ))}
        </div>
        <p className="admin-note commercial-plans-footnote">
          Los créditos incluidos se renuevan mensualmente también en anual y no se
          acumulan; las recargas y cortesías se conservan. Las funciones de IA
          requieren un plan que las incluya, consentimiento y saldo disponible.
        </p>
      </div>
    </main>
  );
}
