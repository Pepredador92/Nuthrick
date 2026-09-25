import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/src/lib/supabase";
import { useAccess } from "@/src/features/admin/AccessProvider";
import type { Plan } from "../admin/api";
import {
  benefitLabel,
  billingAction,
  dateLabel,
  durationLabel,
  getMyBilling,
  goHosted,
  hostedUrl,
  type Interval,
  intervalLabel,
  money,
  type MyBilling,
  stateLabel,
} from "./api";
import "../admin/admin.css";
import "./billing.css";
export function MyPlanPage() {
  const [data, setData] = useState<MyBilling | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"change" | "cancel" | null>(null);
  const [target, setTarget] = useState("");
  const [interval, setInterval] = useState<Interval>("monthly");
  const [params] = useSearchParams();
  const operation = useRef(crypto.randomUUID());
  const { refresh } = useAccess();
  const load = useCallback(() =>
    getMyBilling().then((current) => {
      setData(current);
      setError("");
    }).catch((error) => setError(error.message)), []);
  useEffect(() => {
    void load();
    void supabase.rpc("plan_catalog").then(({ data }) => setPlans(data ?? []));
  }, [load]);
  useEffect(() => {
    if (params.get("checkout") !== "success") return;
    let n = 0;
    const timer = window.setInterval(() => {
      n++;
      void load();
      void refresh();
      if (n >= 12) window.clearInterval(timer);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [params, load, refresh]);
  const action = async (kind: "portal" | "change" | "cancel" | "resume") => {
    setBusy(true);
    setError("");
    try {
      const result = await billingAction<{ url?: string; timing?: string }>(
        kind,
        {
          operation_key: operation.current,
          ...(kind === "change" ? { plan_id: target, interval } : {}),
        },
      );
      operation.current = crypto.randomUUID();
      if (kind === "portal") {
        goHosted(result.url, "portal");
        return;
      }
      setConfirm(null);
      setNotice(
        kind === "change"
          ? (result.timing === "immediate"
            ? "Cambio solicitado. El acceso se actualizará cuando el pago quede confirmado."
            : "Cambio programado para el final del período pagado.")
          : "Solicitud enviada. Actualiza el estado en unos segundos.",
      );
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const s = data?.subscription;
  const selected = plans.find((p) => p.id === target);
  return (
    <div>
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">CUENTA</p>
          <h1>Mi plan</h1>
          <p className="admin-description">
            Tu suscripción, créditos y comprobantes de pago.
          </p>
        </div>
        <button
          className="admin-button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Actualizar estado
        </button>
      </header>
      <p className="billing-test">
        Stripe Test · Los pagos de esta sección son pruebas.
      </p>
      {params.get("checkout") === "success" && (
        <p role="status" className="billing-benefits">
          Estamos confirmando tu pago de prueba. El estado de tu plan se
          actualizará en unos momentos.
        </p>
      )}
      {error && <p role="alert" className="admin-error">{error}</p>}
      {notice && <p role="status" className="billing-benefits">{notice}</p>}
      {!data && !error && <p className="mt-6">Cargando tu plan…</p>}
      {data && (
        <>
          <section className="admin-card billing-section">
            <h2>
              {s?.plan_name ?? data.access.plan_name ?? "Sin plan contratado"}
            </h2>
            <dl className="billing-stats">
              <div>
                <dt>Estado</dt>
                <dd>{s ? stateLabel(s.state) : data.access.status}</dd>
              </div>
              <div>
                <dt>Modalidad</dt>
                <dd>
                  {s
                    ? s.interval === "monthly" ? "Mensual" : "Anual"
                    : data.access.arrangement === "founder"
                    ? "Acceso permanente"
                    : "Acceso administrado"}
                </dd>
              </div>
              {s && (
                <>
                  <div>
                    <dt>Precio base contratado</dt>
                    <dd>
                      {money(s.amount, s.currency)} /{" "}
                      {intervalLabel(s.interval)}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {s.cancel_at_period_end
                        ? "Acceso pagado hasta"
                        : "Próxima renovación"}
                    </dt>
                    <dd>{dateLabel(s.paid_through ?? s.period_end)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Créditos del plan por mes</dt>
                <dd>{String(data.access.values["ai.monthly_credits"] ?? 0)}</dd>
              </div>
              <div>
                <dt>Créditos disponibles</dt>
                <dd>
                  {data.credits.available ?? (Number(data.credits.additional) < 0 ? 0 : Number(data.credits.included) +
                    Number(data.credits.additional))}
                </dd>
                <small>
                  {Number(data.credits.included)} incluidos ·{" "}
                  {Number(data.credits.additional)} adicionales
                </small>
              </div>
            </dl>
            {s?.state === "grace" && (
              <p role="status" className="billing-test">
                Tu renovación está pendiente. Puedes seguir trabajando hasta
                {" "}
                {dateLabel(s.grace_until)}. Actualiza tu método de pago para
                conservar el acceso.
              </p>
            )}
            {s?.state === "suspended" && (
              <p role="status" className="billing-test">
                Puedes consultar tus expedientes. Resuelve el pago pendiente
                para volver a crear y editar información.
              </p>
            )}
            {data.access.status === "trial" && data.access.ends_at && (
              <p role="status" className="billing-benefits">
                Tu acceso de prueba termina el {dateLabel(data.access.ends_at)}.
                Elige un plan antes de esa fecha para continuar sin interrupciones. <Link className="admin-link" to="/planes">Ver planes</Link>
              </p>
            )}
            {data.access.status === "cancelled" && (
              <p role="status" className="billing-test">
                Tu suscripción terminó. Tus datos se conservaron. Elige un plan
                para volver a trabajar en Nuthrick.
              </p>
            )}
            {data.access.patient_usage?.over_limit && (
              <p role="status" className="billing-test">
                Tienes más pacientes activos que el límite del plan actual.
                Conservamos todos tus datos; archiva pacientes o revisa los
                planes para continuar creando nuevos registros. <Link className="admin-link" to="/planes">Ver planes</Link>
              </p>
            )}
            {s?.manual_hold && (
              <p className="billing-test">
                Tu acceso tiene un ajuste administrativo. Contacta a
                administración para revisar la sincronización del plan.
              </p>
            )}
            {s?.pending_plan_id && (
              <p className="billing-benefits">
                Cambio pendiente: {s.pending_plan_name ?? plans.find((p) =>
                  p.id === s.pending_plan_id
                )?.name} ·{" "}
                {s.pending_interval === "annual" ? "Anual" : "Mensual"}. Se
                confirma mediante Stripe.
              </p>
            )}
            {s?.cancel_at_period_end && (
              <p className="billing-benefits">
                Cancelación programada para{" "}
                {dateLabel(s.period_end)}. Tus datos se conservarán.
              </p>
            )}
            {s?.campaign_snapshot && (
              <div className="billing-benefits">
                <strong>Promoción de origen: {s.campaign_snapshot.code}</strong>
                <ul>
                  {s.campaign_snapshot.benefits.map((b, i) => (
                    <li key={i}>{benefitLabel(b)} · {durationLabel(b)}</li>
                  ))}
                </ul>
                <p>
                  El beneficio termina según su duración; después se aplica el
                  precio base contratado.
                </p>
              </div>
            )}
            <div className="billing-controls">
              <Link className="admin-button secondary" to="/app/credits">Ver créditos y recargar</Link>
              {s && (
                <button
                  className="admin-button"
                  disabled={busy}
                  onClick={() => void action("portal")}
                >
                  Administrar pago y facturas
                </button>
              )}
              {s && s.state !== "cancelled"
                ? (
                  <>
                    {s.cancel_at_period_end
                      ? (
                        <button
                          className="admin-button secondary"
                          disabled={busy}
                          onClick={() => void action("resume")}
                        >
                          Continuar mi suscripción
                        </button>
                      )
                      : (
                        <>
                          <button
                            className="admin-button secondary"
                            disabled={busy || s.state !== "active" ||
                              s.manual_hold}
                            onClick={() => {
                              setTarget(s.plan_id);
                              setInterval(s.interval);
                              setConfirm("change");
                              operation.current = crypto.randomUUID();
                            }}
                          >
                            Cambiar plan
                          </button>
                          <button
                            className="admin-button secondary"
                            disabled={busy}
                            onClick={() => {
                              setConfirm("cancel");
                              operation.current = crypto.randomUUID();
                            }}
                          >
                            Cancelar suscripción
                          </button>
                        </>
                      )}
                  </>
                )
                : (
                  <Link className="admin-button" to="/planes">Elegir plan</Link>
                )}
            </div>
            {confirm === "cancel" && (
              <div className="billing-confirm">
                <h3 className="font-semibold">
                  Cancelar al terminar tu período
                </h3>
                <p className="my-3">
                  Mantienes acceso hasta{" "}
                  {dateLabel(s?.period_end)}. Se cancelan los cambios de plan
                  pendientes. Tus pacientes, consultas y archivos se conservan.
                </p>
                <div className="billing-controls">
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={() => void action("cancel")}
                  >
                    Confirmar cancelación al vencimiento
                  </button>
                  <button
                    className="admin-button secondary"
                    onClick={() => setConfirm(null)}
                  >
                    Conservar suscripción
                  </button>
                </div>
              </div>
            )}
            {confirm === "change" && (
              <div className="billing-confirm">
                <h3 className="font-semibold">Cambiar plan</h3>
                <div className="billing-inline">
                  <label className="admin-field">
                    Plan<select
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        operation.current = crypto.randomUUID();
                      }}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    Modalidad<select
                      value={interval}
                      onChange={(e) => {
                        setInterval(e.target.value as Interval);
                        operation.current = crypto.randomUUID();
                      }}
                    >
                      <option value="monthly">Mensual</option>
                      <option value="annual">Anual</option>
                    </select>
                  </label>
                </div>
                <p>
                  Precio base: {money(
                    (interval === "monthly"
                      ? selected?.monthly_price ?? 0
                      : selected?.annual_price ?? 0) * 100,
                  )} / {intervalLabel(interval)}.
                </p>
                <p className="admin-note mt-3">
                  Las mejoras en la misma modalidad se solicitan de inmediato y
                  Stripe calcula el prorrateo. Las reducciones y cambios entre
                  mensual/anual se aplican al final del período pagado. Los
                  créditos ya asignados se conservan hasta su vencimiento.
                </p>
                <div className="billing-controls">
                  <button
                    className="admin-button"
                    disabled={busy || !target ||
                      (target === s?.plan_id && interval === s.interval)}
                    onClick={() => void action("change")}
                  >
                    Confirmar cambio
                  </button>
                  <button
                    className="admin-button secondary"
                    onClick={() => setConfirm(null)}
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="admin-card billing-section">
            <h2>Historial de pagos</h2>
            {!data.payments.length
              ? <p className="admin-note">Aún no hay pagos registrados.</p>
              : (
                <div className="billing-table-wrap">
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Importe</th>
                        <th>Estado</th>
                        <th>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr key={p.provider_invoice_id}>
                          <td>{dateLabel(p.issued_at)}</td>
                          <td>
                            {money(
                              p.status === "paid"
                                ? p.amount_paid
                                : p.amount_due,
                              p.currency,
                            )} {p.currency}
                          </td>
                          <td>
                            {p.status === "paid"
                              ? "Pagado"
                              : p.status === "open"
                              ? "Pendiente"
                              : p.status}
                          </td>
                          <td>
                            {hostedUrl(p.hosted_url, "invoice")
                              ? (
                                <a
                                  className="admin-link"
                                  href={hostedUrl(p.hosted_url, "invoice")!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Ver en Stripe ↗
                                </a>
                              )
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </>
      )}
    </div>
  );
}
