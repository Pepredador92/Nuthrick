import type { Consultation, Patient, PatientStatus } from "@/src/types/domain";

export function calculateAge(
  birthDate: string | null,
  today = new Date(),
): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  return Math.round((weightKg / (heightCm / 100) ** 2) * 100) / 100;
}

export function normalizePhone(
  countryCode: string,
  localNumber: string,
): string {
  return `${countryCode}${localNumber.replace(/\D/g, "")}`;
}

export function formatPatientDate(
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  // Date-only values represent a calendar date, not an instant in UTC. Parsing
  // them with `new Date("YYYY-MM-DD")` shifts the displayed day for users west
  // of UTC (for example 13/07 becomes 12/07 in Mexico City).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        12,
      )
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

export function patientInitials(patient: Pick<Patient, "full_name">): string {
  return (
    patient.full_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "P"
  );
}

export function patientStatusLabel(status: PatientStatus): string {
  if (status === "active") return "Activo";
  if (status === "inactive") return "Inactivo";
  return "Archivado";
}

export function consultationLabel(
  consultation: Pick<Consultation, "consultation_type" | "sequence_number" | "display_name" | "display_sequence_number">,
): string {
  if (consultation.display_name?.trim()) return consultation.display_name.trim();
  return consultation.consultation_type === "initial"
    ? "Consulta de inicio"
    : consultation.display_sequence_number === null
      ? "Consulta de seguimiento"
      : `Seguimiento ${consultation.display_sequence_number ?? consultation.sequence_number}`;
}

/** Number visible follow-ups without counting discarded attempts or changing record IDs. */
export function withConsultationDisplayNumbers(consultations: Consultation[]): Consultation[] {
  const counters = new Map<string, number>();
  const numbers = new Map<string, number>();
  [...consultations]
    .filter((item) => !item.deleted_at && item.status !== "cancelled" && item.consultation_type === "follow_up")
    .sort((a, b) => a.consultation_date.localeCompare(b.consultation_date) || a.sequence_number - b.sequence_number || a.id.localeCompare(b.id))
    .forEach((item) => {
      const count = (counters.get(item.patient_id) ?? 0) + 1;
      counters.set(item.patient_id, count);
      numbers.set(item.id, count);
    });
  return consultations.map((item) => ({ ...item, display_sequence_number: numbers.get(item.id) ?? null }));
}
