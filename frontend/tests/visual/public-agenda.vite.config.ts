import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const fixture=fileURLToPath(new URL('./public-agenda-fixtures.ts',import.meta.url));
export default defineConfig({
  root:fileURLToPath(new URL('../../',import.meta.url)),plugins:[react(),tailwind()],
  resolve:{alias:[
    {find:'@/src/services/profile',replacement:fixture},
    {find:'@/src/services/agenda',replacement:fixture},
    {find:'@',replacement:fileURLToPath(new URL('../../',import.meta.url))},
  ]},server:{host:'127.0.0.1',port:4181,strictPort:true},
});
