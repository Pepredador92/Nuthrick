import React from "react";
import { createRoot } from "react-dom/client";
import {
  PesCopilot,
  RecallCopilot,
} from "../../src/components/consultations/ClinicalCopilot";
import "../../app/globals.css";
import { ClinicalObjective } from "../../src/components/consultations/ClinicalObjective";
import { ClinicalMeasurementsReview } from '../../src/components/consultations/ClinicalMeasurementsReview';
import { ClinicalInterventions } from '../../src/components/consultations/ClinicalInterventions';
import { seedInterventionPreview } from './clinical-copilot-fixtures';
import { reviewFacts } from './clinical-copilot-fixtures';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
function Fixture() {
  const [tab, setTab] = React.useState(new URLSearchParams(location.search).has("strategy") ? "strategy" : new URLSearchParams(location.search).has("recall") ? "recall" : new URLSearchParams(location.search).has("objective") ? "objective" : "pes");
  const [strategyRefresh,setStrategyRefresh] = React.useState(0);
  const [goal, setGoal] = React.useState(
    localStorage.getItem("qa-goal-text") || "",
  );
  const [parts, setParts] = React.useState<Record<string, string>>(() => JSON.parse(localStorage.getItem('qa-pes-parts') || '{}'));
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
      <ThemeSwitcher compact />
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => setTab("pes")}>Diagnóstico PES</button>
        <button onClick={() => setTab("recall")}>
          Recordatorio de 24 horas
        </button>
        <button onClick={() => setTab("objective")}>Objetivo</button>
        <button onClick={() => setTab("strategy")}>Estrategia</button>
      </div>
      {tab === "pes" ? (
        <>
          <ClinicalMeasurementsReview facts={reviewFacts} />
          <PesCopilot
            {...props}
            answers={parts}
            onPes={(d) => {
              localStorage.setItem("qa-pes-text", d.pesStatement);
              const saved = { pes_problem: d.problem, pes_etiology: d.etiology, pes_evidence: d.signsSymptoms.join('\n'), pes_statement: d.pesStatement };
              localStorage.setItem('qa-pes-parts', JSON.stringify(saved)); setParts(saved);
            }}
          />
        </>
      ) : tab === 'strategy' ? (<>
        <button className="nuth-button-secondary mt-4 !text-xs" onClick={()=>{seedInterventionPreview();setStrategyRefresh(v=>v+1);}}>Cargar ejemplo sintético de estrategia</button>
        <ClinicalInterventions key={`synthetic-strategy:${strategyRefresh}`} {...props} onInstructions={text=>window.alert(`Indicaciones sintéticas:\n${text}`)} />
      </>) : tab === "objective" ? (
        <>
          <ClinicalObjective
            {...props}
            questionKey="treatment_objective"
            value={goal}
            onChangeText={text => setGoal(text)}
            before={async () => {
              localStorage.setItem("qa-goal-text", goal);
              return true;
            }}
          />

        </>
      ) : (
        <RecallCopilot {...props} />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
