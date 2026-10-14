import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('../../../output/academy/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], requestsToSupabase = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('.supabase.co')) requestsToSupabase.push(request.url().split('?')[0]); });
const summary = { responsive: [], playback: null };
try {
  await page.goto('http://127.0.0.1:4196/tests/visual/training.html');
  await page.getByRole('heading', { name: 'Academia Nuthrick', exact: true }).waitFor();
  assert.equal(await page.locator('.academy-video').count(), 5);
  assert.equal(await page.locator('iframe').count(), 0);
  for (const theme of ['day', 'night']) {
    await page.getByRole('button', { name: theme === 'day' ? 'Tema de día' : 'Tema de noche', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= dimensions.viewport, `Academy overflows at ${width} (${theme})`);
      await page.screenshot({ path: `${output}/academy-${theme}-${width}.png`, fullPage: true });
      summary.responsive.push({ view: 'academy', theme, width, overflow: false });
    }
  }
  const opener = page.getByRole('button', { name: 'Ver video: ¿Dónde está cada cosa en Nuthrick?' });
  await opener.click();
  await page.getByRole('dialog').waitFor();
  assert.equal(browser.contexts()[0].pages().length, 1);
  assert.ok((await page.locator('iframe').getAttribute('src')).includes('youtube-nocookie.com/embed/Nw6ZwFHWoqI'));
  try {
    const video = page.frameLocator('iframe').locator('video');
    await video.waitFor({ timeout: 20000, state: 'attached' });
    await video.evaluate(video => new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      setTimeout(resolve, 10000);
    }));
    summary.playback = await video.evaluate(video => ({ readyState: video.readyState, paused: video.paused, currentTime: video.currentTime }));
    if (summary.playback.readyState === 0) summary.playback.playerText = await page.frameLocator('iframe').locator('body').innerText();
  } catch {
    summary.playback = { available: false, note: 'No accessible video element in this headless browser.', playerText: await page.frameLocator('iframe').locator('body').innerText({ timeout: 3000 }).catch(() => 'Frame did not load.') };
  }
  await page.screenshot({ path: `${output}/video-modal.png` });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement)), true, 'Focus stays inside the native dialog');
  await page.getByRole('button', { name: 'Cerrar video' }).click();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await opener.evaluate(button => button === document.activeElement), true);
  await opener.click();
  // YouTube owns keyboard events inside its cross-origin player. Exercise
  // native dialog Escape while one of Nuthrick's modal controls has focus.
  await page.getByRole('button', { name: 'Cerrar video' }).focus();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await opener.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.screenshot({ path: `${output}/video-modal-${width}.png` });
    await page.getByRole('button', { name: 'Cerrar video' }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await opener.click();
  await page.mouse.click(3, 3);
  await page.getByRole('dialog').waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByRole('heading', { name: 'Capacitación', exact: true }).waitFor();
  for (const theme of ['day', 'night']) {
    await page.getByRole('button', { name: theme === 'day' ? 'Tema de día' : 'Tema de noche', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= dimensions.viewport, `Admin overflows at ${width} (${theme})`);
      await page.screenshot({ path: `${output}/admin-${theme}-${width}.png`, fullPage: true });
      summary.responsive.push({ view: 'admin', theme, width, overflow: false });
    }
  }
  await page.getByRole('button', { name: 'Subir ¿Cómo agenda una cita un paciente en Nuthrick?' }).click();
  assert.equal(await page.locator('.training-rows > li').nth(3).locator('h3').textContent(), '¿Cómo agenda una cita un paciente en Nuthrick?');
  const profileRow = page.locator('.training-rows > li').filter({ hasText: 'Completa tu perfil profesional en Nuthrick' });
  await profileRow.getByRole('button', { name: 'Ocultar', exact: true }).click();
  await page.getByRole('button', { name: 'Espacio profesional', exact: true }).click();
  await page.getByText('4 videos', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Completa tu perfil profesional en Nuthrick', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Ejemplo local');
  await page.getByLabel('Enlace de YouTube').fill('https://youtu.be/abcdefghijk');
  await page.getByLabel('Descripción breve').fill('Video sintético para verificar el editor.');
  await page.getByRole('button', { name: 'Agregar video', exact: true }).click();
  await page.getByText('4 publicados · 6 en total', { exact: true }).waitFor();
  const example = page.locator('.training-rows > li').filter({ hasText: 'Ejemplo local' });
  await example.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Ejemplo editado');
  await page.getByLabel('Visible en Academia Nuthrick').check();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('5 publicados · 6 en total', { exact: true }).waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.training-rows > li').filter({ hasText: 'Ejemplo editado' }).getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByText('4 publicados · 5 en total', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tema de día', exact: true }).click();
  await page.screenshot({ path: `${output}/admin-overview.png` });
  await page.getByRole('button', { name: 'Espacio profesional', exact: true }).click();
  await page.getByRole('heading', { name: 'Academia Nuthrick', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/academy-overview.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(requestsToSupabase, []);
  summary.interactions = 'Modal, focus restoration, Escape, backdrop, reorder, visibility, create, edit, publish and delete passed.';
  await writeFile(`${output}/browser-results.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
