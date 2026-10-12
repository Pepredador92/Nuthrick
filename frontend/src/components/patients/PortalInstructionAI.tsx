import { useEffect, useState } from "react";
import { ClinicalSuggestionsAI } from "@/src/components/consultations/ConsultationObjectiveAI";
import { getClinicalRevision } from "@/src/services/clinicalCopilot";
import { loadPatientAgreements } from "@/src/services/consultations";
import { portalDate } from "./PortalContentView";

const ready = async () => true;
export function PortalInstructionAI({ patientId, consultations, onApply, disabled }: {
  patientId: string;
  consultations: { id: string; consultation_date: string }[];
  onApply: (text: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [source, setSource] = useState<{ id: string; revision: number } | null>(null);
  const [agreements, setAgreements] = useState("");
  const [agreementsLoading, setAgreementsLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const consultationId = consultations.find((item) => item.id === selected)?.id ?? consultations[0]?.id;
  useEffect(() => {
    if (!open || !consultationId) return;
    let active = true;
    void Promise.all([
      getClinicalRevision(patientId, consultationId),
      loadPatientAgreements(patientId, consultationId),
    ]).then(([revision, saved]) => {
      if (active) {
        setSource({ id: consultationId, revision });
        setAgreements(saved.text);
        setError("");
      }
    }).catch(() => { if (active) setError("No pudimos cargar las indicaciones de esta consulta."); })
      .finally(() => { if (active) setAgreementsLoading(false); });
    return () => { active = false; };
  }, [open, consultationId, patientId, retry]);
  return <div className="mt-4">
    <button type="button" className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800"
      aria-expanded={open} onClick={() => { setSource(null); setAgreements(""); setError(""); setAgreementsLoading(!open); setOpen(!open); }}>
      {open ? "Cerrar apoyo para indicaciones" : "Preparar indicaciones con IA"}
    </button>
    {open && <div className="mt-3">
      <p className="text-xs leading-5 text-[#52675f]">Usa los acuerdos y el recordatorio confirmado de la consulta elegida. Revisa cada borrador; se compartirá únicamente al publicar.</p>
      {!consultations.length ? <p className="mt-2 text-sm">Cierra una consulta para usar sus datos al preparar las indicaciones del Super Link.</p> : <>
        <label className="mt-3 block text-xs">Consulta de origen
          <select className="nuth-input mt-1" value={consultationId} disabled={disabled}
            onChange={(event) => { setSource(null); setAgreements(""); setAgreementsLoading(true); setError(""); setSelected(event.target.value); }}>
            {consultations.map((consultation) => <option key={consultation.id} value={consultation.id}>Consulta del {portalDate(consultation.consultation_date)}</option>)}
          </select>
        </label>
        {error ? <p role="alert" className="mt-2 text-sm">{error} <button type="button" className="underline" onClick={() => { setAgreementsLoading(true); setError(""); setRetry((value) => value + 1); }}>Reintentar</button></p>
          : source?.id !== consultationId ? <p role="status" className="mt-2 text-xs">Cargando consulta…</p>
            : <>
              {agreementsLoading ? <p role="status" className="mt-3 text-xs">Buscando indicaciones guardadas…</p>
                : agreements ? <div className="mt-3 rounded-xl border border-[#dfe7e1] bg-[#f8faf7] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#52675f]">Indicaciones guardadas · consulta del {portalDate(consultations.find(item => item.id === consultationId)?.consultation_date || "")}</p>
                    <button type="button" className="rounded-lg border border-[#b9d2c7] bg-white px-3 py-1.5 text-xs font-semibold" disabled={disabled}
                      onClick={() => onApply(agreements)}>
                      Agregar al borrador
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-[#40574f]">{agreements}</p>
                  <p className="mt-2 text-xs text-[#74817d]">Se agregan al borrador del Super Link; puedes revisarlas antes de publicar.</p>
                </div>
                : <p className="mt-3 text-xs text-[#74817d]">Esta consulta no tiene indicaciones guardadas para copiar. Puedes escribirlas aquí o prepararlas con IA.</p>}
              <ClinicalSuggestionsAI key={`${patientId}:${source.id}:${source.revision}`} kind="instructions"
                patientId={patientId} consultationId={source.id} revision={source.revision} before={ready} onApply={onApply} disabled={disabled} />
            </>}
      </>}
    </div>}
  </div>;
}
