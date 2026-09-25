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
      <p className="billing-test">
        Entorno de prueba · Usa únicamente datos de tarjeta de prueba de Stripe.
      </p>
      <p className="my-4 text-2xl font-semibold">
        {money(
          checkoutAmount(normal, preview?.campaign?.benefits),
          plan.currency,
        )} MXN / {interval === "monthly" ? "mes" : "año"}
      </p>
      {user && (
        <>
          <div className="billing-inline">
            <label className="admin-field">
              Código promocional (opcional)<input
                value={code}
                maxLength={40}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setPreview(null);
                }}
                autoComplete="off"
              />
            </label>
            <button
              className="admin-button secondary"
              disabled={busy || !code}
              onClick={check}
            >
              Validar código
            </button>
          </div>
          {preview?.campaign && (
            <div className="billing-benefits">
              <strong>{preview.campaign.name}</strong>
              <ul>
                {preview.campaign.benefits.map((b, i) => (
                  <li key={i}>{benefitLabel(b)} · {durationLabel(b)}</li>
                ))}
              </ul>
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
      {user && billing && (!billing.enabled || !billing.test_eligible) && (
        <p className="admin-note">
          Esta cuenta aún no está autorizada para contratar en el entorno de
          prueba.
        </p>
      )}
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
              Boolean(user && (!billing?.enabled || !billing?.test_eligible)) ||
              Boolean(code && !preview?.campaign)}
            onClick={checkout}
          >
            {busy
              ? "Preparando…"
              : user
              ? "Continuar a Stripe Test"
              : "Iniciar sesión y continuar"}
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
        La suscripción se confirma al recibir el resultado verificado del pago.
        Los créditos incluidos se asignan por mes, también en modalidad anual.
      </p>
    </section>
  );
}
