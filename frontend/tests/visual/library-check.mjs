import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.MESA_PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const faults=[];
page.on('pageerror',e=>faults.push(e.message));
const output=new URL('../../../output/library-estimates/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
try {
 await page.goto('http://127.0.0.1:4176/tests/visual/library.html');
 await page.getByRole('button',{name:'Mi biblioteca',exact:true}).click();
 await page.getByRole('button',{name:'Biblioteca de Nuthrick',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Ver dieta',exact:true}).first().waitFor();
 assert.equal(await page.getByRole('dialog').getByLabel('Distribución de macronutrientes').count(),21);
 assert.ok(!(await page.getByRole('dialog').innerText()).includes('PDF'));
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:950});
  assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Dialog overflow at ${width}`);
  await page.screenshot({path:output+`cards-${width}.png`});
 }
 await page.getByRole('dialog').getByRole('button',{name:'Ver dieta',exact:true}).first().click();
 await page.getByText('Aportes aproximados',{exact:true}).waitFor();
 await page.getByText('Ver supuestos y fuentes',{exact:true}).click();
 assert.ok(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Detail overflow on mobile');
 await page.screenshot({path:output+'detail-320.png'});
 assert.deepEqual(faults,[]);
 console.log('21 cards with calories/P/F/C, readable names, visible assumptions, widths 320–1440: PASS');
} finally {await browser.close();}
