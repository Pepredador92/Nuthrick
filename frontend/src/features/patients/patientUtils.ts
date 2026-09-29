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
  consultation: Pick<Consultation, "consultation_type" | "sequence_number">,
): string {
  return consultation.consultation_type === "initial"
    ? "Consulta de inicio"
    : `Seguimiento ${consultation.sequence_number}`;
}
