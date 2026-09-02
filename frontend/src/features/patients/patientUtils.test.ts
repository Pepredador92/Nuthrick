import { describe, expect, it } from "vitest";
import {
  calculateAge,
  calculateBmi,
  consultationLabel,
  normalizePhone,
  patientStatusLabel,
} from "./patientUtils";

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
});
