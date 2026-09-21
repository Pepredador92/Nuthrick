import { Target, ClipboardList, Activity, CalendarDays } from "lucide-react";
import type { PortalContent } from "@/src/services/patientPortal";

export function portalDate(value: string) {
  return new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function PortalContentView({
  content,
  section = "all",
}: {
  content: PortalContent;
  section?: "all" | "today" | "results" | "history";
}) {
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
          <div className="grid gap-4 sm:grid-cols-2">
            {content.results.map((result, i) => {
              const points = [...result.points].sort((a, b) =>
                a.date.localeCompare(b.date),
              );
              const latest = points.at(-1);
              return (
                <article
                  key={`${result.id}-${i}`}
                  className="min-w-0 rounded-2xl border border-[#dde6df] p-4"
                >
                  <h3 className="font-semibold">{result.label}</h3>
                  <p className="mt-2 text-3xl font-semibold text-[#285d4d]">
                    {latest?.value || "—"}{" "}
                    <span className="text-sm font-normal">{result.unit}</span>
                  </p>
                  {latest && (
                    <p className="mt-1 text-xs text-[#74817d]">
                      {portalDate(latest.date)}
                    </p>
                  )}
                  {result.method && (
                    <p className="mt-2 break-words text-xs text-[#74817d]">
                      Método: {result.method}
                    </p>
                  )}
                  {points.length > 1 && (
                    <div className="mt-4 max-h-60 overflow-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">
                          Evolución de {result.label}
                        </caption>
                        <thead>
                          <tr className="text-left text-xs text-[#74817d]">
                            <th className="pb-2">Consulta</th>
                            <th className="pb-2 text-right">Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((p, j) => (
                            <tr
                              key={`${p.consultationId}-${j}`}
                              className="border-t border-[#edf1ed]"
                            >
                              <td className="py-2">{portalDate(p.date)}</td>
                              <td className="py-2 text-right">
                                {p.value} {result.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
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
