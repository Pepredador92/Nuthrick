import { chromium } from '/Users/jose/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();let thread=null,messages=[],seq=0;
await context.route('**/__support',async route=>{
 const {p_action:action,p_data:data}=route.request().postDataJSON();let result={};
 if(action==='summary')result=data.admin?{unread:0}:{thread:thread?.status==='resolved'?null:thread,unread:0};
 if(action==='send'){
  thread??={id:'synthetic-case',professional_name:'Nutrióloga de prueba',email:'demo@example.test',professional_id:'synthetic-professional',topic:data.topic,status:'new',revision:1,created_at:new Date().toISOString(),source:data.source};
  messages.push({seq:++seq,body:data.body,sender:data.admin?'admin':'professional',created_at:new Date().toISOString()});
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
await page.getByRole('button',{name:'Abrir soporte'}).click();await page.getByLabel('Mensaje para soporte').fill('Necesito ayuda para compartir un plan.');await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.getByText('Necesito ayuda para compartir un plan.').waitFor();
const admin=await context.newPage();await admin.setViewportSize({width:1280,height:900});await admin.goto(`${base}?view=admin`);await admin.getByRole('button',{name:/Nutrióloga de prueba/}).click();await admin.getByLabel('Mensaje para el nutriólogo').fill('Revisamos el caso contigo.');await admin.getByRole('button',{name:'Enviar',exact:true}).click();await admin.getByRole('log').getByText('Revisamos el caso contigo.',{exact:true}).waitFor();await admin.screenshot({path:'../output/support/admin.png',fullPage:true});
await admin.getByRole('button',{name:'Resolver y reiniciar'}).click();await admin.getByRole('button',{name:'Reabrir caso'}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'¿En qué podemos ayudarte?'}).waitFor();assert.equal(await page.getByLabel('Mensaje para soporte').inputValue(),'');assert.equal(messages.length,2);assert.deepEqual(errors,[]);
console.log('PASS: 320/390/1280px, keyboard/focus, conversation, admin resolution, fresh composer, retained archive.');await browser.close();
