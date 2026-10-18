import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = fileURLToPath(new URL('../../../output/pes-review/', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], remoteRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/supabase\.co|api\.openai\.com/.test(request.url())) remoteRequests.push(request.url()); });
const screenshots = [];
try {
  await page.goto('http://127.0.0.1:4182/tests/visual/clinical-copilot.html');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('button', { name: 'Generar borrador', exact: true }).click();
  await page.getByRole('heading', { name: 'Borrador de diagnóstico PES' }).waitFor();
  const statement = page.getByLabel('Enunciado PES final', { exact: true });
  assert.equal(await statement.evaluate(element => element.tagName), 'OUTPUT');
  assert.match(await statement.textContent(), /Ingesta oral insuficiente relacionado con.*evidenciado por/s);
  assert.equal(await page.getByLabel('Problema', { exact: true }).count(), 1);
  await page.getByLabel('Etiología', { exact: true }).fill('disminución del apetito confirmada en entrevista');
  assert.match(await statement.textContent(), /relacionado con disminución del apetito confirmada en entrevista,/);
  await page.getByLabel('Signos y síntomas', { exact: true }).fill('consumo registrado de 1200 kcal\npérdida de apetito referida\n');
  assert.match(await statement.textContent(), /1200 kcal; pérdida de apetito referida\.$/);
  assert.equal(await page.getByLabel('Signos y síntomas', { exact: true }).inputValue(), 'consumo registrado de 1200 kcal\npérdida de apetito referida\n');
  for (const theme of ['day', 'night']) {
    await page.getByRole('button', { name: theme === 'day' ? 'Tema de día' : 'Tema de noche', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `Overflow at ${width} ${theme}`);
      const path = `${directory}/pes-${theme}-${width}.png`;
      await page.screenshot({ path, fullPage: true }); screenshots.push(path);
    }
  }
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await page.getByText('PES aprobado.', { exact: true }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-pes-parts')));
  assert.equal(saved.pes_evidence, 'consumo registrado de 1200 kcal\npérdida de apetito referida');
  assert.match(saved.pes_statement, /1200 kcal; pérdida de apetito referida\.$/);
  await page.reload();
  await page.getByText('Enunciado guardado', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Enunciado PES final').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
  await writeFile(`${directory}/verification.json`, JSON.stringify({ screenshots, errors, remoteRequests, saved }, null, 2));
  console.log(JSON.stringify({ responsiveViews: screenshots.length, currentAndPreviousMeasurements: true, statementComposed: true, reloadPreserved: true, remoteRequests: remoteRequests.length }));
} finally { await browser.close(); }
