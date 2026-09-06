import { useEffect, useMemo, useState } from "react";
import { Check, FileDown, FileText, LoaderCircle, X } from "lucide-react";
import { EvolutionChartCard, graphableSeries } from "@/src/components/patients/EvolutionCharts";
import {
  downloadEvolutionPdf,
  downloadEvolutionText,
  evolutionTextExport,
} from "@/src/features/evolution/exportEvolution";
import type { ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import type { LongitudinalCategory, LongitudinalHistory } from "@/src/features/evolution/longitudinal";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";
import type { Patient } from "@/src/types/domain";

const categories: Array<{ id: LongitudinalCategory; label: string }> = [
  { id: "measurements", label: "Mediciones" },
  { id: "calculations", label: "Datos calculados" },
  { id: "bioimpedance", label: "Bioimpedancia" },
  { id: "laboratories", label: "Laboratorios" },
];

function filenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "paciente";
}

export function EvolutionExportDialog({
  patient,
  onClose,
  getProfessionalInfo,
}: {
  patient: Patient;
  onClose: () => void;
  getProfessionalInfo: () => Promise<ProfessionalDocumentInfo>;
}) {
  const [history, setHistory] = useState<LongitudinalHistory | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"txt" | "pdf" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const next = await loadLongitudinalHistory(patient.id);
        if (!active) return;
        setHistory(next);
        setSelected(graphableSeries(next).map((series) => series.id));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No pudimos preparar la exportación.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [patient.id]);

  const selectable = useMemo(() => history ? graphableSeries(history) : [], [history]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedSeries = selectable.filter((series) => selectedSet.has(series.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleCategory = (category: LongitudinalCategory) => {
    const ids = selectable.filter((series) => series.category === category).map((series) => series.id);
    const everySelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
    setSelected((current) => everySelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };
  const exportDocument = async (kind: "txt" | "pdf") => {
    if (!history || !selectedSeries.length) return;
    setBusy(kind);
    setError("");
    try {
      const professional = await getProfessionalInfo();
      const selection = { seriesIds: selected };
      const name = `nuthrick-evolucion-${filenamePart(patient.full_name)}`;
      if (kind === "txt") {
        downloadEvolutionText(`${name}.txt`, evolutionTextExport(patient, history, selection, professional));
      } else {
        await downloadEvolutionPdf(`${name}.pdf`, patient, history, selection, professional);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar la exportación.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="evolution-export-title">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-[90vh] sm:max-w-7xl sm:rounded-[28px] sm:shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#e3eae4] px-5 py-4 sm:px-7">
          <div>
            <p className="nuth-eyebrow">Exportar evolución</p>
            <h2 id="evolution-export-title" className="mt-1 text-2xl font-semibold">Selecciona qué incluir</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-[#74817d] hover:bg-[#f3f7f3]" aria-label="Cerrar exportación"><X size={20} /></button>
        </header>
        {loading ? (
          <div className="grid flex-1 place-items-center"><LoaderCircle className="animate-spin text-[#3d705d]" /></div>
        ) : error && !history ? (
          <div className="p-7"><p className="rounded-xl bg-[#fff1ed] p-4 text-sm text-[#934938]">{error}</p></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
            <aside className="border-b border-[#e3eae4] bg-[#fbfcfa] p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-6">
              <p className="text-sm leading-6 text-[#74817d]">El PDF mostrará sólo gráficas. El TXT incluirá los valores de cada fecha.</p>
              <div className="mt-5 space-y-5">
                {categories.map((category) => {
                  const entries = selectable.filter((series) => series.category === category.id);
                  if (!entries.length) return null;
                  const allSelected = entries.every((series) => selectedSet.has(series.id));
                  return (
                    <section key={category.id}>
                      <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#315e4f]" onClick={() => toggleCategory(category.id)}>
                        {category.label}
                        <span className={`grid h-5 w-5 place-items-center rounded-full border ${allSelected ? "border-[#3d705d] bg-[#3d705d] text-white" : "border-[#cbd8d1] bg-white text-transparent"}`}><Check size={13} /></span>
                      </button>
                      <div className="mt-2 space-y-1.5">
                        {entries.map((series) => (
                          <label key={series.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${selectedSet.has(series.id) ? "border-[#bad3c2] bg-[#edf6ef] text-[#285647]" : "border-transparent bg-white text-[#596a63]"}`}>
                            <input type="checkbox" checked={selectedSet.has(series.id)} onChange={() => toggle(series.id)} className="mt-0.5" />
                            <span className="min-w-0"><span className="block font-medium">{series.label}</span>{series.unit && <span className="text-xs text-[#74817d]">{series.unit}</span>}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1ed] p-3 text-sm text-[#934938]">{error}</p>}
              <div className="mt-6 grid gap-2">
                <button type="button" disabled={!selectedSeries.length || busy !== null} className="nuth-button w-full justify-center" onClick={() => void exportDocument("pdf")}>
                  {busy === "pdf" ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />}
                  Exportar PDF
                </button>
                <button type="button" disabled={!selectedSeries.length || busy !== null} className="nuth-button-secondary w-full justify-center" onClick={() => void exportDocument("txt")}>
                  {busy === "txt" ? <LoaderCircle size={16} className="animate-spin" /> : <FileText size={16} />}
                  Exportar TXT
                </button>
              </div>
            </aside>
            <main className="min-w-0 bg-white p-5 sm:p-7 lg:overflow-y-auto">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="nuth-eyebrow">Vista previa del PDF</p>
                  <h3 className="mt-1 text-xl font-semibold">{patient.full_name}</h3>
                </div>
                <p className="text-sm text-[#74817d]">{selectedSeries.length} {selectedSeries.length === 1 ? "gráfica" : "gráficas"} seleccionadas</p>
              </div>
              {selectedSeries.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {selectedSeries.map((series) => <EvolutionChartCard key={series.id} series={series} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#cbd8d1] px-5 py-12 text-center text-sm text-[#74817d]">Selecciona al menos un indicador numérico para previsualizar y exportar.</div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
