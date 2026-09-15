import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: here("../../"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      {
        find: "@/src/services/dietLibrary",
        replacement: here("./library-service.ts"),
      },
      { find: "@", replacement: here("../../") },
    ],
  },
  server: { host: "127.0.0.1", port: 4176, strictPort: true },
});
