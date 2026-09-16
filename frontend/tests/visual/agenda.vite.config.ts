import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../../',import.meta.url)),plugins:[react(),tailwind()],resolve:{alias:{'@':fileURLToPath(new URL('../../',import.meta.url))}},server:{host:'127.0.0.1',port:4179,strictPort:true}});
