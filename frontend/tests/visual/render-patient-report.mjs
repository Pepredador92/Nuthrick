import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const destination = resolve(process.argv[2] ?? resolve(root, "../output/pdf/reporte-progreso-demostracion.pdf"));
const server = await createServer({ configFile: resolve(root, "tests/visual/patient-adjustments.vite.config.ts"), server: { middlewareMode: true }, appType: "custom" });
try {
  const { buildEvolutionPdf } = await server.ssrLoadModule("/src/features/evolution/evolutionPdf.ts");
  const { loadLongitudinalHistory, patient } = await server.ssrLoadModule("/tests/visual/patient-adjustments-fixtures.ts");
  const history = await loadLongitudinalHistory();
  const logoUrl = `data:image/png;base64,${(await readFile(new URL("./professional-logo-demo.png", import.meta.url))).toString("base64")}`;
  const pdf = await buildEvolutionPdf(patient, history, { seriesIds: history.series.map((item) => item.id), references: { targetBmi: 22.5, gallagherSeriesIds: ["fat"] } }, { fullName: "Profesional de demostración", professionalTitle: "Nutrición", contactLines: ["Datos y logo ficticios para revisión visual"], logoUrl });
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(pdf.output("arraybuffer")));
  console.log(`${destination} · ${pdf.getNumberOfPages()} páginas`);
} finally { await server.close(); }
