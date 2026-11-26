import { expect, it } from "vitest";
import { supplementItem } from "../../../tests/fixtures/supplements";
import { buildSupplementationPdf } from "./exportSupplementation";

it("exports the approved quantity and directions with the letterhead in both designs", async () => {
  for (const design of ["current", "formal"] as const) {
    const pdf = await buildSupplementationPdf(
      { full_name: "Paciente de prueba" },
      {
        id: "demo", patient_id: "patient", consultation_id: "visit",
        items: [{ ...supplementItem, directions: { schedule: "Con el desayuno", duration: "Durante 14 días", notes: "" } }],
        tags: ["Etiqueta clínica privada"], created_at: "2026-11-25", updated_at: "2026-11-25",
      },
      { fullName: "Profesional de prueba", businessName: "Consultorio de prueba", logoUrl: null },
      design, "Consulta inicial",
    );
    const output = pdf.output();
    expect(output).toContain("Consultorio de prueba");
    expect(output).toContain("Paciente de prueba");
    expect(output).toContain("Consulta inicial");
    expect(output).toContain("Con el desayuno");
    expect(output).toContain("Durante 14");
    expect(output).not.toContain("Etiqueta clínica privada");
  }
});
