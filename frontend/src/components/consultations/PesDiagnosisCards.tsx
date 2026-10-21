import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import type { PesDraft } from "@/src/features/consultations/clinicalCopilot";
import { hasUsablePesEtiology } from '../../../../supabase/functions/_shared/pes';

export function PesDiagnosisCards({ draft, editable = false, onChange }: {
  draft: PesDraft;
  editable?: boolean;
  onChange?: (parts: Partial<PesDraft>) => void;
}) {
  const parts = [
    {
      key: "problem",
      letter: "P",
      title: "Problema",
      prompt: "¿Qué problema nutricional identificas?",
      limit: 500,
      value: draft.problem,
    },
    {
      key: "etiology",
      letter: "E",
      title: "Etiología",
      prompt: "¿Con qué causa se relaciona?",
      limit: 1500,
      value: draft.etiology,
    },
    {
      key: "signsSymptoms",
      letter: "S",
      title: "Signos y síntomas",
      prompt: "¿Qué datos lo demuestran?",
      limit: 1500,
      value: draft.signsSymptoms.join("\n"),
    },
  ] as const;
  return (
    <div className="clinical-pes-parts">
      {parts.map((part) => {
        const complete = (part.key==='etiology'?hasUsablePesEtiology(part.value):!!part.value.trim()) && part.value.length <= part.limit;
        return (
          <section
            key={part.key}
            className="clinical-pes-part"
            data-status={complete ? "complete" : "pending"}
            aria-label={`${part.letter} · ${part.title}`}
          >
            <header>
              <span className="clinical-pes-letter">{part.letter}</span>
              <ClinicalStatusBadge status={complete ? "complete" : "pending"}>
                {complete ? "Registrado" : "Pendiente"}
              </ClinicalStatusBadge>
            </header>
            <h4>{part.title}</h4>
            <p>{part.prompt}</p>
            {onChange
              ? (
                <textarea
                  aria-label={part.title}
                  className="nuth-input"
                  rows={5}
                  maxLength={part.limit}
                  readOnly={!editable}
                  aria-invalid={part.key === "etiology" && !hasUsablePesEtiology(part.value)
                    ? true
                    : undefined}
                  value={part.value}
                  onChange={(event) =>
                    onChange(
                      part.key === "signsSymptoms"
                        ? { signsSymptoms: event.target.value.split("\n") }
                        : { [part.key]: event.target.value },
                    )}
                />
              )
              : part.value.trim()
              ? <p className="clinical-pes-saved-part">{part.value}</p>
              : <span className="clinical-pes-placeholder">Por completar</span>}
          </section>
        );
      })}
    </div>
  );
}
