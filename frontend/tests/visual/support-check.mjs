import { chromium } from '/Users/jose/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();let thread=null,messages=[],seq=0;
let screenshot;
await context.route('**/__support-file',async route=>{if(route.request().method()==='POST'){screenshot=route.request().postDataBuffer();await route.fulfill({json:{}});}else await route.fulfill({body:screenshot,contentType:'image/png'});});
await context.route('**/__support',async route=>{
 const {p_action:action,p_data:data,name}=route.request().postDataJSON();let result={};
 if(name==='support_content'){
  result={settings:{starts_at:'09:00',ends_at:'17:00',timezone:'America/Mexico_City',revision:1},answers:[{id:'faq1',kind:'faq',topic:'agenda',title:'¿Dónde puedo agendar una cita?',body:'En Agenda o en la ficha del paciente, pulsa Agendar cita.',active:true,position:0,revision:1},...(data.admin?[{id:'macro1',kind:'macro',topic:'other',title:'Primera respuesta',body:'Revisamos el caso contigo.',active:true,position:0,revision:1}]:[])]};
 }
 if(action==='summary')result=data.admin?{unread:0}:{thread:thread?.status==='resolved'?null:thread,unread:0};
 if(action==='pending_assets')result=[];
 if(action==='prepare_asset')result={id:'asset1',path:'user/capture.png',file_name:'capture.png'};
 if(action==='stats')result={new:0,in_progress:0,waiting:0,without_reply:0,opened_30d:1,resolved_30d:1,response_minutes:5,response_sample:1,resolution_minutes:12,as_of:new Date().toISOString()};
 if(action==='send'){
  thread??={id:'synthetic-case',professional_name:'Nutrióloga de prueba',email:'demo@example.test',professional_id:'synthetic-professional',topic:data.topic,status:'new',revision:1,created_at:new Date().toISOString(),source:data.source};
  messages.push({seq:++seq,body:data.body,sender:data.admin?'admin':'professional',created_at:new Date().toISOString(),...(data.assetId?{attachment:{id:'asset1',path:'user/capture.png',file_name:'capture.png'}}:{})});
  thread={...thread,last_seq:seq,revision:thread.revision+1,preview:data.body,updated_at:new Date().toISOString(),admin_unread:0,professional_unread:0};result={threadId:thread.id,seq};
 }
 if(action==='thread')result={thread,messages};
 if(action==='inbox')result={items:thread?[thread]:[]};
 if(action==='status'){thread={...thread,status:data.status,revision:thread.revision+1};result=thread;}
 await route.fulfill({json:result});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:4189/tests/visual/support.html';
await mkdir('../output/support',{recursive:true});
for(const width of [320,390,1280]){
 await page.setViewportSize({width,height:850});await page.goto(base);await page.getByRole('button',{name:'Abrir soporte'}).click();
 await page.getByRole('heading',{name:'¿En qué podemos ayudarte?'}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`../output/support/welcome-${width}.png`,fullPage:true});
 await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Abrir soporte'}).evaluate(e=>e===document.activeElement));
}
await page.getByRole('button',{name:'Abrir soporte'}).click();await page.getByLabel('Mensaje para soporte').fill('Necesito ayuda para compartir un plan.');await page.getByLabel('Seleccionar captura').setInputFiles('../output/support/welcome-320.png');await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.getByText('Necesito ayuda para compartir un plan.').waitFor();await page.getByRole('img',{name:'Captura adjunta: capture.png'}).waitFor();await page.setViewportSize({width:390,height:850});await page.screenshot({path:'../output/support/conversation-390.png',fullPage:true});
const admin=await context.newPage();await admin.setViewportSize({width:1280,height:900});await admin.goto(`${base}?view=admin`);await admin.getByRole('button',{name:/Nutrióloga de prueba/}).click();await admin.getByLabel('Mensaje para el nutriólogo').fill('Revisamos el caso contigo.');await admin.getByRole('button',{name:'Enviar',exact:true}).click();await admin.getByRole('log').getByText('Revisamos el caso contigo.',{exact:true}).waitFor();await admin.screenshot({path:'../output/support/admin.png',fullPage:true});
await admin.getByRole('button',{name:'Resolver y reiniciar'}).click();await admin.getByRole('button',{name:'Reabrir caso'}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'¿En qué podemos ayudarte?'}).waitFor();assert.equal(await page.getByLabel('Mensaje para soporte').inputValue(),'');assert.equal(messages.length,2);
await admin.getByRole('button',{name:'Respuestas y horario'}).click();await admin.getByLabel('Desde').waitFor();await admin.screenshot({path:'../output/support/settings.png',fullPage:true});
await admin.getByRole('button',{name:'Estadísticas',exact:true}).click();await admin.getByText('Primera respuesta promedio').waitFor();await admin.setViewportSize({width:390,height:850});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await admin.screenshot({path:'../output/support/stats-390.png',fullPage:true});
await page.getByRole('button',{name:'¿Dónde puedo agendar una cita?'}).click();await page.getByRole('button',{name:'Resolvió mi duda'}).click();assert.equal(messages.length,2);assert.deepEqual(errors,[]);
console.log('PASS: 320/390/1280px, keyboard/focus, conversation, admin resolution, fresh composer, retained archive.');await browser.close();
