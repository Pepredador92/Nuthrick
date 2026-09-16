import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AGENDA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const faults=[];page.on('pageerror',e=>faults.push(e.message));
const output=new URL('../../../output/agenda-preview/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const slots=[0,1,2].flatMap(d=>[10,11,12,16,17].map(h=>({start:`2026-09-${20+d}T${h+6}:00:00Z`,end:`2026-09-${20+d}T${h+7}:00:00Z`,modality:'online',locationId:null})));
try{
 await page.route('**/functions/v1/agenda',async route=>{
  const body=route.request().postDataJSON();
  const result=body.op==='availability'?{name:'Valeria Torres · Nutrióloga',slug:'prueba',timezone:'America/Mexico_City',duration:60,horizonDays:60,minimumNoticeMinutes:120,hasSchedule:true,requestsEnabled:true,connectionError:false,locations:[],options:[{modality:'online',location_id:null}],slots}
  :body.op==='send_code'?{id:'synthetic-challenge',delivery:'sent'}:body.op==='verify_code'?{proof:'synthetic-proof'}:{id:'synthetic-reservation',status:'confirmed',start:slots[0].start};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('http://127.0.0.1:4179/tests/visual/agenda.html');
 await page.getByRole('heading',{name:/Agenda una cita con/}).waitFor();
 await page.getByRole('button',{name:/10:00/}).first().click();
 await page.getByLabel('Nombre completo').fill('Paciente ficticio');
 await page.getByLabel('Correo electrónico').fill('synthetic@example.invalid');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:950});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Overflow at ${width}`);
  await page.screenshot({path:output+`booking-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Verificar correo'}).click();
 await page.getByLabel('Código de 6 dígitos').fill('123456');
 await page.getByRole('button',{name:'Comprobar código'}).click();
 await page.getByRole('button',{name:'Confirmar cita'}).click();
 await page.getByRole('heading',{name:'Tu cita quedó agendada.'}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Confirmation overflow');
 await page.screenshot({path:output+'confirmation-320.png',fullPage:true});
 assert.deepEqual(faults,[]);
 console.log('PASS: synthetic booking flow, mobile/tablet/desktop (320–1440), no overflow or runtime errors. No real mail or appointments.');
}finally{await browser.close();}
