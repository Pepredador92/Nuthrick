import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { useAccess } from "@/src/features/admin/AccessProvider";
import { type Plan } from "@/src/features/admin/api";
import { type Interval, money } from "@/src/features/billing/api";
import {
  rememberPlan,
  clearPlanReturn,
} from "@/src/features/billing/returnToPlan";
import { LegalAcceptanceGate } from "@/src/features/legal/LegalAcceptanceGate";
import { simulatorRequest } from "./api";

export function SimulationCheckout({
  plan,
  interval,
  close,
  embedded=false,
  onBusyChange,
}: {
  plan: Plan;
  interval: Interval;
  close: () => void;
  embedded?: boolean;
  onBusyChange?: (busy:boolean)=>void;
}) {
  const { user } = useAuth(),
    { refresh } = useAccess(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const amount =
    (interval === "monthly" ? plan.monthly_price : plan.annual_price) ?? 0;
  async function checkout() {
    if (!user) {
      rememberPlan(plan.id!, interval);
      navigate("/register");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await simulatorRequest("checkout", { plan_id: plan.id, interval });
      clearPlanReturn();
      await refresh();
      navigate("/app/my-plan?checkout=success");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos confirmar el plan de prueba.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  const button = (
    <button
      className="admin-button"
      disabled={busy || (Boolean(user) && !confirmed)}
      onClick={() => void checkout()}
    >
      {busy
        ? "Activando plan de prueba…"
        : user
          ? "Confirmar contratación simulada"
          : "Crear cuenta y continuar"}
    </button>
  );
  return (
    <section
      className="admin-card billing-choice"
      aria-label="Confirmar selección de prueba"
    >
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">TU SELECCIÓN · SIMULACIÓN</p>
          <h2>
            {plan.name} · {interval === "monthly" ? "Mensual" : "Anual"}
          </h2>
        </div>
        {!embedded && <button
          className="admin-button secondary"
          disabled={busy}
          onClick={close}
        >
          Cerrar
        </button>}
      </div>
      <p className="my-4 text-2xl font-semibold">
        {money(amount * 100, plan.currency)} /{" "}
        {interval === "monthly" ? "mes" : "año"}
      </p>
      <p className="billing-test">
        Contratación simulada. Se activarán las funciones y los límites de este
        plan en tu cuenta de prueba. No se solicita tarjeta ni se realiza ningún
        cobro.
      </p>
      {user && (
        <label className="my-5 flex items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            Confirmo este plan para recorrer la plataforma como usuario de
            prueba.
          </span>
        </label>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {user ? (
        <LegalAcceptanceGate source="checkout" embedded={embedded} onBusyChange={onBusyChange}>{button}</LegalAcceptanceGate>
      ) : (
        button
      )}
      <p className="admin-note mt-4">
        Puedes reiniciar el recorrido o elegir otro plan desde la barra del
        simulador.
      </p>
      <p className="admin-note">
        <Link to="/terms">Términos</Link> ·{" "}
        <Link to="/privacy">Privacidad</Link> ·{" "}
        <Link to="/refunds">Reembolsos</Link>
      </p>
    </section>
  );
}
