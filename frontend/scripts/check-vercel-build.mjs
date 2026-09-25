import { PUBLIC_SITE_ORIGIN, TECHNICAL_SITE_ORIGIN, siteOrigin } from '../../supabase/functions/_shared/site.ts';
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Execute the same handler Vercel deploys. Compilation alone does not catch
// missing SSR modules or an HTML error shell returned with HTTP 500.
if (process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel") {
  // A build inside the repository can silently find omitted dependencies in
  // node_modules. A deployment must work without that directory.
  const isolatedDir = await mkdtemp(join(tmpdir(), "nuthrick-build-check-"));
  try {
    await cp(
      new URL("../.vercel/output/functions/__server.func", import.meta.url),
      isolatedDir,
      { recursive: true },
    );
    const { default: handler } = await import(
      pathToFileURL(join(isolatedDir, "index.mjs")).href
    );
    for (const path of [
      "/",
      "/login",
      "/app/consultation-templates/initial",
      "/admin",
      "/admin/plans",
      "/admin/promotions",
      "/admin/subscriptions",
      "/admin/payments",
      "/admin/billing",
      "/app/my-plan",
      "/planes",
    ]) {
      const response = await handler.fetch(
        new Request(`${TECHNICAL_SITE_ORIGIN}${path}`),
        {},
      );
      const html = await response.text();
      assert.equal(
        response.status,
        200,
        `SSR smoke test failed for ${path}: HTTP ${response.status}`,
      );
      assert.ok(
        !html.includes('id="__next_error__"'),
        `SSR error shell rendered for ${path}`,
      );
      assert.ok(html.includes("<html"), `HTML document missing for ${path}`);
      console.log(`[SSR smoke, isolated] ${path}: OK`);
    }
    const canonical = siteOrigin(process.env.NEXT_PUBLIC_SITE_URL || PUBLIC_SITE_ORIGIN);
    for (const path of ['/', '/privacy', '/terms', '/refunds', '/p/domain-check']) {
      const response = await handler.fetch(new Request(`${TECHNICAL_SITE_ORIGIN}${path}`), {});
      const html = await response.text();
      assert.equal(response.status, 200);
      const href = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
      assert.ok(href, `Canonical missing: ${path}`);
      assert.equal(new URL(href).toString(), new URL(path, canonical).toString());
      if (path === '/') assert.ok(html.includes(`${canonical}/og.png`), 'Open Graph must use the public domain');
    }
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const response = await handler.fetch(new Request(`${TECHNICAL_SITE_ORIGIN}${path}`), {});
      const body = await response.text();
      assert.equal(response.status, 200, path);
      assert.ok(body.includes(canonical), `${path} must reference canonical domain`);
      assert.ok(!body.includes(TECHNICAL_SITE_ORIGIN), `${path} must not advertise fallback`);
      assert.ok(!body.includes('<html'), `${path} is a metadata route, not the app shell`);
    }
    console.log('[SSR smoke, isolated] canonical, Open Graph, robots and sitemap: OK');
  } finally {
    await rm(isolatedDir, { recursive: true, force: true });
  }
}
