import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(process.env.NUTHRICK_BROWSER_RUNTIME + '/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({headless:true,channel:'chrome'});
const output = await mkdtemp(join(tmpdir(),'nuthrick-interpretations-'));
try {
  for(const width of [360,768,1280]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4175/tests/visual/interpretations.html');
    await page.getByText('Sobrepeso / preobesidad',{exact:true}).first().waitFor();
    if(await page.getByText('Densidad corporal',{exact:true}).count()) throw Error('Density leaked into Results');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow) throw Error(`Overflow at ${width}`);
    await page.screenshot({path:join(output,`results-${width}.png`),fullPage:true});
    await page.getByText('Ver detalles',{exact:true}).first().click();
    await page.getByRole('link',{name:'Obesity: preventing and managing the global epidemic'}).waitFor({state:'visible'});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error(`Details overflow at ${width}`);
    await page.screenshot({path:join(output,`details-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'Ver método de cálculo'}).first().click();
    await page.getByRole('button',{name:/Densidad corporal/}).click();
    await page.getByText('1.05117',{exact:false}).waitFor({state:'visible'});
    if(errors.length) throw Error(errors.join('\n'));
    console.log(JSON.stringify({width,results:true,details:true,methods:true,overflow:false}));
    await page.close();
  }
  console.log('Screenshots: '+output);
} finally { await browser.close(); }
