import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.MESA_PLAYWRIGHT_MODULE || 'playwright');
const output=process.env.PHASE4B_CAPTURES;
if(!output)throw Error('Provide PHASE4B_CAPTURES outside the repository');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const states=['normal','initial','context','loading','valid','needs_adjustment','invalid','replace','applied'];
const errors=[],external=[];
try {
  for(const [size,width,height] of [['desktop',1440,1000],['tablet',834,1112],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height}});
    await page.addInitScript(()=>sessionStorage.clear());
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();external.push(u.origin);return route.abort();});
    for(const state of states){
      await page.goto(`http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=${state}`);
      await page.getByRole('heading',{name:'Nuthrick a la Mesa'}).waitFor();
      if(state==='initial'||state==='context')await page.getByRole('button',{name:'Generar propuesta'}).waitFor();
      if(state==='context')await page.getByRole('region',{name:'Contexto revisado'}).waitFor();
      if(state==='loading')await page.getByRole('status').filter({hasText:'Preparando propuesta…'}).waitFor();
      if(['valid','needs_adjustment','invalid','replace'].includes(state))await page.getByRole('heading',{name:'Propuesta lista para revisar'}).waitFor();
      if(state==='replace')await page.getByRole('region',{name:'Confirmar reemplazo'}).waitFor();
      if(state==='applied'){await page.getByText('Tortilla de maíz',{exact:true}).first().waitFor();await page.locator('dialog').waitFor({state:'detached'});}
      await page.waitForTimeout(120);
      if(!['normal','applied'].includes(state)){
        const bounds=await page.locator('dialog').evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.clientWidth,scroll:e.scrollWidth}));
        assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.scroll<=bounds.width+1,`${state} ${size}: dialog overflow`);
        if(state==='invalid')assert.equal(await page.getByRole('button',{name:'Aplicar al borrador'}).count(),0);
      }
      await page.screenshot({path:`${output}/${state}-${size}.png`,fullPage:state==='normal'||state==='applied'});
      if(state==='initial'){
        await page.getByRole('button',{name:'Cerrar propuesta'}).waitFor();
        await page.waitForFunction(()=>!document.querySelector('dialog button[aria-label="Cerrar propuesta"]').disabled);
        assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog')),true);
        await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog')),true);
        await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
        assert.equal(await page.getByRole('button',{name:'Crear propuesta con IA'}).evaluate(e=>document.activeElement===e),true);
      }
      console.log(`PASS ${size} ${state}`);
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: 27 captures, keyboard/focus, no dialog overflow, zero external requests');
} finally {await browser.close();}
