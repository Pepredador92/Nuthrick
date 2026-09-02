import assert from 'node:assert/strict';

// Execute the same handler Vercel deploys. Compilation alone does not catch
// missing SSR modules or an HTML error shell returned with HTTP 500.
if (process.env.VERCEL === '1' || process.env.NITRO_PRESET === 'vercel') {
  const { default: handler } = await import('../.vercel/output/functions/__server.func/index.mjs');
  for (const path of ['/', '/login', '/app/consultation-templates/initial']) {
    const response = await handler.fetch(new Request(`https://nuthrick.vercel.app${path}`), {});
    const html = await response.text();
    assert.equal(response.status, 200, `SSR smoke test failed for ${path}: HTTP ${response.status}`);
    assert.ok(!html.includes('id="__next_error__"'), `SSR error shell rendered for ${path}`);
    assert.ok(html.includes('<html'), `HTML document missing for ${path}`);
    console.log(`[SSR smoke] ${path}: OK`);
  }
}
