import { describe, expect, it } from "vitest";
import {
  calculateAge,
  calculateBmi,
  consultationLabel,
  formatPatientDate,
  normalizePhone,
  patientStatusLabel,
  withConsultationDisplayNumbers,
} from "./patientUtils";
import type { Consultation } from "@/src/types/domain";

describe("patient utilities", () => {
  it("calculates age using birthday boundary", () => {
    expect(calculateAge("1990-09-03", new Date("2026-09-02T12:00:00"))).toBe(
      35,
    );
    expect(calculateAge("1990-09-02", new Date("2026-09-02T12:00:00"))).toBe(
      36,
    );
  });
  it("calculates BMI without allowing manual drift", () =>
    expect(calculateBmi(70, 175)).toBe(22.86));
  it("formats date-only birth dates without shifting the calendar day", () => {
    expect(formatPatientDate("1981-07-13")).toMatch(/13 jul 1981/i);
  });
  it("normalizes local phone numbers to E.164", () =>
    expect(normalizePhone("+52", "55 1234 5678")).toBe("+525512345678"));
  it("keeps archived status distinct from inactive", () => {
    expect(patientStatusLabel("inactive")).toBe("Inactivo");
    expect(patientStatusLabel("archived")).toBe("Archivado");
  });
  it("labels initial and follow-up consultations consistently", () => {
    expect(consultationLabel({ consultation_type: "initial", sequence_number: 0 })).toBe("Consulta de inicio");
    expect(consultationLabel({ consultation_type: "follow_up", sequence_number: 2 })).toBe("Seguimiento 2");
  });
  it("numbers current follow-ups without counting retired or cancelled attempts, keeping IDs and custom names", () => {
    const visits = [
      { id: "today", sequence_number: 6, consultation_date: "2026-10-03", display_name: "Control de octubre" },
      { id: "retired", sequence_number: 2, consultation_date: "2026-09-26", deleted_at: "2026-09-26" },
      { id: "cancelled", sequence_number: 3, consultation_date: "2026-10-02", status: "cancelled" },
      { id: "first", sequence_number: 1, consultation_date: "2026-08-01" },
      { id: "initial", sequence_number: 0, consultation_date: "2026-07-18", consultation_type: "initial" },
    ].map((visit) => ({ patient_id: "p", consultation_type: "follow_up", status: "completed", ...visit })) as Consultation[];
    const numbered = withConsultationDisplayNumbers(visits);
    expect(numbered.map((visit) => visit.id)).toEqual(visits.map((visit) => visit.id));
    expect(numbered[0]).toMatchObject({ sequence_number: 6, display_sequence_number: 2 });
    expect(consultationLabel(numbered[0])).toBe("Control de octubre");
    expect(consultationLabel({ ...numbered[0], display_name: null })).toBe("Seguimiento 2");
    expect(consultationLabel(numbered[2])).toBe("Consulta de seguimiento");
    expect(consultationLabel(numbered[3])).toBe("Seguimiento 1");
    expect(consultationLabel(numbered[4])).toBe("Consulta de inicio");
    expect(visits[0].display_sequence_number).toBeUndefined();
  });
});
