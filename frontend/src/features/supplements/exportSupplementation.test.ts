import { expect, it } from "vitest";
import { supplementItem } from "../../../tests/fixtures/supplements";
import { buildSupplementationPdf, supplementationTextExport } from "./exportSupplementation";

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

it("exports only the saved supplementation in TXT with both legacy and structured directions", () => {
  const output = supplementationTextExport({ full_name: "María de prueba" }, {
    id: "demo", patient_id: "patient", consultation_id: null,
    items: [
      { ...supplementItem, product: { ...supplementItem.product, name: "Suplemento anterior" } },
      { ...supplementItem, id: "structured", product: { ...supplementItem.product, name: "Cápsula de prueba", serving_unit: "cápsula" },
        directions: { schedule: "Con la comida", duration: "Durante 7 días", notes: "Indicaciones acordadas." } },
    ],
    tags: ["Etiqueta clínica privada"], created_at: "2026-11-24", updated_at: "2026-11-25",
  });

  expect(output).toContain("Indicaciones de suplementación");
  expect(output).toContain("Paciente: María de prueba");
  expect(output).toContain("Fecha de indicación:");
  expect(output).not.toContain("Consulta vinculada:");
  expect(output).toContain("Suplemento anterior\nMarca de prueba · Vainilla");
  expect(output).toContain("Con tu desayuno.");
  expect(output).toContain("1 cápsula al día.\nCuándo tomarlo: Con la comida\nDuración o revisión: Durante 7 días\nIndicaciones acordadas.");
  expect(output.match(/1 cápsula al día/g)).toHaveLength(1);
  expect(output).not.toContain("Etiqueta clínica privada");
  expect(output).not.toContain("private-reference");
});
