import { EvolutionExportDialog } from "@/src/components/patients/EvolutionExportDialog";
import { emptyProgressReferences } from "@/src/features/evolution/progressReferences";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConsultationMeasurements } from "@/src/components/consultations/ConsultationMeasurements";
import { PatientEvolutionCharts } from "@/src/components/patients/EvolutionCharts";
import { ConsultationCloseDialog } from "@/src/components/consultations/ConsultationCloseDialog";
import { consultation, patient } from "./patient-adjustments-fixtures";
import "../../app/globals.css";
function App() {
 const [exportOpen, setExportOpen] = useState(false);
 const [references, setReferences] = useState(emptyProgressReferences);
 const [tab, setTab] = useState("measurements"); const [open, setOpen] = useState(false); const [pending, setPending] = useState(false); const [reviewed, setReviewed] = useState(false);
 return <main className="mx-auto max-w-6xl p-4 sm:p-8"><header className="mb-5 rounded-3xl bg-[#173d36] p-5 text-white"><p className="text-xs text-white/70">Demostración · datos ficticios</p><h1 className="mt-2 text-2xl font-semibold">Paciente de demostración</h1><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-white/10 px-3 py-2" onClick={() => setTab("measurements")}>Mediciones</button><button className="rounded-lg bg-white/10 px-3 py-2" onClick={() => setTab("charts")}>Gráficas</button><button className="rounded-lg bg-white/10 px-3 py-2" onClick={() => setOpen(true)}>Revisar cierre</button></div></header><div hidden={tab !== "measurements"}><ConsultationMeasurements consultation={consultation as never} patient={patient as never} onPendingChange={setPending}/></div>{tab === "charts" && <PatientEvolutionCharts references={references} onReferencesChange={setReferences} patientId={patient.id} onOpenEvolution={() => setExportOpen(true)}/>}{exportOpen && <EvolutionExportDialog patient={patient as never} references={references} onReferencesChange={setReferences} onClose={() => setExportOpen(false)} getProfessionalInfo={async () => ({ fullName: "Profesional de demostración", contactLines: ["Datos ficticios para revisión visual"] })}/>} {open && <ConsultationCloseDialog busy={false} reviewed={reviewed} pending={pending ? ["Mediciones"] : []} error="" onReview={setReviewed} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)}>Entrevista de demostración.</ConsultationCloseDialog>}</main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
