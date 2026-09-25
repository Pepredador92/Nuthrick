import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { getPreLiveReadiness, type PreLiveCheck, type PreLiveReadiness } from "./api";
import "./billing.css";

const statusLabel: Record<PreLiveCheck["status"], string> = {
  ready: "Listo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};
const statusClass: Record<PreLiveCheck["status"], string> = {
  ready: "prelive-ready",
  pending: "prelive-pending",
  blocked: "prelive-blocked",
};

function detailText(detail: PreLiveCheck["detail"]) {
  if (typeof detail === "string") return detail;
  return Object.entries(detail).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

function StatusIcon({ status }: { status: PreLiveCheck["status"] }) {
  if (status === "ready") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (status === "blocked") return <CircleAlert size={18} aria-hidden="true" />;
  return <Clock3 size={18} aria-hidden="true" />;
}

export function PreLiveReadinessPage() {
  const [data, setData] = useState<PreLiveReadiness | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    return getPreLiveReadiness().then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">PRE-LIVE · SOLO LECTURA</p>
          <h1>Readiness comercial</h1>
          <p className="admin-description">
            Evidencia operativa para decidir cuándo autorizar Live. Esta vista
            no cambia Stripe, OpenAI ni ningún secreto.
          </p>
        </div>
        <button className="admin-button secondary" onClick={() => { setError(""); void load(); }}>
          Actualizar revisión
        </button>
      </header>
      {error && <p role="alert" className="admin-error">{error}</p>}
      {!data && !error && <p>Cargando revisión…</p>}
      {data && (
        <>
          <section className="admin-card prelive-banner" role="status">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <strong>Stripe TEST · Live deshabilitado · OpenAI {data.openai_enabled ? "habilitado" : "deshabilitado"}</strong>
              <p>Los cobros reales permanecen en cero. La activación de Live requiere una decisión separada y explícita.</p>
            </div>
          </section>
          <section className="admin-card billing-section">
            <div className="prelive-summary" aria-label="Resumen de readiness">
              <span><strong>{data.summary.ready}</strong> listos</span>
              <span><strong>{data.summary.pending}</strong> pendientes</span>
              <span><strong>{data.summary.blocked}</strong> bloqueados</span>
            </div>
            <div className="prelive-checks">
              {data.checks.map((check) => (
                <article className={`prelive-check ${statusClass[check.status]}`} key={check.key}>
                  <div className="prelive-check-title">
                    <StatusIcon status={check.status} />
                    <h2>{check.label}</h2>
                    <span>{statusLabel[check.status]}</span>
                  </div>
                  <p>{detailText(check.detail)}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="admin-card billing-section">
            <h2>Antes de Live</h2>
            <p className="admin-note">
              Aprobar precios y políticas, textos legales, proveedor de email,
              soporte, monitoring, productos/precios/webhook Live, Customer
              Portal Live y una prueba de cobro real autorizada. Esta lista es
              deliberadamente manual y no expone credenciales.
            </p>
          </section>
        </>
      )}
    </>
  );
}
