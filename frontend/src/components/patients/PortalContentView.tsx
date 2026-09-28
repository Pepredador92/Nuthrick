import { Target, ClipboardList, Activity, CalendarDays } from "lucide-react";
import type { PortalContent } from "@/src/services/patientPortal";

import { portalDate } from "@/src/features/patients/portalProgress";
import { PortalResultCard } from "./PortalResultCard";
import { PortalClinicalProgressSummary } from "./PortalProgressSummary";
export { portalDate } from "@/src/features/patients/portalProgress";

export function PortalContentView({
  content,
  section = "all",
  showMethod = true,
}: {
  content: PortalContent;
  section?: "all" | "today" | "results" | "history";
  showMethod?: boolean;
}) {
  const progressResults = content.results.filter((result) => result.conceptCode === "weight" || result.conceptCode === "bmi");
  const otherResults = content.results.filter((result) => result.conceptCode !== "weight" && result.conceptCode !== "bmi");
  return (
    <div className="space-y-5">
      {(section === "all" || section === "today") && (
        <>
          <section className="portal-card portal-goal">
            <div className="flex items-center gap-2 text-[#416955]">
              <Target size={19} />
              <h2 className="font-semibold">Mi objetivo</h2>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words text-xl leading-relaxed">
              {content.goal ||
                "Tu nutriólogo compartirá aquí el objetivo que acuerden."}
            </p>
          </section>
          <section className="portal-card">
            <div className="flex items-center gap-2">
              <ClipboardList size={19} />
              <h2 className="font-semibold">Mis indicaciones</h2>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-[#53685e]">
              {content.instructions ||
                "Todavía no hay indicaciones compartidas."}
            </p>
          </section>
        </>
      )}
      {(section === "all" || section === "results") && (
        <section className="portal-card">
          <div className="mb-5 flex items-center gap-2">
            <Activity size={19} />
            <h2 className="font-semibold">Mis resultados</h2>
            <span className="portal-count">{content.results.length}</span>
          </div>
          {!content.results.length && (
            <p className="text-[#74817d]">
              Tus resultados aparecerán cuando tu nutriólogo los comparta.
            </p>
          )}
          {content.results.length > 0 && <p className="mb-5 text-sm leading-6 text-[#61776c]">Cada consulta cuenta una parte de tu historia. Explora tus registros y comparte tus dudas con tu nutriólogo.</p>}
          {progressResults.length > 0 && <div className="mb-5"><PortalClinicalProgressSummary results={progressResults} showSource={showMethod} /></div>}
          {otherResults.length > 0 && <div className="grid gap-4 md:grid-cols-2">
            {otherResults.map((result, i) => <PortalResultCard key={`${result.id}-${i}`} result={result} showMethod={showMethod} />)}
          </div>}
        </section>
      )}
      {(section === "all" || section === "history") && (
        <section className="portal-card">
          <div className="mb-5 flex items-center gap-2">
            <CalendarDays size={19} />
            <h2 className="font-semibold">Mis consultas</h2>
          </div>
          {!content.consultations.length && (
            <p className="text-[#74817d]">Aún no hay consultas compartidas.</p>
          )}
          <ol className="space-y-5">
            {[...content.consultations]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((c) => (
                <li key={c.id} className="border-l-2 border-[#d8b77c] pl-4">
                  <p className="text-xs text-[#74817d]">{portalDate(c.date)}</p>
                  <h3 className="mt-1 font-semibold">{c.title}</h3>
                  {c.summary && (
                    <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-[#53685e]">
                      {c.summary}
                    </p>
                  )}
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}
