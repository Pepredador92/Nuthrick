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
    for (const path of ["/", "/login", "/app/consultation-templates/initial"]) {
      const response = await handler.fetch(
        new Request(`https://nuthrick.vercel.app${path}`),
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
  } finally {
    await rm(isolatedDir, { recursive: true, force: true });
  }
}
