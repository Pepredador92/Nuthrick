import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({ root: path("../../"), plugins: [react(), tailwind()], resolve: { alias: [{ find: "@/src/features/admin/api", replacement: path("./patient-adjustments-fixtures.ts") }, ...["consultationMeasurements", "consultationCalculations", "interpretations", "bioimpedance", "longitudinalHistory"].map((name) => ({ find: `@/src/services/${name}`, replacement: path("./patient-adjustments-fixtures.ts") })), { find: "@", replacement: path("../../") }] }, server: { host: "127.0.0.1", port: 4196, strictPort: true } });
