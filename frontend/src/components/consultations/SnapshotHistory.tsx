import { useEffect, useState } from "react";
import { InterviewReview } from "@/src/components/consultations/InterviewReview";
import { listAnswers, listSnapshots } from "@/src/services/consultations";
import type { Consultation, ConsultationSnapshot } from "@/src/types/domain";

export function SnapshotHistory({
  consultation,
  historicalOnly = false,
}: {
  consultation: Consultation;
  historicalOnly?: boolean;
}) {
  const [snapshots, setSnapshots] = useState<ConsultationSnapshot[]>([]);
  const [selected, setSelected] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void listSnapshots(consultation.id)
      .then((all) => {
        if (active) {
          setSnapshots(historicalOnly ? all.slice(1) : all);
          setSelected(0);
        }
      })
      .catch(() => {
        if (active) {
          setError("No pudimos cargar las revisiones.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [consultation.id, historicalOnly]);
  const snapshot = snapshots[selected];
  useEffect(() => {
    if (!snapshot) return;
    let active = true;
    void listAnswers(consultation.id, snapshot.revision)
      .then((rows) => {
        if (active) {
          setAnswers(
            Object.fromEntries(
              rows.map((row) => [row.question_key, row.value]),
            ),
          );
          setError("");
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("No pudimos cargar las respuestas de esta revisión.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [consultation.id, snapshot]);
  if (error)
    return (
      <p role="alert" className="mt-4 text-sm text-[#963f32]">
        {error}
      </p>
    );
  if (!snapshots.length) return null;
  return (
    <section className="mt-4 min-w-0 rounded-2xl border border-[#dfe5e1] bg-white p-4">
      <label
        htmlFor={"snapshot-" + consultation.id}
        className="text-xs font-semibold text-[#74817d]"
      >
        Cuestionario conservado · solo lectura
      </label>
      <select
        id={"snapshot-" + consultation.id}
        className="nuth-input mt-2 !min-w-0"
        value={selected}
        onChange={(event) => {
          setLoading(true);
          setAnswers({});
          setSelected(Number(event.target.value));
        }}
      >
        {snapshots.map((item, index) => (
          <option key={item.id} value={index}>
            {item.template_name} · v{item.template_version} · revisión{" "}
            {item.revision}
          </option>
        ))}
      </select>
      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[#74817d]">Cargando respuestas…</p>
        ) : (
          <InterviewReview structure={snapshot.structure} values={answers} />
        )}
      </div>
    </section>
  );
}
