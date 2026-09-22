import React from "react";
import { createRoot } from "react-dom/client";
import {
  PesCopilot,
  RecallCopilot,
} from "../../src/components/consultations/ClinicalCopilot";
import "./style.css";
function Fixture() {
  const [tab, setTab] = React.useState("pes");
  const [pes, setPes] = React.useState(
    localStorage.getItem("qa-pes-text") || "",
  );
  const props = {
    patientId: "synthetic-patient",
    consultationId: "synthetic-consultation",
    revision: 1,
    before: async () => true,
  };
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <p className="text-xs text-[#687870]">
        PRUEBA LOCAL · Sin pacientes, créditos ni llamadas reales
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Consulta de prueba</h1>
      <div className="mt-5 flex gap-3">
        <button onClick={() => setTab("pes")}>Diagnóstico PES</button>
        <button onClick={() => setTab("recall")}>
          Recordatorio de 24 horas
        </button>
      </div>
      {tab === "pes" ? (
        <>
          <PesCopilot
            {...props}
            onPes={(d) => {
              localStorage.setItem("qa-pes-text", d.pesStatement);
              setPes(d.pesStatement);
            }}
          />
          <label className="mt-5 block text-sm">
            PES manual / aprobado
            <textarea
              className="mt-2 w-full rounded-xl border bg-white p-3"
              value={pes}
              onChange={(e) => setPes(e.target.value)}
            />
          </label>
        </>
      ) : (
        <RecallCopilot {...props} />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
