import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  if ("mode" in detail && "webhooks_failed" in detail) {
    return `Pagos confirmados: ${detail.paid_payments} · operaciones sin resolver: ${detail.operations_unresolved} · webhooks fallidos: ${detail.webhooks_failed} · emails fallidos: ${detail.emails_failed} · discrepancias de suscripción: ${detail.subscription_mismatches ?? "sin verificar"}. Ver identificadores en Operaciones.`;
  }
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
              <strong>Stripe {data.mode.toUpperCase()} · Live {data.live_enabled ? "limitado a cuentas autorizadas" : "deshabilitado"} · OpenAI {data.openai_enabled ? "habilitado" : "deshabilitado"}</strong>
              <p>Pagos Live confirmados: {data.live_payments ?? "pendiente de verificar"}. El primer cobro requiere autorización explícita.</p>
            </div>
          </section>
          {data.live && (
            <section className="admin-card billing-section" aria-label="Controles específicos Live">
              <h2>LIVE-1 · Activación controlada</h2>
              <p className="admin-note">Estos controles complementan los 15 generales. Legal pendiente impide configurar credenciales Live. La lista de cuentas autorizadas y el checkout permanecen cerrados durante la preparación.</p>
              <div className="prelive-checks">
                {data.live.checks.map((check) => (
                  <article className={`prelive-check ${statusClass[check.status]}`} key={check.key}>
                    <div className="prelive-check-title"><StatusIcon status={check.status} /><h3>{check.label}</h3><span>{statusLabel[check.status]}</span></div>
                    <p>{detailText(check.detail)}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
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
          {data.operations && (
            <section className="admin-card billing-section">
              <div className="prelive-operations-heading">
                <div><h2>Estado operativo</h2><p className="admin-note">Últimas ejecuciones, webhooks y emails. El detalle accionable está en Operaciones.</p></div>
                <Link className="admin-button secondary" to="/admin/operations">Abrir Operaciones</Link>
              </div>
              <div className="operations-legal-list">{data.operations.legal.documents.map(doc => <span key={doc.key}><strong>{doc.title} · v{doc.version}</strong><span>{doc.review_status === "approved" ? "Aprobado" : "Pendiente de revisión"}</span><Link to={`/admin/legal/${doc.key}`}>Ver documento</Link></span>)}</div>
              <div className="prelive-operations-grid">
                <div><strong>Jobs</strong>{data.operations.jobs.map((job) => <span key={job.jobname}>{job.jobname.replace("nuthrick-", "")} · {job.last_status === "succeeded" ? "correcto" : job.last_status ?? "sin run"}</span>)}</div>
                <div><strong>Webhooks</strong><span>{data.operations.webhooks.pending} pendientes · {data.operations.webhooks.errors} errores</span><span>Último: {data.operations.webhooks.last_processed ? new Date(data.operations.webhooks.last_processed).toLocaleString("es-MX") : "sin eventos"}</span></div>
                <div><strong>Emails</strong><span>{data.operations.emails.template_count} plantillas · {data.operations.emails.failed} fallidos</span><span>Proveedor {data.operations.emails.provider} · modo {data.operations.emails.mode}</span></div>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
