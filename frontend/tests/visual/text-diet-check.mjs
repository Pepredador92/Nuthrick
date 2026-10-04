import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.MESA_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.TEXT_DIET_CAPTURES||'/tmp/nuthrick-text-captures';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(process.env.TEXT_DIET_URL||'http://127.0.0.1:4198/tests/visual/text-diet.html');
 await page.getByRole('button',{name:'Generar con IA',exact:true}).click();
 assert.equal(await page.getByLabel('Objetivo de las dietas',{exact:true}).inputValue(),'Organizar comidas para llevar.');
 assert.ok((await page.getByLabel('Alergias y restricciones revisadas',{exact:true}).inputValue()).includes('Antecedente del 18/07/2026'));
 await page.getByText('Sin preferencias específicas registradas',{exact:false}).waitFor();
 await page.getByRole('checkbox',{name:/Revisé alergias/}).check();await page.getByRole('checkbox',{name:/Revisé el contexto/}).check();
 await page.screenshot({path:`${output}/${width}-context.png`,fullPage:false});
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByLabel('Dietas completas diferentes').selectOption('7');
 await page.screenshot({path:`${output}/${width}-count.png`,fullPage:false});assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('button',{name:'Generar 7 dietas',exact:true}).click();await page.getByLabel('Contenido editable',{exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log(errors,await page.locator('body').innerText());await page.screenshot({path:`${output}/${width}-error.png`});throw e;});
 await page.screenshot({path:`${output}/${width}-review.png`,fullPage:false});
 const edit='Desayuno aprobado\n• 2 tortillas\n• Huevo con verduras\nEliminé el ingrediente no deseado.';
 await page.getByLabel('Contenido editable',{exact:true}).fill(edit);await page.getByRole('checkbox',{name:/Revisé esta dieta/}).check();
 for(let i=1;i<7;i++){await page.getByRole('button',{name:'Siguiente dieta',exact:true}).click();await page.getByRole('checkbox',{name:/Revisé esta dieta/}).check();}
 await page.getByRole('button',{name:'✓ Dieta 1',exact:true}).click();assert.equal(await page.getByLabel('Contenido editable',{exact:true}).inputValue(),edit);
 assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 await page.getByRole('button',{name:'Aprobar 7 dietas',exact:true}).click();await page.getByRole('button',{name:'Publicar versión',exact:true}).click();await page.getByRole('button',{name:'Confirmar publicación',exact:true}).click();
 assert.equal(await page.locator('section[aria-label="Plan alimenticio publicado"] h3').count(),7);assert.ok(await page.getByText(edit,{exact:true}).count());
 await page.screenshot({path:`${output}/${width}-patient.png`,fullPage:false});assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: 7 dietas, edición, navegación, revisión, publicación y texto exacto en portal; sin desbordamiento`);await page.close();
}}finally{await browser.close();}
