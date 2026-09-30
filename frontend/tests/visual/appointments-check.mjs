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
const appointment={id:'20000000-0000-0000-0000-000000000001',status:'confirmed',starts_at:'2099-10-01T16:00:00Z',ends_at:'2099-10-01T17:00:00Z',timezone:'America/Mexico_City',modality:'online',professional_name:'Nutrióloga de demostración',patient_attendance_at:null,professional_attendance_at:null,requires_confirmation:false};
try {
 await page.clock.setFixedTime(new Date('2099-09-01T12:00:00Z'));
 await page.context().route('https://wa.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'WhatsApp intercepted: no message sent.'}));
 await page.route('**/functions/v1/agenda',async route=>{
  const body=route.request().postDataJSON();
  if(body.op==='appointment_availability') {
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({day:body.day||'2099-10-01',today:'2099-10-01',lastDay:'2099-12-31',timezone:'America/Mexico_City',weekdays:[1,2,3,4,5],slots:[{start:appointment.starts_at,end:appointment.ends_at}],connectionError:false})});return;
  }
  const data=body.op==='appointment_options'?{timezone:'America/Mexico_City',duration:60,minimumNoticeMinutes:120,horizonDays:90,options:[{modality:'online',location_id:null,label:'En línea'}]}:body.op==='resolve_time_private'?{instants:[appointment.starts_at]}:body.op==='appointment_link'?{url:'https://example.invalid/agenda/confirmar#synthetic',phone:'+524920000000'}:body.op==='appointment_confirm'?{...appointment,patient_attendance_at:'2099-09-30T12:00:00Z'}:appointment;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:4187/tests/visual/appointments.html');
 await page.getByText('34',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Agendar cita',exact:true}).click();
 await page.getByRole('combobox',{name:'Paciente',exact:true}).fill('Paciente');
 await page.getByRole('option',{name:'Paciente de demostración'}).click();
 await page.getByRole('button',{name:/10:00/}).click();
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Overflow ${width}`);
  await page.screenshot({path:output+`form-${width}.png`,fullPage:true});
 }
 await page.getByRole('dialog').getByRole('button',{name:'Agendar cita',exact:true}).click();
 await page.getByRole('heading',{name:'Cita agendada'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Confirmar mi parte'}).count(),0);
 const opened=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Enviar cita por WhatsApp'}).click();
 const popup=await opened;await popup.waitForURL('https://wa.me/**');
 assert.ok(decodeURIComponent(popup.url()).includes('quedó agendada'));
 await popup.close();
 await page.screenshot({path:output+'confirmation-320.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Confirmation overflow');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Agendar cita',exact:true}).evaluate(el=>el===document.activeElement),true,'Focus restored');
 await page.screenshot({path:output+'stats-320.png',fullPage:true});
 await page.goto('http://127.0.0.1:4187/tests/visual/appointments.html?view=patient#synthetic');
 await page.getByRole('link',{name:'Añadir a Google Calendar'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Confirmar mi asistencia'}).count(),0);
 await page.screenshot({path:output+'patient-invitation-320.png',fullPage:true});
 await page.clock.setFixedTime(new Date('2099-09-30T12:00:00Z'));
 await page.goto('http://127.0.0.1:4187/tests/visual/appointments.html?view=patient#synthetic');
 await page.getByRole('button',{name:'Confirmar mi asistencia'}).click();
 await page.getByText('Tu asistencia está confirmada.').waitFor();
 await page.screenshot({path:output+'patient-attendance-320.png',fullPage:true});
 assert.deepEqual(faults,[]);
 console.log('PASS combobox, calendar, booking, direct WhatsApp, early calendar access, deferred attendance, restored focus, 320/390/1280 widths; no live appointments or messages.');
}finally{await browser.close();}
