import { useEffect, useState } from "react";
import { loadPatientAgreements } from "@/src/services/consultations";
import { appendComposedText } from "@/src/features/consultations/composeClinicalText";
import { PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH } from "../../../../supabase/functions/_shared/patient-instructions";
import { portalDate } from "./PortalContentView";

type SavedInstructions = {
  patientId: string;
  consultationId: string;
  text: string;
  error?: string;
};

export function PortalConsultationInstructions({
  patientId, consultations, currentText, onApply, disabled,
}: {
  patientId: string;
  consultations: { id: string; consultation_date: string }[];
  currentText: string;
  onApply: (text: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState<SavedInstructions | null>(null);
  const [retry, setRetry] = useState(0);
  const consultationId = consultations.find((item) => item.id === selected)?.id ?? consultations[0]?.id;

  useEffect(() => {
    if (!consultationId) return;
    let active = true;
    void loadPatientAgreements(patientId, consultationId)
      .then(({ text }) => {
        if (active) setSaved({ patientId, consultationId, text });
      })
      .catch(() => {
        if (active) setSaved({ patientId, consultationId, text: "", error: "No pudimos cargar las indicaciones de esta consulta." });
      });
    return () => { active = false; };
  }, [consultationId, patientId, retry]);

  const current = saved?.patientId === patientId && saved.consultationId === consultationId ? saved : null;
  const combined = appendComposedText(currentText, current?.text ?? "");
  const alreadyAdded = Boolean(current?.text.trim()) && combined === currentText.trim();
  const tooLong = combined.length > PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH;

  return (
    <section aria-label="Indicaciones de la consulta" className="mt-4 rounded-xl border border-[#dfe7e1] bg-[#f8faf7] p-4">
      <h3 className="text-sm font-semibold">Indicaciones de la consulta</h3>
      <p className="mt-1 text-xs leading-5 text-[#52675f]">
        Elige una consulta finalizada para agregar las indicaciones que ya guardaste. Puedes revisarlas y editarlas antes de publicar.
      </p>
      {!consultations.length ? (
        <p className="mt-3 text-sm text-[#52675f]">Las indicaciones estarán disponibles cuando finalices una consulta.</p>
      ) : (
        <>
          <label className="mt-3 block text-xs font-semibold text-[#52675f]">
            Consulta de origen de las indicaciones
            <select className="nuth-input mt-2" value={consultationId} disabled={disabled}
              onChange={(event) => { setSaved(null); setSelected(event.target.value); }}>
              {consultations.map((consultation) => (
                <option key={consultation.id} value={consultation.id}>
                  Consulta del {portalDate(consultation.consultation_date)}
                </option>
              ))}
            </select>
          </label>
          {!current ? <p role="status" className="mt-3 text-sm">Cargando indicaciones guardadas…</p>
            : current.error ? (
              <div role="alert" className="mt-3 text-sm">
                <p>{current.error}</p>
                <button type="button" className="mt-2 underline" disabled={disabled}
                  onClick={() => { setSaved(null); setRetry((value) => value + 1); }}>Reintentar</button>
              </div>
            ) : !current.text.trim() ? (
              <p className="mt-3 text-sm text-[#52675f]">Esta consulta no tiene indicaciones guardadas. Puedes agregarlas en la consulta o escribirlas en el campo de arriba.</p>
            ) : (
              <>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#40574f]">{current.text}</p>
                {tooLong && <p role="alert" className="mt-3 text-sm text-amber-900">El texto completo supera el límite de 12,000 caracteres del Superlink. Revisa qué indicaciones deseas compartir antes de agregarlas.</p>}
                <button type="button" className="nuth-button-secondary mt-3" disabled={disabled || alreadyAdded || tooLong}
                  onClick={() => onApply(current.text)}>
                  {alreadyAdded ? "Ya agregadas al borrador" : "Agregar al borrador del Superlink"}
                </button>
                <p className="mt-2 text-xs text-[#74817d]">El paciente las verá cuando publiques el contenido del Superlink.</p>
              </>
            )}
        </>
      )}
    </section>
  );
}
