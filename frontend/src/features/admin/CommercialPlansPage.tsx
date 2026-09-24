import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/src/lib/supabase";
import { valueLabel, type Plan } from "./api";
import "./admin.css";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
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
      <Link className="admin-link" to="/app">
        ← Volver a mi espacio
      </Link>
      <header className="admin-heading mt-8">
        <div>
          <p className="admin-eyebrow">NUTHRICK</p>
          <h1>Un plan para tu consulta</h1>
          <p className="admin-description">
            Conserva tus expedientes. Elige la capacidad que necesitas para
            seguir atendiendo.
          </p>
        </div>
      </header>
      <div className="admin-tabs mb-6" aria-label="Modalidad de precios">
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
      {error && <p role="alert">{error}</p>}
      {loading && <p>Cargando planes…</p>}
      {!loading && !error && !plans.length && (
        <p>No hay planes disponibles por el momento.</p>
      )}
      <div className="admin-grid">
        {plans.map((p) => (
          <section key={p.name} className="admin-card">
            <h2 className="admin-plan-name">{p.name}</h2>
            <p className="admin-note min-h-16">{p.description}</p>
            <p className="my-6 text-3xl font-semibold">
              {formatPrice(
                interval === "monthly" ? p.monthly_price : p.annual_price,
                p.currency,
              )}{" "}
              <span className="text-sm font-normal">
                {p.currency} / {interval === "monthly" ? "mes" : "año"}
              </span>
            </p>
            <ul className="space-y-3 text-sm">
              <li>
                {p.values["patients.limit"] === "unlimited"
                  ? "Pacientes activos ilimitados"
                  : `${valueLabel(p.values["patients.limit"])} pacientes activos`}
              </li>
              {[
                ["consultations", "Consultas"],
                ["consultation_design", "Diseño de consulta"],
                ["diet_workshop", "Taller manual"],
                ["agenda", "Agenda"],
                ["public_profile", "Perfil público"],
                ["patient_superlink", "Superlink con chat"],
              ]
                .filter(([key]) => p.values[key] === true)
                .map(([key, label]) => (
                  <li key={key}>{label}</li>
                ))}
              <li>
                {[
                  ["ai.recall_24h", "R24h"],
                  ["ai.pes", "PES"],
                ]
                  .filter(([key]) => p.values[key] === true)
                  .map(([, label]) => label)
                  .join(" y ") || "IA sin R24h/PES"}{" "}
                · {valueLabel(p.values["ai.monthly_credits"])} créditos
                incluidos por mes {p.credits_provisional && "(provisionales)"}
              </li>
              <li>
                {p.values["ai.diet_draft"]
                  ? "Taller con IA incluido"
                  : "Taller con IA no incluido"}
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
          </section>
        ))}
      </div>
      <p className="admin-note mt-6">
        La contratación se gestiona con la administración de Nuthrick. Los
        créditos incluidos se renuevan mensualmente también en anual y no se
        acumulan; las recargas y cortesías se conservan. La IA aún no está
        habilitada para uso general.
      </p>
    </main>
  );
}
