import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Bell, Coins, ShieldCheck, Users } from "lucide-react";
import {
  aiOperations,
  reserveEstimate,
  type AiOperations,
} from "./aiOperations";
import { creditNumber as n, purchaseState } from "../billing/credits-api";
import { ProviderCreditLink } from "./CommercialCostPreview";
import "./aiOperations.css";
const usd = (value: number | null) =>
  value === null
    ? "Sin calcular"
    : new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 2,
      }).format(value) + " USD";
const date = (value: string) =>
  new Date(value).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function AiOperationsPanel() {
  const [data, setData] = useState<AiOperations | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const { hash } = useLocation();
  const hasData = Boolean(data);
  useEffect(() => {
    if (hasData && hash === "#avisos")
      document.getElementById("avisos")?.scrollIntoView({ block: "start" });
  }, [hasData, hash]);
  const load = useCallback(async () => {
    const result = await aiOperations();
    setData(result);
    setError("");
  }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void aiOperations()
        .then((result) => {
          if (live) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const payload: Record<string, number> = {};
    for (const key of [
      "coverage_days",
      "buffer_percent",
      "extra_credits",
      "balance_usd",
    ]) {
      const value = fields.get(key);
      if (value !== null && String(value).trim() !== "")
        payload[key] = Number(value);
    }
    setBusy(true);
    setSaved("");
    setError("");
    try {
      await aiOperations("save_settings", payload);
      await load();
      setSaved("Reserva actualizada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <section className="admin-card" aria-live="polite">
        {error ? (
          <>
            <p className="admin-error">{error}</p>
            <button
              className="admin-button"
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              Reintentar
            </button>
          </>
        ) : (
          <p>Cargando consumo y reserva de IA…</p>
        )}
      </section>
    );
  const estimate = reserveEstimate(data);
  const needsReview =
    estimate.stale || estimate.recommended === null || data.unsettled_total > 0;
  const state =
    estimate.balance === null
      ? "Registra el saldo de OpenAI"
      : estimate.gap !== null && estimate.gap > 0
        ? "Conviene recargar la reserva"
        : needsReview
          ? "Revisa la estimación de reserva"
          : "Reserva estimada cubierta";
  const maxChart = Math.max(
    1,
    ...data.daily.flatMap((day) => [day.credits, day.purchases]),
  );
  const maxUsers = Math.max(1, ...data.plans.map((plan) => plan.users));
  return (
    <div className="ai-operations">
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
      <div className="ai-operations-heading">
        <p>Primero revisa la reserva; después, los avisos y el consumo.</p>
        <button
          className="admin-button secondary"
          disabled={busy}
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Actualizar
        </button>
      </div>
      <div className="ai-metrics">
        <article className="admin-card">
          <Users />
          <span>Nutriólogos registrados</span>
          <strong>{n(data.registered)}</strong>
          <small>{n(data.active)} con acceso activo</small>
        </article>
        <article className="admin-card">
          <Coins />
          <span>Créditos vigentes</span>
          <strong>{n(estimate.exposure)}</strong>
          <small>
            {n(data.included)} incluidos + {n(data.purchased)} adicionales
          </small>
        </article>
        <article className="admin-card">
          <Activity />
          <span>Consumo · 30 días</span>
          <strong>{n(data.usage.credits)}</strong>
          <small>{usd(data.usage.cost_usd)} de costo registrado</small>
        </article>
        <article className="admin-card">
          <Bell />
          <span>Recargas · 30 días</span>
          <strong>{n(data.sales.count)}</strong>
          <small>
            {n(data.sales.credits)} créditos netos · ${n(data.sales.mxn)} MXN
          </small>
        </article>
      </div>
      <section
        className="admin-card ai-reserve"
        aria-labelledby="ai-reserve-title"
      >
        <header>
          <ShieldCheck />
          <div>
            <p className="admin-eyebrow">01 · RESPALDA EL CONSUMO</p>
            <h2 id="ai-reserve-title">{state}</h2>
          </div>
        </header>
        <div className="ai-reserve-values">
          <div>
            <span>
              Reserva recomendada · {data.settings.coverage_days} días
            </span>
            <strong>{usd(estimate.recommended)}</strong>
          </div>
          <div>
            <span>Saldo estimado de OpenAI</span>
            <strong>{usd(estimate.balance)}</strong>
          </div>
          <div>
            <span>Recarga sugerida</span>
            <strong>{usd(estimate.gap)}</strong>
          </div>
        </div>
        <p className="admin-note">
          {data.settings.balance_at
            ? `Último saldo registrado: ${usd(data.settings.balance_usd)}, el ${date(data.settings.balance_at)}. Se resta el costo registrado desde entonces.`
            : "Consulta el saldo en OpenAI y regístralo aquí para estimar la cobertura."}{" "}
          Este saldo se concilia manualmente; puede variar por otros consumos,
          recargas o ajustes del proveedor.
        </p>
        {estimate.stale && data.settings.balance_at && (
          <p className="ai-attention">
            Han pasado más de 7 días desde la conciliación. Actualiza el saldo
            antes de decidir cuánto recargar.
          </p>
        )}
        {data.unsettled_total > 0 && (
          <p className="ai-attention">
            Hay {n(data.unsettled_total)} ejecuciones sin costo definitivo. Se
            consideran {usd(data.unsettled_total_usd)} provisionales en la
            reserva.
          </p>
        )}
        {estimate.recommended === null && (
          <p className="ai-attention">
            Falta una conversión de créditos activa para estimar el costo. No se
            interpreta como reserva cero.
          </p>
        )}
        <div className="billing-controls">
          <ProviderCreditLink />
          {estimate.days !== null && (
            <span className="admin-note">
              Al ritmo reciente: aproximadamente{" "}
              {Math.min(999, Math.floor(estimate.days))}
              {estimate.days > 999 ? "+" : ""} días de saldo. El consumo puede
              cambiar.
            </span>
          )}
        </div>
        <details className="ai-reserve-details">
          <summary>Cómo se calcula y cómo ajustar la reserva</summary>
          <p>
            Se toma el mayor costo entre cubrir los créditos vigentes, los
            créditos de planes para {data.settings.coverage_days} días más los
            adicionales, y el consumo reciente proyectado. Después se suma una
            reserva para nuevas recargas, las ejecuciones pendientes y{" "}
            {data.settings.buffer_percent}% de margen.
          </p>
          <dl className="ai-assumptions">
            <div>
              <dt>Créditos de planes activos por mes</dt>
              <dd>{n(data.monthly_credits)}</dd>
            </div>
            <div>
              <dt>Reserva para nuevas recargas</dt>
              <dd>{n(estimate.salesCredits)} créditos</dd>
            </div>
            <div>
              <dt>Costo usado por crédito</dt>
              <dd>
                {estimate.unit === null
                  ? "Sin configurar"
                  : `${estimate.unit.toFixed(6)} USD`}
              </dd>
            </div>
          </dl>
          <p className="admin-note">
            La conversión usa el mayor valor entre la configuración actual y el
            costo observado por crédito. La reserva para nuevas recargas usa el
            mayor entre el historial proyectado y el mínimo que definas. Los
            créditos adicionales se incluyen aunque la cuenta esté inactiva. Los
            pagos de prueba se excluyen de las ventas. Es una estimación de
            planeación, sujeta al consumo y a los precios del proveedor.
          </p>
          <form
            key={data.settings.updated_at}
            onSubmit={save}
            className="ai-reserve-form"
          >
            <label className="admin-field">
              Días de cobertura
              <input
                name="coverage_days"
                type="number"
                min="7"
                max="90"
                required
                defaultValue={data.settings.coverage_days}
              />
            </label>
            <label className="admin-field">
              Margen de seguridad (%)
              <input
                name="buffer_percent"
                type="number"
                min="0"
                max="200"
                required
                defaultValue={data.settings.buffer_percent}
              />
            </label>
            <label className="admin-field">
              Mínimo para nuevas recargas (créditos)
              <input
                name="extra_credits"
                type="number"
                min="0"
                max="100000000"
                step="0.001"
                required
                defaultValue={data.settings.extra_credits}
              />
            </label>
            <label className="admin-field">
              Saldo que ves ahora en OpenAI (USD)
              <input
                name="balance_usd"
                type="number"
                min="0"
                max="100000000"
                step="0.0001"
                placeholder="Déjalo vacío para conservarlo"
              />
              <small>
                Al escribir un saldo, se registra una nueva conciliación con la
                fecha actual.
              </small>
            </label>
            <button className="admin-button" disabled={busy}>
              {busy ? "Guardando…" : "Guardar reserva"}
            </button>
          </form>
        </details>
      </section>
      <section
        className="admin-card"
        id="avisos"
        aria-labelledby="ai-alert-title"
      >
        <div className="ai-section-heading">
          <div>
            <p className="admin-eyebrow">02 · REVISA LAS RECARGAS</p>
            <h2 id="ai-alert-title">
              Avisos de compras · {data.alerts.unread} sin leer
            </h2>
          </div>
          <button
            className="admin-button secondary"
            disabled={busy || !data.alerts.items.some((a) => !a.is_read)}
            onClick={async () => {
              setBusy(true);
              try {
                await aiOperations("mark_read", {
                  ids: data.alerts.items
                    .filter((a) => !a.is_read)
                    .map((a) => a.id),
                });
                await load();
                window.dispatchEvent(new Event("ai-credit-alerts-updated"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Marcar visibles como leídos
          </button>
        </div>
        {(data.assignment_issues > 0 || data.webhook_issues > 0) && (
          <p className="ai-attention" role="alert">
            Requieren revisión: {data.assignment_issues} pagos con asignación
            pendiente y {data.webhook_issues} eventos de pago con error.{" "}
            <Link className="admin-link" to="/admin/credits/purchases">
              Revisar compras
            </Link>{" "}
            ·{" "}
            <Link className="admin-link" to="/admin/operations">
              Ver operaciones
            </Link>
          </p>
        )}
        <p className="admin-note">
          {data.pending_payments}{" "}
          {data.pending_payments === 1
            ? "pago pendiente vigente"
            : "pagos pendientes vigentes"}
          . Los avisos aparecen al confirmarse una recarga o cambiar su estado.
          Se actualizan cada minuto mientras este panel está visible.
        </p>
        {!data.alerts.items.length ? (
          <p>
            Aún no hay avisos de recargas. Las compras anteriores siguen
            disponibles en el historial.
          </p>
        ) : (
          <ul className="ai-alert-list">
            {data.alerts.items.map((alert) => (
              <li key={alert.id} className={alert.is_read ? "" : "unread"}>
                <div>
                  <Link to={`/admin/professionals/${alert.professional_id}`}>
                    {alert.professional_name}
                  </Link>
                  <p>
                    {purchaseState(alert.status)} · {n(alert.credits)} créditos{" "}
                    {alert.credited
                      ? "· Asignación registrada"
                      : alert.status === "paid"
                        ? "· Falta asignar"
                        : ""}
                  </p>
                  <small>{date(alert.created_at)}</small>
                </div>
                <Link className="admin-link" to="/admin/credits/purchases">
                  Ver compras →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="ai-chart-grid">
        <section className="admin-card">
          <p className="admin-eyebrow">03 · OBSERVA EL RITMO</p>
          <h2>Consumo y recargas</h2>
          <p className="admin-note">Créditos por día · últimos 30 días</p>
          <div className="ai-chart-legend">
            <span>
              <i />
              Consumo
            </span>
            <span>
              <i />
              Recargas netas
            </span>
          </div>
          <div
            className="ai-bar-chart"
            role="img"
            aria-label="Gráfica de créditos consumidos y recargados por día. Valores completos en la tabla desplegable."
          >
            {data.daily.map((day) => (
              <div
                className="ai-bar-day"
                key={day.day}
                title={`${day.day}: ${n(day.credits)} usados, ${n(day.purchases)} recargados`}
              >
                <i style={{ height: `${(day.credits / maxChart) * 100}%` }} />
                <i style={{ height: `${(day.purchases / maxChart) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="ai-chart-axis">
            <span>{data.daily[0]?.day}</span>
            <span>Máx. {n(maxChart)} créditos</span>
            <span>{data.daily.at(-1)?.day}</span>
          </div>
          <details>
            <summary>Ver valores diarios</summary>
            <div className="billing-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Consumidos</th>
                    <th>Recargas</th>
                    <th>Costo USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{n(d.credits)}</td>
                      <td>{n(d.purchases)}</td>
                      <td>{usd(d.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="admin-card">
          <p className="admin-eyebrow">04 · ANTICIPA LA DEMANDA</p>
          <h2>Usuarios por plan activo</h2>
          <p className="admin-note">
            Incluye accesos de prueba y cortesía vigentes, con sus créditos
            efectivos.
          </p>
          <ul className="ai-plan-list">
            {data.plans.map((plan) => (
              <li key={plan.name}>
                <div>
                  <strong>{plan.name}</strong>
                  <span>{n(plan.users)} usuarios</span>
                </div>
                <div className="ai-plan-track">
                  <i style={{ width: `${(plan.users / maxUsers) * 100}%` }} />
                </div>
                <small>
                  {n(plan.monthly_credits)} créditos incluidos al mes
                </small>
              </li>
            ))}
          </ul>
          {!data.plans.length && <p>Aún no hay planes activos.</p>}
        </section>
      </div>
    </div>
  );
}
