import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { billingAction, dateLabel, goHosted, hostedUrl, money } from "./api";
import {
  creditNumber as n,
  type CreditQuote,
  getMyCredits,
  type MyCredits,
  purchaseState,
} from "./credits-api";
import "../admin/admin.css";
import "./billing.css";
export function MyCreditsPage() {
  const [data, setData] = useState<MyCredits | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPackages, setShowPackages] = useState(false),
    [selected, setSelected] = useState(""),
    [code, setCode] = useState(""),
    [quote, setQuote] = useState<CreditQuote | null>(null),
    [waitingEnded, setWaitingEnded] = useState(false);
  const [params] = useSearchParams();
  const purchaseId = params.get("purchase");
  const operation = useRef(crypto.randomUUID());
  const load = useCallback(() =>
    getMyCredits().then((d) => {
      setData(d);
      setError("");
      return d;
    }).catch((e: Error) => {
      setError(e.message);
      return null;
    }), []);
  useEffect(() => {
    void load();
  }, [load]);
  const returned = data?.purchases.find((p) => p.id === purchaseId);
  const confirmed = !!returned?.credited_at;
  const waiting = !!purchaseId && !confirmed &&
    !["failed", "cancelled"].includes(returned?.status ?? "");
  useEffect(() => {
    if (!waiting) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      void load();
      if (++attempts >= 12) {
        window.clearInterval(timer);
        setWaitingEnded(true);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);
  const run = async (
    action: "credit_checkout" | "credit_preview" | "credit_expire",
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await billingAction<CreditQuote & { url?: string }>(
        action,
        {
          operation_key: operation.current,
          ...(action === "credit_expire" ? {} : { package_id: selected, code }),
        },
      );
      if (action === "credit_checkout") {
        goHosted(result.url, "checkout");
        return;
      }
      operation.current = crypto.randomUUID();
      if (action === "credit_preview") setQuote(result);
      else {
        setQuote(null);
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const canBuy = data?.enabled && data.eligible && data.test_eligible;
  return (
    <div>
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">CUENTA</p>
          <h1>Créditos IA</h1>
          <p className="admin-description">Tu saldo y tus recargas.</p>
        </div>
        <Link className="admin-link" to="/app/my-plan">Mi plan</Link>
      </header>
      <p className="billing-test">
        Entorno de prueba · Los paquetes e importes TEST son provisionales. No
        se realizan cobros reales.
      </p>
      {error && <p role="alert" className="admin-error">{error}</p>}
      {waiting && (
        <p role="status" className="billing-benefits">
          {waitingEnded
            ? "La confirmación está tardando. Puedes actualizar el estado en unos momentos."
            : "Estamos confirmando tu pago…"}
        </p>
      )}
      {confirmed && returned?.status === "paid" && (
        <p role="status" className="billing-benefits">
          Tus créditos ya están disponibles.
        </p>
      )}
      {purchaseId && ["failed", "cancelled"].includes(returned?.status ?? "") &&
        (
          <p role="status" className="billing-test">
            No pudimos confirmar la recarga. Puedes volver a intentarlo.
          </p>
        )}
      {!data && !error && <p>Cargando tus créditos…</p>}
      {data && (
        <>
          <section className="admin-card billing-section">
            <p className="admin-note">Disponibles</p>
            <p className="credits-total">
              {n(data.balances.available)} <span>créditos</span>
            </p>
            <dl className="billing-stats">
              <div>
                <dt>Incluidos este período</dt>
                <dd>{n(data.balances.included)}</dd>
                <small>Renovación: {dateLabel(data.balances.period_end)}</small>
              </div>
              <div>
                <dt>Adicionales</dt>
                <dd>{n(data.balances.additional)}</dd>
                <small>Los créditos adicionales no vencen.</small>
              </div>
            </dl>
            <p className="admin-note">
              Primero se usan los créditos incluidos. Las recargas se conservan
              al renovar tu plan.
            </p>
            {data.balances.debt > 0 && (
              <p role="status" className="billing-test">
                Hay {n(data.balances.debt)}{" "}
                créditos pendientes de regularizar por una reversión. Los nuevos
                usos de IA están pausados hasta cubrir ese saldo.
              </p>
            )}
            {data.balances.in_review && (
              <p role="status" className="billing-test">
                Una recarga está en revisión. Los nuevos usos de IA están
                pausados; contacta a administración.
              </p>
            )}
            <div className="billing-controls">
              <button
                className="admin-button"
                disabled={!canBuy || busy}
                onClick={() => setShowPackages(true)}
              >
                Recargar créditos
              </button>
              <button
                className="admin-button secondary"
                disabled={busy}
                onClick={() => void load()}
              >
                Actualizar estado
              </button>
            </div>
            {!data.eligible
              ? (
                <p className="admin-note">
                  Tu acceso actual no permite comprar créditos. Puedes
                  consultarlo con administración.
                </p>
              )
              : !data.test_eligible || !data.enabled
              ? (
                <p className="admin-note">
                  Las recargas TEST están disponibles para las cuentas de prueba
                  autorizadas.
                </p>
              )
              : null}
            <p className="admin-note mt-4">
              La disponibilidad de funciones IA depende de tu plan y de su
              habilitación en Nuthrick. Una recarga no activa esas funciones.
            </p>
          </section>
          {data.pending && (
            <section className="admin-card billing-section">
              <h2>Recarga pendiente</h2>
              <p>
                Puedes continuar el pago o cancelar esta sesión antes de elegir
                otro paquete.
              </p>
              <div className="billing-controls">
                {hostedUrl(data.pending.url, "checkout") && (
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={() => goHosted(data.pending?.url, "checkout")}
                  >
                    Continuar pago TEST
                  </button>
                )}
                <button
                  className="admin-button secondary"
                  disabled={busy}
                  onClick={() => void run("credit_expire")}
                >
                  Cancelar sesión pendiente
                </button>
              </div>
            </section>
          )}
          {showPackages && canBuy && !data.pending && (
            <section className="admin-card billing-section">
              <h2>Elige tu recarga TEST</h2>
              <div className="credits-packages">
                {data.packages.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`credits-package ${
                      selected === p.id ? "selected" : ""
                    }`}
                    aria-pressed={selected === p.id}
                    disabled={busy}
                    onClick={() => {
                      setSelected(p.id);
                      setQuote(null);
                      operation.current = crypto.randomUUID();
                    }}
                  >
                    <small>TEST</small>
                    <strong>{n(p.credits)} créditos</strong>
                    <span>{p.name}</span>
                    {p.bonus_credits > 0 && (
                      <span>+{n(p.bonus_credits)} de regalo</span>
                    )}
                    <b>{money(p.price_amount * 100, p.currency)}</b>
                    {p.description && <small>{p.description}</small>}
                  </button>
                ))}
              </div>
              {!data.packages.length && <p>Aún no hay paquetes disponibles.</p>}
              {selected && (
                <div className="billing-section">
                  <label className="admin-field">
                    Código promocional (opcional)<input
                      value={code}
                      maxLength={40}
                      disabled={busy}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setQuote(null);
                        operation.current = crypto.randomUUID();
                      }}
                    />
                  </label>
                  <div className="billing-controls">
                    <button
                      className="admin-button secondary"
                      disabled={busy}
                      onClick={() => void run("credit_preview")}
                    >
                      Revisar importe
                    </button>
                  </div>
                  {quote && (
                    <div className="billing-benefits">
                      <strong>
                        {n(quote.credits + quote.bonus)} créditos ·{" "}
                        {money(quote.amount, quote.currency)}
                      </strong>
                      {quote.campaign && (
                        <p>
                          {quote.campaign.code}
                          {quote.bonus > 0
                            ? ` · ${n(quote.bonus)} créditos de regalo`
                            : ""}
                        </p>
                      )}
                      <p>
                        Pago único TEST. Los créditos se asignan al confirmar el
                        pago.
                      </p>
                      <button
                        className="admin-button"
                        disabled={busy}
                        onClick={() => void run("credit_checkout")}
                      >
                        {busy ? "Procesando…" : "Comprar en Stripe TEST"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="admin-card billing-section">
            <h2>Recargas</h2>
            {!data.purchases.length
              ? <p className="admin-note">Aún no tienes recargas.</p>
              : (
                <div className="billing-table-wrap">
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Recarga</th>
                        <th>Importe</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchases.map((p) => (
                        <tr key={p.id}>
                          <td>{dateLabel(p.created_at)}</td>
                          <td>
                            {p.package_name}
                            <br />
                            {n(p.credits_purchased + p.bonus_credits)}{" "}
                            créditos{p.reversed_credits > 0 && (
                              <small className="block">
                                {n(p.reversed_credits)} revertidos
                              </small>
                            )}
                          </td>
                          <td>
                            {money(
                              p.amount_paid ?? p.expected_amount,
                              p.currency,
                            )}
                            {p.refunded_amount > 0 && (
                              <small className="block">
                                {money(p.refunded_amount, p.currency)}{" "}
                                reembolsados
                              </small>
                            )}
                          </td>
                          <td>{purchaseState(p.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
          <section className="admin-card billing-section">
            <h2>Otros movimientos</h2>
            {data.history.filter((h) => !h.credit_purchase_id).length === 0
              ? <p className="admin-note">Sin otros movimientos.</p>
              : (
                <ul className="credits-history">
                  {data.history.filter((h) => !h.credit_purchase_id).map(
                    (h) => (
                      <li key={h.id}>
                        <span>
                          {h.type === "PLAN_ALLOCATION"
                            ? "Asignación del plan"
                            : h.type === "ADMIN_ADJUSTMENT"
                            ? "Ajuste administrativo"
                            : h.type === "PURCHASE"
                            ? "Créditos adicionales o cortesía"
                            : "Ajuste de saldo"}
                          <small>{dateLabel(h.created_at)}</small>
                        </span>
                        <strong>
                          {h.included_delta + h.purchased_delta > 0 ? "+" : ""}
                          {n(h.included_delta + h.purchased_delta)}
                        </strong>
                      </li>
                    ),
                  )}
                </ul>
              )}
          </section>
        </>
      )}
    </div>
  );
}
