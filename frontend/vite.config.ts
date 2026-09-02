import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
// Avoid the tslib CommonJS wrapper's undefined default export in Rolldown SSR.
const tslibEsm = fileURLToPath(import.meta.resolve('tslib/tslib.es6.mjs'));

export default defineConfig({
  resolve: { alias: [{ find: /^tslib$/, replacement: tslibEsm }] },
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  // Keep SSR dependencies bundled consistently on macOS and Vercel/Linux.
  plugins: [
    tailwindcss(),
    vinext(),
    sites(),
    {
      name: 'nuthrick-ssr-diagnostics',
      transform(code, id) {
        if (!id.endsWith('/vinext/dist/server/app-ssr-entry.js')) return;
        return code.replace('onError(error) {', `onError(error) {
          console.error('[Nuthrick SSR]', error instanceof Error ? error.stack : 'Render error');`);
      },
    },
    nitro({ noExternals: true, alias: { tslib: tslibEsm } }),
  ],
});
