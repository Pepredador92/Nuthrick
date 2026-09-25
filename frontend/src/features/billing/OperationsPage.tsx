import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, MailCheck, Play, RefreshCw, ShieldAlert, Webhook } from "lucide-react";
import { Link } from "react-router-dom";
import { operationsAdmin, type OperationsOverview } from "./api";
import { Heading } from "../admin/AdminPages";
import "./billing.css";

function timestamp(value: string | null) {
  return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin ejecución";
}

function jobLabel(value: string) {
  return ({
    "nuthrick-agenda-worker": "Agenda",
    "nuthrick-billing-monthly-and-grace": "Billing mensual y gracia",
    "nuthrick-transactional-email-outbox": "Outbox de emails",
  } as Record<string, string>)[value] ?? value;
}

export function OperationsPage() {
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await operationsAdmin<OperationsOverview>("overview");
      setData(next);
      setSupportEmail(next.support.support_email);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar Operaciones.");
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void operationsAdmin<OperationsOverview>("overview").then((next) => {
      if (!mounted) return;
      setData(next);
      setSupportEmail(next.support.support_email);
    }).catch((caught) => {
      if (mounted) setError(caught instanceof Error ? caught.message : "No pudimos cargar Operaciones.");
    });
    return () => { mounted = false; };
  }, []);
  const run = async (action: "run_billing_job" | "process_email_outbox") => {
    setBusy(action); setNotice("");
    try {
      await operationsAdmin(action);
      setNotice(action === "run_billing_job" ? "Job de billing ejecutado en TEST." : "Outbox de emails procesado en TEST.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos ejecutar la operación.");
    } finally { setBusy(""); }
  };
  const retry = async (id: string) => {
    setBusy(`retry:${id}`); setNotice("");
    try {
      await operationsAdmin("retry_email", { id });
      setNotice("Email marcado para reintento controlado.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos reintentar el email.");
    } finally { setBusy(""); }
  };
  const saveSupport = async (event: FormEvent) => {
    event.preventDefault(); setBusy("support"); setNotice("");
    try {
      await operationsAdmin("support_settings", { enabled: true, channel: "email", support_email: supportEmail, response_hours: data?.support.response_hours ?? 48, test_mode: true });
      setNotice("Canal de soporte guardado en modo TEST.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos guardar el canal.");
    } finally { setBusy(""); }
  };

  return (
    <>
      <Heading eyebrow="Operación · TEST" title="Operaciones" text="Jobs, webhooks, emails y soporte con datos comerciales. No abre expedientes clínicos ni activa Live.">
        <button className="admin-button secondary" onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw size={16} />Actualizar</button>
      </Heading>
      {error && <p role="alert" className="admin-error">{error}</p>}
      {notice && <p role="status" className="admin-success">{notice}</p>}
      {!data && !error && <p className="admin-loading">Cargando Operaciones…</p>}
      {data && <>
        <section className="operations-grid">
          <article className="admin-card">
            <div className="operations-card-title"><Clock3 size={18} /><h2>Jobs</h2></div>
            <div className="operations-list">
              {data.jobs.map((job) => <div className="operations-row" key={job.jobname}>
                <div><strong>{jobLabel(job.jobname)}</strong><small>{job.schedule ?? "Manual"} · {job.active ? "Activo" : "Inactivo"}</small></div>
                <span className={job.last_status === "succeeded" ? "operations-ok" : job.last_status === "failed" ? "operations-fail" : "operations-pending"}>{job.last_status === "succeeded" ? "Correcto" : job.last_status === "failed" ? "Falló" : "Pendiente"}</span>
                <small>{timestamp(job.last_run_at)}{job.last_error ? ` · ${job.last_error}` : ""}</small>
              </div>)}
            </div>
            <button className="admin-button secondary mt-4" onClick={() => void run("run_billing_job")} disabled={Boolean(busy)}><Play size={15} />{busy === "run_billing_job" ? "Ejecutando…" : "Ejecutar billing TEST"}</button>
          </article>
          <article className="admin-card">
            <div className="operations-card-title"><Webhook size={18} /><h2>Webhooks Stripe</h2></div>
            <div className="operations-metrics"><strong>{data.webhooks.pending}</strong><span>pendientes</span><strong>{data.webhooks.errors}</strong><span>con error</span></div>
            <p className="admin-note">Último recibido: {timestamp(data.webhooks.last_received)}<br />Último procesado: {timestamp(data.webhooks.last_processed)}</p>
            {!data.webhooks.errors && <p className="operations-ok">Sin errores recientes.</p>}
          </article>
          <article className="admin-card">
            <div className="operations-card-title"><MailCheck size={18} /><h2>Emails transaccionales</h2></div>
            <p className="admin-note">Proveedor: <strong>{data.emails.provider} · {data.emails.mode}</strong><br />{data.emails.template_count} plantillas activas · {data.emails.sent} enviados en TEST<br />Última prueba: {timestamp(data.emails.last_test_at)}</p>
            <div className="operations-metrics"><strong>{data.emails.pending}</strong><span>pendientes</span><strong>{data.emails.failed}</strong><span>fallidos</span></div>
            <button className="admin-button secondary mt-4" onClick={() => void run("process_email_outbox")} disabled={Boolean(busy)}><Play size={15} />{busy === "process_email_outbox" ? "Procesando…" : "Procesar outbox TEST"}</button>
            {data.emails.recent_failed.map((item) => <div className="operations-row" key={item.id}><div><strong>{item.template_key}</strong><small>{item.last_error ?? "Error desconocido"} · {item.attempts} intentos</small></div><button className="admin-button secondary" disabled={Boolean(busy)} onClick={() => void retry(item.id)}>Reintentar</button></div>)}
          </article>
          <article className="admin-card">
            <div className="operations-card-title"><ShieldAlert size={18} /><h2>Soporte operativo</h2></div>
            <p className="admin-note">Casos derivados sin datos clínicos. Tiempo objetivo: {data.support.response_hours} h.</p>
            <div className="operations-case-grid"><span>Pagos: <strong>{data.support.cases.payment_attention}</strong></span><span>Webhooks: <strong>{data.support.cases.webhook_failed}</strong></span><span>Créditos: <strong>{data.support.cases.credit_review}</strong></span><span>Emails: <strong>{data.support.cases.email_failed}</strong></span></div>
            <form className="operations-support-form" onSubmit={saveSupport}><label className="admin-field">Canal de soporte<input type="email" required value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label><button className="admin-button secondary" disabled={Boolean(busy)}>{busy === "support" ? "Guardando…" : "Guardar canal TEST"}</button></form>
          </article>
        </section>
        <section className="admin-card billing-section">
          <h2>Legal versionado</h2>
          <p className="admin-note">La infraestructura y el registro de aceptación están listos. La aprobación no se cambia desde esta vista.</p>
          <div className="operations-legal-list">{data.legal.documents.map((doc) => <span key={doc.key}><Link to={doc.content_ref}>{doc.title} · v{doc.version}</Link><strong className={doc.review_status === "approved" ? "operations-ok" : "operations-pending"}>{doc.review_status === "approved" ? "Aprobado" : "Pendiente de revisión"}</strong></span>)}</div>
        </section>
        <p className="admin-note">Runbook: <Link className="admin-link" to="/admin/readiness">ver resumen PRE-LIVE</Link>. Las acciones administrativas quedan auditadas; la conciliación de suscripciones y ajustes de créditos conservan sus controles existentes.</p>
      </>}
    </>
  );
}
