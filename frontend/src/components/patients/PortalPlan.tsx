import { useEffect, useState } from "react";
import {
  portalAction,
  type PortalAccess,
  type PortalPlan,
} from "@/src/services/patientPortal";
import { formatFoodQuantity } from "@/src/features/menu/units";
import { portalDate } from "./PortalContentView";

export function PortalPlanContent({ plan }: { plan: PortalPlan | null }) {
  if (!plan)
    return (
      <section className="portal-card">
        <h2 className="font-semibold">Mi plan alimenticio</h2>
        <p className="mt-3 text-sm text-[#63796d]">
          Tu nutriólogo aún no ha compartido un plan publicado en este espacio.
        </p>
      </section>
    );
  return (
    <section
      className="portal-card min-w-0"
      aria-label="Plan alimenticio publicado"
    >
      <p className="nuth-eyebrow">Mi plan alimenticio</p>
      <h2 className="mt-2 text-xl font-semibold break-words">{plan.title}</h2>
      <p className="mt-2 text-xs text-[#63796d]">
        Versión {plan.versionNumber} · Publicado el{" "}
        {portalDate(plan.publishedAt)}
      </p>
      <div className="mt-6 space-y-7">
        {plan.days.map((day) => (
          <section key={day.name} className="border-t border-[#e0e7de] pt-4">
            <h3 className="font-semibold">{day.name}</h3>
            <div className="mt-4 space-y-6">
              {day.meals.map((meal, index) => (
                <article
                  key={index}
                  className="border-l-2 border-[#a5beae] pl-3 break-words"
                >
                  <p className="text-sm font-semibold">
                    {meal.name}
                    {meal.time && (
                      <span className="ml-2 font-normal text-[#63796d]">
                        {meal.time}
                      </span>
                    )}
                  </p>
                  <h4 className="mt-2 text-sm font-medium">{meal.title}</h4>
                  <ul
                    className="mt-2 list-disc pl-4 space-y-1 text-sm text-[#52685d]"
                    aria-label={`Ingredientes de ${meal.name}`}
                  >
                    {meal.ingredients.map((item, i) => (
                      <li key={i}>
                        {formatFoodQuantity(item.amount)} {item.unit} ·{" "}
                        {item.name}
                      </li>
                    ))}
                  </ul>
                  {meal.instructions.length > 0 && (
                    <div
                      className="mt-3 space-y-2 text-sm text-[#52685d]"
                      aria-label="Preparación"
                    >
                      <p className="font-semibold">Preparación</p>
                      {meal.instructions.map((line, i) => (
                        <p className="whitespace-pre-line" key={i}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                  {meal.ingredients.some((i) => i.alternatives.length > 0) && (
                    <div
                      className="mt-3 text-xs leading-5 text-[#52685d]"
                      aria-label="Sustituciones"
                    >
                      <p className="font-semibold">
                        Puedes sustituir · Elige una alternativa, no la agregues
                        a la porción.
                      </p>
                      {meal.ingredients
                        .filter((i) => i.alternatives.length > 0)
                        .map((item, i) => (
                          <p key={i}>
                            <strong>{item.name}:</strong>{" "}
                            {item.alternatives
                              .map(
                                (alt) =>
                                  `${formatFoodQuantity(alt.amount)} ${alt.unit} de ${alt.name}`,
                              )
                              .join(" o ")}
                            .
                          </p>
                        ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
export function PortalPatientPlan({ access }: { access: PortalAccess }) {
  const [plan, setPlan] = useState<PortalPlan | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      pending = false;
    const load = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const result = await portalAction<{ plan: PortalPlan | null }>(
          access,
          "plan",
        );
        if (active) {
          setPlan(result.plan);
          setError("");
        }
      } catch (e) {
        if (active) {
          setPlan(null);
          setError((e as Error).message);
        }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [access]);
  if (loading) return <p role="status">Cargando tu plan…</p>;
  if (error) return <p role="alert">{error}</p>;
  return <PortalPlanContent plan={plan} />;
}
