import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./consultation-flow-fixtures.ts', import.meta.url));
export default defineConfig({ root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [react(), tailwind()], resolve: { alias: [
  ...['services/consultations', 'services/patients', 'services/ai', 'services/clinicalCopilot', 'lib/supabase', 'features/admin/AccessProvider'].map(name => ({ find: `@/src/${name}`, replacement: fixture })),
  { find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) },
] }, server: { host: '127.0.0.1', port: 4195, strictPort: true } });
