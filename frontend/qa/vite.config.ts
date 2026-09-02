import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("./"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      {
        find: "@/src/services/consultations",
        replacement: here("./services.ts"),
      },
      { find: "@/src/services/patients", replacement: here("./services.ts") },
      {
        find: "@/src/features/auth/AuthProvider",
        replacement: here("./services.ts"),
      },
      { find: "@", replacement: here("../") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    fs: { allow: [here("../")] },
  },
});
