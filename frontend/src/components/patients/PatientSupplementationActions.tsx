import { useEffect, useState } from "react";
import { FileDown, History, Leaf, Pencil } from "lucide-react";
import { SupplementPlanDialog } from "@/src/components/diet/SupplementPlanDialog";
import { PdfExportDialog } from "@/src/components/documents/PdfExportDialog";
import { consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import { listPatientSupplementation, savePatientSupplementation, type PatientSupplementation } from "@/src/services/patientSupplementation";
import type { Consultation, Patient } from "@/src/types/domain";

export function PatientSupplementationActions({ patient, consultations }: {
  patient: Pick<Patient, "id" | "full_name" | "professional_id">;
  consultations: Consultation[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [records, setRecords] = useState<PatientSupplementation[]>();
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ id: string; record?: PatientSupplementation }>();
  const [exportRecord, setExportRecord] = useState<PatientSupplementation>();
  const options = consultations.map(consultation => ({
    id: consultation.id,
    label: `${consultationLabel(consultation)} · ${formatPatientDate(consultation.consultation_date)}`,
  }));

  useEffect(() => {
    if (!historyOpen) return;
    let active = true;
    listPatientSupplementation(patient.id).then(
      rows => { if (active) { setRecords(rows); setLoadError(""); } },
      error => { if (active) setLoadError(error.message); },
    );
    return () => { active = false; };
  }, [patient.id, historyOpen, attempt]);

  return <div className="grid gap-2">
    <button type="button" className="nuth-button-secondary w-full justify-center" onClick={() => setEditor({ id: crypto.randomUUID() })}>
      <Leaf size={16} aria-hidden="true"/> Nueva suplementación
    </button>
    <button type="button" className="nuth-button-secondary w-full justify-center" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
      <History size={15} aria-hidden="true"/> Historial de suplementación
    </button>
    {historyOpen && <div className="space-y-2" aria-label="Registros de suplementación">
      {loadError && <p role="alert" className="text-sm">{loadError} <button type="button" className="underline" onClick={() => {
        setLoadError(""); setAttempt(attempt + 1);
      }}>Reintentar</button></p>}
      {!records && !loadError && <p role="status" className="text-sm">Cargando suplementación…</p>}
      {records?.length === 0 && <p className="text-sm text-[var(--nuth-muted)]">Aún no hay suplementaciones guardadas.</p>}
      {records?.map(record => <article key={record.id} className="space-y-2 rounded-xl border border-[var(--nuth-line)] p-3">
        <p className="text-xs text-[var(--nuth-muted)]">{formatPatientDate(record.updated_at)}
          {options.find(option => option.id === record.consultation_id) && ` · ${options.find(option => option.id === record.consultation_id)!.label}`}</p>
        <p className="break-words text-sm font-semibold">{record.items.map(item => item.product.name).join(" · ")}</p>
        {!!record.tags.length && <p className="break-words text-xs text-[var(--nuth-muted)]">{record.tags.join(" · ")}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold underline" onClick={() => setEditor({ id: record.id, record })}>
            <Pencil size={14} aria-hidden="true"/> Editar
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold underline" onClick={() => setExportRecord(record)}>
            <FileDown size={14} aria-hidden="true"/> Exportar indicaciones
          </button>
        </div>
      </article>)}
    </div>}
    {editor && <SupplementPlanDialog key={editor.id} items={editor.record?.items ?? []} initialTags={editor.record?.tags}
      appearance="default" standalone={{ consultationId: editor.record?.consultation_id ?? null, consultations: options }}
      onClose={() => setEditor(undefined)} onSave={async (items, tags, consultationId) => {
        const saved = await savePatientSupplementation(patient.id, editor.id, items, tags, consultationId, editor.record?.updated_at);
        setRecords(previous => [saved, ...(previous ?? []).filter(record => record.id !== saved.id)].sort((a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)));
        setAttempt(current => current + 1);
        setHistoryOpen(true);
        setEditor(undefined);
      }}/>}
    {exportRecord && <PdfExportDialog title="Exportar suplementación"
      description="Descarga las indicaciones guardadas para el paciente."
      onClose={() => setExportRecord(undefined)}
      onDownload={async design => {
        const { downloadSupplementationPdf } = await import("@/src/features/supplements/exportSupplementation");
        await downloadSupplementationPdf(patient, exportRecord, design, options.find(option => option.id === exportRecord.consultation_id)?.label);
      }}/>}
  </div>;
}
