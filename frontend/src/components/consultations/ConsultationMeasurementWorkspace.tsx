import { useEffect, useState } from "react";
import { LoadingState } from "@/src/components/ui/Status";
import { defaultPrenatalOptionalFields, type PrenatalOptionalField } from "@/src/features/consultations/prenatalMeasurements";
import { hasSavedPrenatalMeasurements } from "@/src/services/prenatalMeasurements";
import type { Consultation, Patient } from "@/src/types/domain";
import { ConsultationMeasurements } from "./ConsultationMeasurements";
import { PrenatalMeasurements } from "./PrenatalMeasurements";

type MeasurementView = "general" | "prenatal";

type Props = {
  consultation: Consultation;
  patient: Patient;
  clinicalDate: string;
  answers: Readonly<Record<string, unknown>>;
  prenatalFields: PrenatalOptionalField[] | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onPatientChange: (patient: Patient) => void;
  beforeSave: () => Promise<boolean>;
  openInterview: () => void;
};

export function ConsultationMeasurementWorkspace({
  consultation, patient, clinicalDate, answers, prenatalFields, pending,
  onPendingChange, onPatientChange, beforeSave, openInterview,
}: Props) {
  const [selectedView, setSelectedView] = useState<MeasurementView | null>(null);
  const [savedView, setSavedView] = useState<MeasurementView | null>(null);
  const hasPrenatalDesign = prenatalFields !== null;

  useEffect(() => {
    if (hasPrenatalDesign || selectedView !== null) return;
    let active = true;
    void hasSavedPrenatalMeasurements(consultation.id)
      .then((saved) => { if (active) setSavedView(saved ? "prenatal" : "general"); })
      .catch(() => { if (active) setSavedView("general"); });
    return () => { active = false; };
  }, [consultation.id, hasPrenatalDesign, selectedView]);

  const view = selectedView ?? (hasPrenatalDesign ? "prenatal" : savedView);
  if (view === null) return <LoadingState label="Cargando mediciones…" />;

  return <>
    <div className="mb-3 flex justify-end">
      <button type="button" className="nuth-button-secondary" disabled={pending}
        onClick={() => setSelectedView(view === "prenatal" ? "general" : "prenatal")}>
        {view === "prenatal" ? "Volver a mediciones generales" : "Abrir mediciones prenatales"}
      </button>
    </div>
    {view === "prenatal" ? <PrenatalMeasurements consultation={consultation} patient={patient}
      clinicalDate={clinicalDate} answers={answers} optionalFields={prenatalFields ?? defaultPrenatalOptionalFields}
      onPendingChange={onPendingChange} beforeSave={beforeSave} openInterview={openInterview} /> :
      <ConsultationMeasurements consultation={consultation} patient={patient}
        onPatientChange={onPatientChange} onPendingChange={onPendingChange} />}
  </>;
}
