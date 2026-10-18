import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = fileURLToPath(new URL('../../../output/announcements/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], apiRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('.supabase.co')) apiRequests.push(request.url()); });
const summary = { responsive: [], video: null };
async function screenshot(view, theme, width) {
  await page.setViewportSize({ width, height: width >= 1200 ? 1100 : 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${view} overflows at ${width} ${theme}`);
  await page.screenshot({ path: `${output}/${view}-${theme}-${width}.png`, fullPage: view !== 'modal' });
  summary.responsive.push({ view, theme, width, overflow: false });
}
try {
  await page.goto('http://127.0.0.1:4197/tests/visual/announcements.html');
  await page.getByRole('heading', { name: 'Anuncios y avisos', exact: true }).waitFor();
  await page.locator('.announcement-rows > li').first().waitFor();
  for (const theme of ['day', 'night']) {
    await page.getByRole('button', { name: theme === 'day' ? 'Tema de día' : 'Tema de noche', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) await screenshot('list', theme, width);
  }
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await page.getByLabel('Título del anuncio').waitFor();
  for (const theme of ['day', 'night']) {
    await page.getByRole('button', { name: theme === 'day' ? 'Tema de día' : 'Tema de noche', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) await screenshot('editor', theme, width);
  }
  const opener = page.getByRole('button', { name: 'Abrir como lo verá el usuario' });
  await opener.click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.locator('dialog img').evaluate(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.getByRole('button', { name: 'Explorar capacitación' }).isDisabled(), true, 'preview CTA does not navigate');
  for (const width of [390, 1440]) await screenshot('modal', 'night', width);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true, 'focus stays inside announcement');
  }
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await opener.evaluate(button => button === document.activeElement), true);
  await page.getByRole('button', { name: 'Tema de día', exact: true }).click();
  await opener.click();
  for (const width of [390, 1440]) await screenshot('modal', 'day', width);
  await page.getByRole('button', { name: 'Cerrar anuncio' }).click();

  // Generate a tiny real WebM locally to verify the upload/player path without
  // relying on remote media or publishing any announcement.
  const videoBase64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(12); const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = []; recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.start();
    for (let frame = 0; frame < 8; frame++) {
      context.fillStyle = '#173e39'; context.fillRect(0, 0, 480, 270); context.fillStyle = '#dcec79'; context.font = 'bold 36px sans-serif'; context.fillText('Nuthrick', 45 + frame * 2, 145);
      await new Promise(resolve => setTimeout(resolve, 85));
    }
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  await page.locator('#announcement-file').setInputFiles({ name: 'nuthrick-demo.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBase64, 'base64') });
  await opener.click();
  const player = page.locator('dialog video'); await player.waitFor();
  await player.evaluate(video => video.play());
  await page.waitForTimeout(200);
  summary.video = await player.evaluate(video => ({ readyState: video.readyState, controls: video.controls, muted: video.muted, autoplay: video.autoplay, currentTime: video.currentTime }));
  assert.ok(summary.video.readyState >= 2); assert.ok(summary.video.controls && summary.video.muted && !summary.video.autoplay);
  await page.screenshot({ path: `${output}/video-modal.png` });
  await page.getByRole('button', { name: 'Cerrar anuncio' }).click();
  assert.equal(await page.locator('dialog video').count(), 0);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('status').filter({ hasText: 'Anuncio publicado' }).waitFor();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByText('Anuncio pausado.', { exact: true }).waitFor();
  assert.equal(await page.locator('.announcement-badge').filter({ hasText: 'Pausado' }).count(), 1);
  assert.deepEqual(errors, []); assert.deepEqual(apiRequests, [], 'preview never calls a live database');
  await writeFile(`${output}/verification.json`, JSON.stringify({ ...summary, errors, liveRequests: apiRequests.length }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
