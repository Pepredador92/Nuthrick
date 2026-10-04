import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./energy-fixtures.ts', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  plugins: [react(), tailwind()],
  // The preview never receives the application's real backend configuration.
  envDir: false,
  resolve: { alias: [
    { find: '@/src/services/supplements', replacement: fileURLToPath(new URL('./supplement-fixtures.ts', import.meta.url)) },
    ...['dietPlans', 'patients', 'dietLibrary'].map(name => ({ find: `@/src/services/${name}`, replacement: fixture })),
    { find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) },
  ] },
  server: { host: '127.0.0.1', port: 4188, strictPort: true },
});
