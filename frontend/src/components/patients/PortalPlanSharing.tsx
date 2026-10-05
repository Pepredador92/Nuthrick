import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalAction, type PortalPlan } from "@/src/services/patientPortal";
import { PortalPlanContent } from "./PortalPlan";
import { Eye, Utensils } from "lucide-react";
type Options = {
  plans: {
    id: string;
    title: string;
    version_number: number;
    published_at: string;
  }[];
  selectedPlanId: string | null;
};
export function PortalPlanSharing({ patientId, suggestedPlanId }: { patientId: string; suggestedPlanId?: string | null }) {
  const access = useMemo(() => ({ patientId }), [patientId]);
  const [options, setOptions] = useState<Options | null>(null),
    [selection, setSelection] = useState(""),
    [plan, setPlan] = useState<PortalPlan | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let active = true;
    portalAction<Options>(access, "plan_options")
      .then((v) => {
        if (active) {
          setOptions(v);
          const chosen = v.plans.some((candidate) => candidate.id === suggestedPlanId)
            ? suggestedPlanId!
            : v.selectedPlanId || "";
          setSelection(chosen);
          setLoading(Boolean(chosen));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [access, suggestedPlanId]);
  function choose(value: string) {
    setSelection(value);
    setReviewed(false);
    setPlan(null);
    setNotice("");
    setError("");
    setLoading(Boolean(value));
  }
  useEffect(() => {
    let active = true;
    if (!selection) return;
    portalAction<{ plan: PortalPlan }>(access, "plan_preview", {
      planId: selection,
    })
      .then((v) => {
        if (active) {
          setPlan(v.plan);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [access, selection]);
  async function share() {
    setBusy(true);
    setError("");
    try {
      await portalAction(access, "share_plan", { planId: selection || null });
      setOptions((v) => (v ? { ...v, selectedPlanId: selection || null } : v));
      setNotice(
        selection
          ? "Plan compartido. El paciente verá su última versión publicada."
          : "Plan retirado del superlink. Se conserva en el Taller.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="portal-plan-sharing"
      className="portal-card owner-plan-card"
      aria-label="Compartir plan del Taller"
    >
      <div className="owner-card-heading"><span className="owner-card-icon"><Utensils size={21}/></span><div><p>Plan alimenticio</p><h2 className="font-semibold">Plan del Taller de dietas</h2><small>Selecciona → revisa el contenido → comparte el plan.</small></div></div>
      <p className="mt-2 text-sm text-[#63796d]">
        Elige un plan publicado de este paciente. Sus próximas publicaciones se
        actualizarán aquí; los cambios en borrador nunca se muestran.
      </p>
      {options && (
        <>
          <p className="owner-plan-state mt-3 text-xs">{selection ? options.selectedPlanId === selection ? "Este plan ya está visible para el paciente." : "Esta selección aún no se ha compartido." : options.selectedPlanId ? "El plan se retirará cuando confirmes la acción." : "No hay un plan compartido en este espacio."}</p>
          <label
            htmlFor="portal-plan-selection"
            className="mt-4 block text-sm font-semibold"
          >
            Plan visible en Mi plan
          </label>
          <select
            id="portal-plan-selection"
            className="nuth-input mt-2"
            disabled={busy}
            value={selection}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">No compartir un plan</option>
            {options.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · v{p.version_number}
              </option>
            ))}
          </select>
          {!options.plans.length && (
            <p className="mt-3 text-sm">
              No hay planes publicados disponibles.{" "}
              <Link className="underline" to="/app/diet-workshop">
                Abrir Taller de dietas
              </Link>
            </p>
          )}
          {selection &&
            (loading ? (
              <p role="status" className="mt-3">
                Preparando vista del paciente…
              </p>
            ) : (
              plan && (
                <details key={selection} className="owner-details mt-4" open={selection === suggestedPlanId}>
                  <summary><Eye size={16}/>Revisar el contenido de {plan.title}</summary>
                  <div className="mt-4">
                  <PortalPlanContent plan={plan} />
                  </div>
                </details>
              )
            ))}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy || loading}
            />{" "}
            {selection
              ? "Revisé este plan y quiero compartirlo con el paciente."
              : "Quiero que no se muestre ningún plan en el superlink."}
          </label>
          <button
            className="nuth-button mt-3"
            disabled={
              busy ||
              loading ||
              !reviewed ||
              Boolean(selection && !plan)
            }
            onClick={() => void share()}
          >
            {busy
              ? "Guardando…"
              : selection
                ? "Compartir plan"
                : "Retirar plan del superlink"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
