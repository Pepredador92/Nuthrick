import { formatPatientDate } from "@/src/features/patients/patientUtils";
import {
  formatAnswer,
  matchesCondition,
} from "@/src/features/consultations/questionnaire";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "@/src/types/domain";

export function consultationTextExport(
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
): string {
  const lines = [
    "Nuthrick · Registro de consulta",
    `Paciente: ${patient.full_name}`,
    `Fecha: ${formatPatientDate(consultation.consultation_date)}`,
    `Tipo: ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}`,
    `Plantilla: ${snapshot.template_name} · v${snapshot.template_version}`,
    "",
  ];
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter((question) =>
        matchesCondition(question.visibility_condition, values),
      )
      .map(
        (question) =>
          [
            question.label,
            formatAnswer(question, values[question.question_key]),
          ] as const,
      )
      .filter(([, answer]) => answer && answer !== "Sin respuesta");
    if (!entries.length) continue;
    lines.push(section.title);
    for (const [label, answer] of entries) lines.push(`- ${label}: ${answer}`);
    lines.push("");
  }
  if (consultation.summary)
    lines.push("Resumen de cierre", consultation.summary, "");
  lines.push(
    "Documento privado. Contiene información clínica registrada durante la entrevista.",
  );
  return lines.join("\n");
}

export function downloadConsultationText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
