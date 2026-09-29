import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AGENDA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const faults=[];page.on('pageerror',e=>faults.push(e.message));
const output=new URL('../../../output/appointments-20260929/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const appointment={id:'20000000-0000-0000-0000-000000000001',status:'confirmed',starts_at:'2099-10-01T16:00:00Z',ends_at:'2099-10-01T17:00:00Z',timezone:'America/Mexico_City',modality:'online',professional_name:'Nutrióloga de demostración',patient_confirmed_at:null,professional_confirmed_at:null};
try {
 await page.route('**/functions/v1/agenda',async route=>{
  const body=route.request().postDataJSON();
  const data=body.op==='appointment_options'?{timezone:'America/Mexico_City',duration:60,minimumNoticeMinutes:120,horizonDays:90,options:[{modality:'online',location_id:null,label:'En línea'}]}:body.op==='resolve_time_private'?{instants:[appointment.starts_at]}:body.op==='appointment_create'?appointment:body.op==='appointment_link'?{url:'https://example.invalid/agenda/confirmar#synthetic',phone:'+524920000000'}:{id:appointment.id,status:'confirmed'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:4187/tests/visual/appointments.html');
 await page.getByText('34',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Agendar cita',exact:true}).click();
 await page.getByLabel('Fecha y hora').fill('2099-10-01T10:00');
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Overflow ${width}`);
  await page.screenshot({path:output+`form-${width}.png`,fullPage:true});
 }
 await page.getByRole('dialog').getByRole('button',{name:'Agendar cita',exact:true}).click();
 await page.getByRole('heading',{name:'Cita agendada'}).waitFor();
 await page.getByRole('button',{name:'Confirmar mi parte'}).click();
 await page.getByLabel('Confirmación: Falta confirmación del paciente',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Compartir confirmación'}).click();
 const link=page.getByRole('link',{name:/WhatsApp/});await link.waitFor();
 assert.ok((await link.getAttribute('href')).startsWith('https://wa.me/524920000000?text='));
 await page.screenshot({path:output+'confirmation-320.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Confirmation overflow');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Agendar cita',exact:true}).evaluate(el=>el===document.activeElement),true,'Focus restored');
 await page.screenshot({path:output+'stats-320.png',fullPage:true});
 assert.deepEqual(faults,[]);
 console.log('PASS synthetic booking, confirmation, WhatsApp link, restored focus, 320/390/1280 widths; no live appointments or messages.');
}finally{await browser.close();}
