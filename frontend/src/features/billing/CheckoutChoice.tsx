import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import type { Plan } from "../admin/api";
import {
  benefitLabel,
  billingAction,
  checkoutAmount,
  durationLabel,
  getMyBilling,
  goHosted,
  type Interval,
  money,
  type MyBilling,
  type Preview,
} from "./api";
import { clearPlanReturn, rememberPlan } from "./returnToPlan";
import { LegalAcceptanceGate } from "../legal/LegalAcceptanceGate";
export function CheckoutChoice(
  { plan, interval, close }: {
    plan: Plan;
    interval: Interval;
    close: () => void;
  },
) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [billing, setBilling] = useState<MyBilling | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trialConsent, setTrialConsent] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const trial = Boolean(billing?.welcome_trial?.eligible && !preview?.campaign);
  const trialDays = billing?.welcome_trial?.days ?? 30;
  const expectedChargeDate = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(openedAt + trialDays * 86400000));
  const operation = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    void getMyBilling().then((data) => {
      if (mounted) setBilling(data);
    }).catch((e) => {
      if (mounted) setError(e.message);
    });
    return () => {
      mounted = false;
    };
  }, [user]);
  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos continuar.");
    } finally {
      setBusy(false);
    }
  };
  const normal = Math.round(
    (interval === "monthly"
      ? plan.monthly_price ?? 0
      : plan.annual_price ?? 0) * 100,
  );
  const check = () =>
    run(async () =>
      setPreview(
        await billingAction<Preview>("preview", {
          plan_id: plan.id,
          interval,
          code,
        }),
      )
    );
  const checkout = () =>
    run(async () => {
      if (!user) {
        rememberPlan(plan.id!, interval);
        navigate("/login");
        return;
      }
      const result = await billingAction<{ url: string }>("checkout", {
        plan_id: plan.id,
        interval,
        code,
        operation_key: operation.current,
        welcome_trial_consent: trial && trialConsent,
      });
      clearPlanReturn();
      goHosted(result.url, "checkout");
    });
  return (
    <section
      className="admin-card billing-choice"
      aria-label="Confirmar selección"
    >
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">TU SELECCIÓN</p>
          <h2>{plan.name} · {interval === "monthly" ? "Mensual" : "Anual"}</h2>
        </div>
        <button
          type="button"
          className="admin-button secondary"
          onClick={close}
        >
          Cerrar
        </button>
      </div>
      {billing?.mode === 'test' && <p className="billing-test">
        Entorno de prueba · Usa únicamente datos de tarjeta de prueba de Stripe.
      </p>}
      {billing?.mode === 'live' && !trial && <p className="admin-note">
        Cobro real · La suscripción se renueva automáticamente cada {interval === 'monthly' ? 'mes' : 'año'} hasta que la canceles.
      </p>}
      <p className="my-4 text-2xl font-semibold">
        {money(
          checkoutAmount(normal, preview?.campaign?.benefits),
          plan.currency,
        )} MXN / {interval === "monthly" ? "mes" : "año"}
      </p>
      {trial && <div className="billing-benefits" aria-label="Prueba gratis con tarjeta">
        <strong>{trialDays} días gratis · Hoy $0 MXN</strong>
        <p>Registra tu tarjeta en Stripe. Después se cobrarán {money(normal, plan.currency)} MXN cada {interval === 'monthly' ? 'mes' : 'año'}, hasta que canceles.</p>
        <p>Primer cobro previsto: {expectedChargeDate}, si comienzas hoy. Stripe mostrará la fecha exacta antes de confirmar.</p>
        <p>Puedes cancelar desde Mi plan antes del primer cobro. Incluye las funciones y los límites de {plan.name}; los créditos de IA incluidos se asignan una sola vez durante la prueba.</p>
        <label className="billing-trial-consent"><input type="checkbox" checked={trialConsent} disabled={busy} onChange={e => setTrialConsent(e.target.checked)} />
          Acepto que, al terminar los {trialDays} días gratis, se cobre automáticamente {money(normal, plan.currency)} MXN cada {interval === 'monthly' ? 'mes' : 'año'} si no cancelo antes.
        </label>
      </div>}
      {user && (
        <>
          <div className="billing-inline">
            <label className="admin-field">
              Código promocional (opcional)<input
                value={code}
                disabled={busy}
                maxLength={40}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setPreview(null);
                  setTrialConsent(false);
                }}
                autoComplete="off"
              />
            </label>
            <button
              className="admin-button secondary"
              disabled={busy || !code}
              onClick={check}
            >
              Aplicar código
            </button>
          </div>
          {billing?.welcome_trial?.eligible && <p className="admin-note">La prueba de bienvenida no se acumula con códigos promocionales. Al aplicar un código se usarán sus condiciones y el total mostrado.</p>}
          {preview?.campaign && (
            <div className="billing-benefits">
              <strong>{preview.campaign.name}</strong>
              <ul>
                {preview.campaign.benefits.map((b, i) => (
                  <li key={i}>{benefitLabel(b)} · {durationLabel(b)}</li>
                ))}
              </ul>
              <p>Precio normal: {money(normal, plan.currency)} · Descuento: {money(normal - checkoutAmount(normal, preview.campaign.benefits), plan.currency)} · Total: {money(checkoutAmount(normal, preview.campaign.benefits), plan.currency)}</p>
              <p>
                Al terminar el beneficio de precio, se cobra el precio normal
                contratado: {money(normal, plan.currency)} /{" "}
                {interval === "monthly" ? "mes" : "año"}.
              </p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="admin-error">{error}</p>}
      {user && billing && (!billing.enabled || !(billing.checkout_eligible ?? billing.test_eligible)) && (
        <p className="admin-note">
          Esta cuenta aún no está autorizada para contratar en este entorno.
        </p>
      )}
      {user ? (
        <LegalAcceptanceGate source="checkout">
          {billing?.subscription && billing.subscription.state !== "cancelled"
            ? (
              <Link className="admin-button" to="/app/my-plan">
                Ver y cambiar mi suscripción
              </Link>
            )
            : (
              <button
                className="admin-button"
                disabled={busy ||
                  Boolean(!billing?.enabled || !(billing?.checkout_eligible ?? billing?.test_eligible)) ||
                  (trial && !trialConsent) ||
                  Boolean(code && !preview?.campaign)}
                onClick={checkout}
              >
                {busy
                  ? "Preparando…"
                  : (billing?.mode === "live" ? (trial ? "Continuar con 30 días gratis" : "Continuar al pago") : "Continuar a Stripe Test")}
              </button>
            )}
        </LegalAcceptanceGate>
      ) : (
        <button className="admin-button" onClick={checkout} disabled={busy}>
          Iniciar sesión y continuar
        </button>
      )}
      {user && (
        <button
          className="admin-button secondary ml-2"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await billingAction("expire_checkout", {
                operation_key: crypto.randomUUID(),
              });
              operation.current = crypto.randomUUID();
              setError("Sesión pendiente liberada. Ya puedes continuar.");
            })}
        >
          Cancelar checkout pendiente
        </button>
      )}
      <p className="admin-note mt-4">
        La suscripción se activa al recibir la confirmación verificada de Stripe.
        Los créditos incluidos se asignan por mes, también en modalidad anual.
      </p>
      <p className="admin-note mt-2">
        Consulta <Link to="/terms">Términos</Link>, <Link to="/privacy">Privacidad</Link> y <Link to="/refunds">Reembolsos</Link>. {billing?.mode === "live" ? "Esta suscripción tiene cobro real." : billing?.mode === 'test' ? "En TEST no se activa ningún cobro real." : "El importe se confirmará antes de pagar."}
      </p>
    </section>
  );
}
