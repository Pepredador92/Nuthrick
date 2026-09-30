import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./workspace-fixtures.ts', import.meta.url));
export default defineConfig({ plugins: [react(), tailwind()], resolve: { alias: [
  ...['services/agenda', 'services/patients', 'services/appointments', 'features/auth/AuthProvider', 'features/admin/AccessProvider', 'features/notifications/useNotifications', 'lib/supabase'].map(name => ({ find: `@/src/${name}`, replacement: fixture })),
  { find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) },
] }, server: { host: '127.0.0.1', port: 4198, strictPort: true } });
