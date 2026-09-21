import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname, 'jspdf': new URL('./node_modules/jspdf/dist/jspdf.node.min.js',import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
