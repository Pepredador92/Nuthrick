// Run the existing visual fixture servers (4175 and 4198) before capturing.
// These render production components with synthetic data, never patient records.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../public/images/landing/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  // No remote account/data access is needed by these fixtures.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.setViewportSize({ width: 1344, height: 1050 });
  await page.goto('http://127.0.0.1:4175/tests/visual/menu.html?weekly', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Plan por días', exact: true }).click();
  await page.getByRole('button', { name: 'Organizar días', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar calendario', exact: true }).click();
  const menu = await page.locator('main > section').first().boundingBox();
  assert.equal(menu.width, 1280);
  await page.screenshot({ path: output + 'nuthrick-planes.png', clip: { x: menu.x, y: menu.y, width: 1280, height: 900 } });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4175/tests/visual/interpretations.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: output + 'nuthrick-calculos.png' });
  await page.setViewportSize({ width: 1530, height: 1050 });
  await page.goto('http://127.0.0.1:4198/tests/visual/workspace.html?view=patients', { waitUntil: 'networkidle' });
  await page.getByText('Ana Martínez López').first().waitFor();
  const patients = await page.locator('main').boundingBox();
  assert.equal(patients.width, 1280);
  await page.screenshot({ path: output + 'nuthrick-pacientes.png', clip: { x: patients.x, y: patients.y, width: 1280, height: 900 } });
  assert.deepEqual(faults, []);
  console.log('Captured three real Nuthrick screens with synthetic data.');
} finally { await browser.close(); }
