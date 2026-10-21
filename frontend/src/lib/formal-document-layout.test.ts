import { expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import {
  drawFormalFooters,
  FormalDocumentLayout,
} from "../../../supabase/functions/agenda/formal-document-layout";
import { buildConsultationPdf } from "../features/consultations/exportText";
import { buildClinicalDocumentData } from "../features/consultations/clinicalDocument";
import {
  clinicalFixtureConsultation,
  clinicalFixtureItem,
  clinicalFixturePatient,
  clinicalFixtureSnapshot,
  clinicalFixtureValues,
} from "../../tests/fixtures/clinical-guidance";
it("paginates a formal narrative completely and keeps all lines above its footer", () => {
  const pdf = new jsPDF({ unit: "mm", format: "a4" }),
    layout = new FormalDocumentLayout(pdf, {
      fullName: "Profesional de prueba",
      businessName: "Consultorio de prueba",
    });
  const rendered: { text: string; y: number }[] = [],
    native = pdf.text.bind(pdf);
  vi.spyOn(pdf, "text").mockImplementation(
    (...args: Parameters<typeof pdf.text>) => {
      rendered.push({ text: String(args[0]), y: args[2] as number });
      return native(...args);
    },
  );
  const tokens = Array.from({ length: 1100 }, (_, i) => `dato${i}`);
  layout.section("Registro de consulta");
  layout.card("Datos", []);
  layout.section("Plan de atención");
  layout.card("Objetivo acordado", [{
    label: "Seguimiento",
    value: tokens.join(" "),
  }]);
  const text = rendered.map((item) => item.text).join(" ");
  for (const token of tokens) expect(text).toContain(token);
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(rendered.every((item) => item.y <= 272)).toBe(true);
  drawFormalFooters(pdf);
  expect(
    rendered.some((item) =>
      item.text.includes("Nuthrick Software para nutriólogos")
    ),
  ).toBe(true);
});
it("loads the correct professional identity in each design without leaking the previous profile", async () => {
  const clinical = buildClinicalDocumentData(clinicalFixtureSnapshot, [
    clinicalFixtureItem,
  ]);
  const left = await buildConsultationPdf(
    clinicalFixturePatient,
    clinicalFixtureConsultation,
    clinicalFixtureSnapshot,
    clinicalFixtureValues,
    { fullName: "Profesional Uno", licenseNumber: "CEDULA-UNO" },
    clinical,
    "current",
  );
  const right = await buildConsultationPdf(
    clinicalFixturePatient,
    clinicalFixtureConsultation,
    clinicalFixtureSnapshot,
    clinicalFixtureValues,
    {
      fullName: "Profesional Dos",
      licenseNumber: "CEDULA-DOS",
      businessName: "Consultorio Dos",
    },
    clinical,
    "formal",
  );
  const content = (pdf: jsPDF) =>
    Object.values(
      (pdf.internal as unknown as { pages: Record<string, string[]> }).pages,
    ).flat().join("\n");
  const a = content(left), b = content(right);
  expect(a).toContain("Profesional Uno");
  expect(a).not.toContain("Profesional Dos");
  expect(b).toContain("Profesional Dos");
  expect(b).toContain("CEDULA-DOS");
  expect(b).not.toContain("CEDULA-UNO");
  for (const pdf of [left, right]) {
    expect(pdf.getNumberOfPages()).toBeGreaterThan(0);
  }
});
