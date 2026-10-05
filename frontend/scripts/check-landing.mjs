import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
const origin = process.env.LANDING_URL || 'http://127.0.0.1:4188';
const output = new URL('../../output/landing-editorial/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const results=[];
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
    window.__vitals={cls:0,lcp:0};
    new PerformanceObserver(list=>{for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.__vitals.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>{window.__vitals.lcp=list.getEntries().at(-1).startTime;}).observe({type:'largest-contentful-paint',buffered:true});
  });
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('h1').count(),1);
    assert.ok((await page.locator('h1').innerText()).includes('¿Terminó tu consulta…'));
    assert.equal(await page.locator('link[rel=canonical]').count(),1);
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'index, follow');
    assert.equal(await page.locator('script[type="application/ld+json"]').count(),1);
    const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,over:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).map(e=>String(e.className)+':'+e.textContent.slice(0,35))}));
    assert.ok(bounds.scroll<=width,JSON.stringify(bounds));
    // Rotated decorative cards are clipped by their illustration; page overflow is checked above.
    await page.screenshot({path:output+`hero-${width}.png`});
    if(width<1024) {
      await page.getByRole('button',{name:'Abrir menú'}).click();
      await page.getByRole('navigation',{name:'Navegación móvil'}).getByRole('link',{name:'Quién lo creó'}).click();
      assert.equal(await page.getByRole('button',{name:'Abrir menú'}).getAttribute('aria-expanded'),'false');
    }
    await page.locator('#creador').scrollIntoViewIfNeeded();
    await page.locator('#creador').screenshot({path:output+`creador-${width}.png`});
    await page.locator('#precios').screenshot({path:output+`precios-${width}.png`});
    for (const label of ['Cálculos y mediciones', 'Tus pacientes', 'Planes de alimentación']) {
      await page.getByRole('tab',{name:label,exact:true}).click();
      const activePanel=page.getByRole('tabpanel');
      await activePanel.locator('img').evaluate(async img=>await img.decode());
      assert.equal(await activePanel.locator('img').evaluate(img=>img.naturalWidth),1280);
    }
    await page.locator('summary').filter({hasText:'¿Cómo empiezo?'}).click();
    assert.ok(await page.locator('#preguntas details').last().evaluate(node=>node.open));
    for(const picture of await page.locator('main img').all()) {
      await picture.scrollIntoViewIfNeeded();
      await picture.evaluate(async img=>await img.decode());
      assert.ok(await picture.evaluate(img=>img.naturalWidth>0));
    }
    await page.screenshot({path:output+`full-${width}.png`,fullPage:true});
    results.push({width,bounds,vitals:await page.evaluate(()=>window.__vitals),resources:await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.js')).map(e=>({name:e.name.split('/').pop(),bytes:e.decodedBodySize})))});
  }
  // Same server response is useful even with JavaScript disabled.
  const noJs=await browser.newContext({javaScriptEnabled:false});
  const plain=await noJs.newPage();
  await plain.goto(origin);
  assert.equal(await plain.locator('h1').count(),1);
  assert.ok((await plain.locator('#creador').innerText()).includes('Creado por un nutriólogo.'));
  await noJs.close();
  // Public CTA and private route still reach authentication without a session.
  await page.goto(origin);
  await page.locator('[data-cta="hero-register"]').click();
  await page.waitForURL('**/register');
  await page.screenshot({path:output+'register.png'});
  for(const path of ['/app','/admin']) {
    await page.goto(origin+path,{waitUntil:'networkidle'});
    await page.waitForURL(/\/login/);
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'browser-results.json',JSON.stringify(results,null,2));
  console.log('PASS: SSR without JS; 320/390/768/1440px; creator image; navigation; registration; private guards; no browser errors.');
} finally {await browser.close();}
