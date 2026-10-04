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
  paymentLabel,
  type MyBilling,
  stateLabel,
} from "./api";
import "../admin/admin.css";
import "./billing.css";
import "./billingWorkspace.css";
import { RetentionOffer, RetentionStatus, type RetentionOfferData } from "./RetentionOffer";
export function MyPlanPage() {
  const [data, setData] = useState<MyBilling | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [retention, setRetention] = useState<RetentionOfferData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"change" | "cancel" | null>(null);
  const [target, setTarget] = useState("");
  const [interval, setInterval] = useState<Interval>("monthly");
  const [params] = useSearchParams();
  const operation = useRef(crypto.randomUUID());
  const retentionSelection = useRef("");
  const { refresh } = useAccess();
  const load = useCallback(() =>
    getMyBilling().then((current) => {
      setData(current);
      setError("");
    }).catch((error) => setError(error.message)), []);
  useEffect(() => {
    void load();
    void supabase.rpc("plan_catalog").then(({ data }) => setPlans(data ?? []));
    void supabase.rpc("my_retention_offer").then(({ data, error }) => {
      if (!error && data && !Array.isArray(data)) setRetention(data);
    });
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
  const action = async (kind: "portal" | "change" | "cancel" | "resume" | "retention", patientIds?: string[]) => {
    setBusy(true);
    setError("");
    try {
      const result = await billingAction<{ url?: string; timing?: string }>(
        kind,
        {
          operation_key: operation.current,
          ...(kind === "change" ? { plan_id: target, interval } : {}),
          ...(kind === "retention" ? { patient_ids: patientIds } : {}),
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
      const offer = await supabase.rpc("my_retention_offer");
      if (!offer.error && offer.data && !Array.isArray(offer.data)) setRetention(offer.data);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const s = data?.subscription;
  const checkoutPayment = data?.payments.find(p => p.provider_invoice_id === s?.latest_invoice_id && p.status === 'paid');
  const selected = plans.find((p) => p.id === target);
  const cheaperPlans = plans.flatMap((p) => {
    if (!s || !p.id || p.active === false || p.internal_only || p.id === s.plan_id || p.currency !== s.currency) return [];
    const price = s.interval === "annual" ? p.annual_price : p.monthly_price;
    return price != null && price > 0 && price * 100 < s.amount
      ? [{ id: p.id, name: p.name, price }]
      : [];
  });
  return (
    <div className="plan-workspace billing-workspace">
      <header className="admin-heading billing-workspace-hero">
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
      {data && <p className="billing-test">
        {data?.mode === "live" ? "Stripe Live · Suscripción con cobro real." : "Stripe Test · Los pagos de esta sección son pruebas."}
      </p>}
      {params.get("checkout") === "success" && (
        <p role="status" className="billing-benefits">
          {s?.state === 'trial' ? 'Tus 30 días de prueba están activos. Puedes ver la fecha del primer cobro y cancelar desde aquí.' : checkoutPayment
            ? (checkoutPayment.refunded_amount ? 'El reembolso de tu pago está registrado en el historial.' : 'Tu pago está confirmado. El estado de tu plan está actualizado.')
            : 'Estamos confirmando tu pago. El estado de tu plan se actualizará en unos momentos.'}
        </p>
      )}
      {error && <p role="alert" className="admin-error">{error}</p>}
      {notice && <p role="status" className="billing-benefits">{notice}</p>}
      {!data && !error && <p className="mt-6">Cargando tu plan…</p>}
      {data && (
        <>
          <section className="admin-card billing-section plan-summary-card">
            <p className="billing-step">01 · Tu suscripción</p>
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
                    ? data.access.retention ? "Cada 30 días" : s.interval === "monthly" ? "Mensual" : "Anual"
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
                      {data.access.retention ? "30 días" : intervalLabel(s.interval)}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {s.state === 'trial' ? (s.cancel_at_period_end ? 'Prueba disponible hasta' : 'Primer cobro') : s.cancel_at_period_end
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
                {s?.state === 'trial' ? <>
                  Tu prueba termina el {dateLabel(s.period_end)}. {s.cancel_at_period_end
                    ? 'La renovación está cancelada; no se realizará el primer cobro.'
                    : <>Después se cobrarán automáticamente {money(s.amount, s.currency)} MXN por {intervalLabel(s.interval)}. Puedes cancelar antes de esa fecha desde esta página.</>}
                </> : <>Tu acceso de prueba termina el {dateLabel(data.access.ends_at)}. Elige un plan antes de esa fecha para continuar sin interrupciones. <Link className="admin-link" to="/planes">Ver planes</Link></>}
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
                {retention?.current ? "Cada 30 días" : s.pending_interval === "annual" ? "Anual" : "Mensual"}. Se
                confirma mediante Stripe.
              </p>
            )}
            {s?.cancel_at_period_end && !s.retention_ends_at && !retention?.current && (
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
            <div id="plan-actions" className="plan-actions-card">
            <p className="billing-step">02 · Gestiona tu plan</p>
            <h3>Acciones disponibles</h3>
            <p className="admin-note">Consulta tus créditos, administra pagos o solicita un cambio cuando lo necesites.</p>
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
                    {s.cancel_at_period_end && !retention?.current
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
            {retention && <RetentionStatus offer={retention} />}
            {confirm === "cancel" && (
              <div className="billing-confirm">
                <h3 className="font-semibold">
                  Cancelar al terminar tu período
                </h3>
                <p className="my-3">
                  Puedes conservar tu suscripción{cheaperPlans.length > 0 ? " o revisar un plan más económico" : ""}.
                  Si prefieres cancelar, puedes hacerlo aquí mismo.
                </p>
                {retention && <RetentionOffer offer={retention} busy={busy} onConfirm={ids => {
                  const selection = JSON.stringify(ids);
                  if (retention.retry_operation_key) {
                    operation.current = retention.retry_operation_key;
                  } else if (selection !== retentionSelection.current) {
                    operation.current = crypto.randomUUID();
                    retentionSelection.current = selection;
                  }
                  void action("retention", ids);
                }} />}
                {cheaperPlans.length > 0 && s?.state === "active" && !s.manual_hold && (
                  <div className="billing-controls" aria-label="Alternativas de plan">
                    {cheaperPlans.map((p) => (
                      <button
                        key={p.id}
                        className="admin-button secondary"
                        disabled={busy}
                        onClick={() => {
                          setTarget(p.id);
                          setInterval(s.interval);
                          operation.current = crypto.randomUUID();
                          setConfirm("change");
                        }}
                      >
                        Ver {p.name} · {money(p.price * 100, s.currency)} / {intervalLabel(s.interval)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="my-3">
                  Mantienes acceso hasta{" "}
                  {dateLabel(s?.period_end)}. Se cancelan los cambios de plan
                  pendientes. Tus pacientes, consultas y archivos se conservan.
                  Después podrás entrar, consultar y exportar información básica;
                  para volver a trabajar necesitarás un plan vigente.
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
                    disabled={busy}
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
            </div>
          </section>
          <section id="plan-payments" className="admin-card billing-section plan-payments-card">
            <p className="billing-step">03 · Comprobantes</p>
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
                            {!!p.refunded_amount && <small className="block">Devuelto: {money(p.refunded_amount,p.currency)} {p.currency}</small>}
                          </td>
                          <td>
                            {paymentLabel(p)}
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
