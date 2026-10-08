import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Synthetic samples using the production renderers. No credentials or patient records.
const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = resolve(process.argv[2] ?? resolve(root, '../output/pdf/carrito-super'));
const server = await createServer({ configFile: false, root, ssr: {noExternal: ['jspdf']}, resolve: { alias: { '@': root } }, plugins: [{ name: 'pdf-node-adapter', enforce: 'pre', resolveId: id => (id === 'jspdf' || id.includes('/jspdf/dist/')) ? '\0pdf-jspdf' : null, load: id => id === '\0pdf-jspdf' ? `import {createRequire} from 'node:module'; export const jsPDF=createRequire(${JSON.stringify(resolve(root,'package.json'))})('jspdf').jsPDF;` : null }], server: { middlewareMode: true }, appType: 'custom' });
try {
 await mkdir(destination, { recursive: true });
 const {renderPlanPdf}=await server.ssrLoadModule('/@fs'+resolve(root,'../supabase/functions/agenda/plan-document.ts'));
 const model={templateVersion:'clinical-letterhead-v1',patientName:'Paciente de demostración',professional:{fullName:'Profesional de demostración',professionalTitle:'Licenciatura en Nutrición'},plan:{title:'Plan de ejemplo',versionNumber:1,publishedAt:'2026-10-08T12:00:00Z',days:[],shoppingList:{schedule:[{diet_id:'one',title:'Dieta 1',days:3},{diet_id:'two',title:'Dieta 2',days:2}],items:[{name:'Pollo cocido',quantity:560,unit:'g'},{name:'Arroz cocido',quantity:1.5,unit:'taza'},{name:'Calabacitas',quantity:5,unit:'taza'},{name:'Papa cocida',quantity:300,unit:'g'},{name:'Aceite',quantity:5,unit:'cucharadita'}]}}};
 await writeFile(resolve(destination,'carrito-super.pdf'),renderPlanPdf(model));
 console.log(destination);
} finally { await server.close(); }
