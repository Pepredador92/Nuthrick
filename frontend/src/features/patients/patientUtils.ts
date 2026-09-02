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
  const date = new Date(value);
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
