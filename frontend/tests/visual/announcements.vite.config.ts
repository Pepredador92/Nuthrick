import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  plugins: [{ name: 'announcements-preview-api', enforce: 'pre', resolveId(source, importer) {
    if (source === './api' && importer?.includes('/src/features/announcements/')) return fileURLToPath(new URL('./announcements-fixtures.ts', import.meta.url));
  } }, react(), tailwind()],
  resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) }] },
  server: { host: '127.0.0.1', port: 4197, strictPort: true },
});
