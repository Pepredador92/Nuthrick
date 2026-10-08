import { createServer } from 'vite';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Synthetic samples using the production renderers. No credentials or patient records.
const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = resolve(process.argv[2] ?? resolve(root, '../output/pdf/propuesta-exportaciones'));
const server = await createServer({ configFile: false, root, ssr: {noExternal: ['jspdf']}, resolve: { alias: { '@': root } }, plugins: [{ name: 'pdf-node-adapter', enforce: 'pre', resolveId: id => (id === 'jspdf' || id.includes('/jspdf/dist/')) ? '\0pdf-jspdf' : null, load: id => id === '\0pdf-jspdf' ? `import {createRequire} from 'node:module'; export const jsPDF=createRequire(${JSON.stringify(resolve(root,'package.json'))})('jspdf').jsPDF;` : null }], server: { middlewareMode: true }, appType: 'custom' });
try {
 await mkdir(destination, { recursive: true });
 const { renderPlanPdf, renderPlanTex } = await server.ssrLoadModule('/@fs'+resolve(root, '../supabase/functions/agenda/plan-document.ts'));
 const { buildConsultationPdf } = await server.ssrLoadModule('/src/features/consultations/exportText.ts');
 const { buildEvolutionPdf } = await server.ssrLoadModule('/src/features/evolution/evolutionPdf.ts');
 const { loadLongitudinalHistory } = await server.ssrLoadModule('/tests/visual/patient-adjustments-fixtures.ts');
 const logo='data:image/png;base64,'+(await readFile(resolve(root,'tests/visual/professional-logo-demo.png'))).toString('base64');
 const professional = { logoUrl: logo, fullName: 'Andrea Ríos', professionalTitle: 'Licenciada en Nutrición', licenseNumber: '0000000 (demostración)', businessName: 'Consulta de nutrición · Demostración', businessAddress: 'Consultorio de demostración · Ciudad de México', contactLines: ['Contacto: consulta@example.invalid', 'Estos datos son ficticios y solo muestran el diseño.'] };
 const patient = { full_name: 'Valeria Torres · Demostración', birth_date: '1992-06-10', email: 'valeria@example.invalid', phone: '5550000000', country_code: '+52' };
 const ingredient = (name, amount, unit, alternatives=[]) => ({ name, amount, unit, alternatives });
 const model = { templateVersion: 'clinical-letterhead-v1', patientName: patient.full_name, professional,
  context: {birthDate:patient.birth_date,sex:'Femenino',recordReference:'EXP-DEMO-001',consultationDate:'2026-10-05T18:00:00Z',consultationLabel:'Consulta de seguimiento · 2',objective:'Llevar una colación preparada durante tres días de trabajo por semana hasta la próxima consulta.',instructions:'Deja tu colación preparada desde la noche anterior. Llévala contigo los días de trabajo y anota cuáles opciones te resultaron más fáciles.'},
  nutrition:{energy:2000,carbohydrate:250,protein:100,fat:66.7},plan: {
  title: 'Mi semana de alimentación', versionNumber: 2, publishedAt: '2026-10-05T18:00:00Z',
  supplements: [{name:'Proteína de ejemplo',brand:'Marca de demostración',presentation:'Vainilla',quantity:'1 porción · 30 g (1 medida)',instructions:'Con tu desayuno. Porción ficticia para revisar el formato.'}],
  days: [{name:'Lunes',meals:[
   {name:'Desayuno',time:'08:00',title:'Huevos con frijoles y tortilla',ingredients:[ingredient('Huevo entero',2,'piezas',[{name:'Pollo cocido',amount:60,unit:'g'}]),ingredient('Tortilla de maíz',2,'piezas'),ingredient('Frijoles cocidos',.5,'taza'),ingredient('Plátano',.5,'pieza')],instructions:['Cocina los huevos y acompaña con frijoles y tortillas. Sirve la fruta al lado.']},
   {name:'Comida',time:'14:00',title:'Pollo con arroz y verduras',ingredients:[ingredient('Pollo cocido',90,'g'),ingredient('Arroz cocido',.5,'taza'),ingredient('Verduras variadas',1,'taza'),ingredient('Aceite de oliva',1,'cucharadita')],instructions:['Sirve el pollo y el arroz. Agrega las verduras y el aceite de oliva.']},
   {name:'Cena',time:'20:00',title:'Tostadas de frijoles',ingredients:[ingredient('Tostada horneada',2,'piezas'),ingredient('Frijoles cocidos',.5,'taza'),ingredient('Lechuga y jitomate',1,'taza')],instructions:['Unta los frijoles sobre las tostadas y coloca las verduras encima.']}
  ]}]
 }};
 await writeFile(resolve(destination,'plan-alimentacion.pdf'),renderPlanPdf(model,logo));
 await writeFile(resolve(destination,'plan-alimentacion.tex'),renderPlanTex(model));
 const question=(question_key,label,question_type='long_text')=>({question_key,label,question_type,configuration:{}});
 const snapshot={template_name:'Seguimiento',template_version:1,structure:{sections:[
  {title:'Conversación y avances',questions:[question('reason','Motivo de la consulta'),question('progress','Cambios desde la última consulta'),question('barrier','Lo que se ha dificultado')]},
  {title:'Mediciones e indicadores',questions:[question('weight','Peso','short_text'),question('waist','Cintura','short_text'),question('energy','Energía durante el día','short_text'),question('sleep','Sueño','short_text'),question('interpretation','Interpretación profesional')]},
  {title:'Objetivos y acuerdos',questions:[question('goal','Objetivo acordado'),question('instructions','Indicaciones acordadas'),question('review','Próxima revisión','short_text')]}
 ]}};
 const consultation={consultation_type:'follow_up',consultation_date:'2026-10-05T18:00:00Z',sequence_number:2,summary:'Se revisaron los cambios registrados y las dificultades para organizar las comidas. Se acordó preparar una colación para los días de trabajo y revisar el avance en la próxima consulta.'};
 const values={reason:'Seguimiento de la organización de horarios de alimentación.',progress:'La paciente refiere mayor constancia con el desayuno y mejor energía durante la mañana. Ha podido preparar alimentos en casa tres días por semana.',barrier:'En los días de trabajo, la comida se retrasa. Prefiere opciones sencillas que pueda llevar preparadas.',weight:'71.8 kg',waist:'82 cm',energy:'Mejor por la mañana',sleep:'7 horas por noche',interpretation:'Los indicadores se revisaron junto con los cambios de hábitos reportados. La evolución se valorará en las siguientes consultas y no únicamente por el peso.',goal:'Llevar una colación preparada durante tres días de trabajo por semana hasta la próxima consulta.',instructions:'Deja tu colación preparada desde la noche anterior. Llévala contigo los días de trabajo y anota cuáles opciones te resultaron más fáciles.\n\nEn la próxima consulta revisaremos cómo te fue y ajustaremos el acuerdo contigo.',review:'En cuatro semanas'};
 const consultationPdf=await buildConsultationPdf(patient,consultation,snapshot,values,professional);
 await writeFile(resolve(destination,'informe-consulta.pdf'),Buffer.from(consultationPdf.output('arraybuffer')));
 const history=await loadLongitudinalHistory();
 const evolution=await buildEvolutionPdf(patient,history,{seriesIds:['weight','waist','bmi','somato'],references:{targetBmi:22.5,gallagherSeriesIds:[]}},professional);
 await writeFile(resolve(destination,'reporte-evolucion.pdf'),Buffer.from(evolution.output('arraybuffer')));
 const textPlan=structuredClone(model);
 textPlan.plan.supplements=[];
 textPlan.plan.days=[{name:'Día 1',meals:[],text:'Desayuno · 08:00\n2 piezas de huevo, 2 tortillas y 1 taza de verduras.\nCocina el huevo y sirve las verduras al lado.\n\nComida · 14:00\n90 g de pollo, 1/2 taza de arroz cocido y 1 taza de verduras.\nSirve el pollo y el arroz con las verduras.\n\nCena · 20:00\n2 tostadas horneadas, 1/2 taza de frijoles y 1 taza de lechuga con jitomate.\nUnta los frijoles sobre las tostadas y coloca las verduras encima.'}];
 await writeFile(resolve(destination,'plan-texto-revisado.pdf'),renderPlanPdf(textPlan,logo));
 const stress=structuredClone(model);
 stress.professional.fullName="María Fernanda de los Ángeles Rodríguez Hernández";
 stress.professional.businessName="Centro de Nutrición Clínica y Atención Integral de la Salud";
 stress.plan.days[0].meals[0].instructions=['Inicio del texto extenso. '+ 'Contenido completo de prueba con cantidades 25 g y acentos: piña, proteína. '.repeat(240)+' Fin del texto extenso.'];
 stress.plan.days.push({name:'Día de texto libre',meals:[],text:'Texto revisado conservado.\n\n'+ 'Seguimiento de ejemplo. '.repeat(140)+'\nFin del texto libre.'});
 await writeFile(resolve(destination,'prueba-textos-largos.pdf'),renderPlanPdf(stress,logo));
 const previews=resolve(destination,'preview');
 await mkdir(previews,{recursive:true});
 const samples=[['alimentacion','Plan de alimentación','plan-alimentacion.pdf'],['texto','Plan en texto','plan-texto-revisado.pdf'],['consulta','Informe de consulta','informe-consulta.pdf'],['evolucion','Reporte de evolución','reporte-evolucion.pdf']];
 const {readdir}=await import('node:fs/promises');
 for(const [id,,filename] of samples){
  const previous=(await readdir(previews)).filter(name=>name.startsWith(id+'-')&&name.endsWith('.png'));
  for(const name of previous)await unlink(resolve(previews,name));
  await promisify(execFile)('pdftoppm',['-r','100','-png',resolve(destination,filename),resolve(previews,id)]);
 }
 const sections=await Promise.all(samples.map(async([id,title,filename],index)=>{
  const pages=(await readdir(previews)).filter(name=>name.startsWith(id+'-')&&name.endsWith('.png')).sort((a,b)=>parseInt(a.split('-')[1])-parseInt(b.split('-')[1]));
  return `<section id="${id}" ${index?'hidden':''}><header><h2>${title}</h2><a href="${filename}" target="_blank">Abrir PDF completo ↗</a></header><div class="pages">${pages.map((name,i)=>`<figure><figcaption>Página ${i+1} de ${pages.length}</figcaption><img src="preview/${name}" alt="${title}, página ${i+1}"></figure>`).join('')}</div></section>`;
 }));
 await writeFile(resolve(destination,'vista-previa.html'),`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nuthrick · Propuesta de PDF</title><style>*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#102d38,#15253f 60%,#123739);background-attachment:fixed;color:#eef7f8;font:15px system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:35px 24px}small{color:#a9d9d1;letter-spacing:.14em;font-size:11px}h1{font-size:32px;margin:12px 0}p{color:#bdccd7;line-height:1.7;max-width:750px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:26px 0}button,a{border:1px solid #64859466;border-radius:12px;padding:12px 16px;background:#294354;color:#e4f4f3;font:inherit;text-decoration:none;cursor:pointer}button[aria-pressed=true]{background:#16828a;color:white}section>header{display:flex;gap:20px;justify-content:space-between;align-items:center;margin-bottom:20px}h2{font-size:20px}.pages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0;padding:12px;background:#ffffff10;border:1px solid #ffffff20;border-radius:18px;box-shadow:0 20px 40px #07151a66}img{display:block;width:100%;border-radius:6px}figcaption{padding:0 4px 10px;font-size:12px;color:#a7bdc9}[hidden]{display:none!important}@media(max-width:700px){.pages{grid-template-columns:1fr}main{padding:24px 14px}section>header{align-items:flex-start;flex-direction:column}h1{font-size:26px}}</style><main><small>NUTHRICK / PROPUESTA PARA REVISIÓN</small><h1>Una lectura más clara, paso a paso.</h1><p>Ejemplos con datos ficticios. Tarjetas con profundidad suave, porciones visibles y detalles organizados. Encabezados con identidad profesional destacada.</p><nav aria-label="Ejemplos de exportación">${samples.map(([id,title],i)=>`<button data-view="${id}" aria-pressed="${i===0}">${title}</button>`).join('')}</nav>${sections.join('')}</main><script>document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{document.querySelectorAll('section').forEach(section=>section.hidden=section.id!==button.dataset.view);document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',item===button));});</script></html>`);
 console.log(JSON.stringify({destination,consultationPages:consultationPdf.getNumberOfPages(),evolutionPages:evolution.getNumberOfPages()}));
} finally { await server.close(); }
