import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const run = promisify(execFile), root = new URL("../", import.meta.url);
const base = execFileSync(process.execPath, [
  new URL("scripts/test-billing.mjs", root).pathname,
], {
  env: { ...process.env, BILLING_SCHEMA_ONLY: "1", BILLING_KEEP_DB: "1" },
  encoding: "utf8",
  maxBuffer: 25 * 1024 * 1024,
});
const database = base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.ok(database);
const args = [
  "exec",
  "-i",
  "supabase_db_Nuthrick",
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  database,
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (q) =>
  execFileSync("docker", args, {
    input: q,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
const concurrent = (q) => run("docker", [...args, "-c", q]);
try {
  sql(
    "begin;" +
      readFileSync(
        new URL(
          "supabase/migrations/20260925035115_ai_credit_purchases.sql",
          root,
        ),
        "utf8",
      ) + "commit;",
  );
  console.log("PASS ADMIN-3 migration compiles");
  sql(readFileSync(new URL("scripts/test-billing.sql", root), "utf8"));
  console.log("PASS ADMIN-2 SQL regression");
  sql(readFileSync(new URL("scripts/test-credit-purchases.sql", root), "utf8"));
  console.log("PASS ADMIN-3 SQL fixture");
  await Promise.all(Array.from({ length: 8 }, (_, i) =>
    (async () => {
      for (let n = 0; n < 20; n++) {
        try {
          await concurrent(
            `select admin3_test.event('cd300000-0000-4000-8000-000000000003','evt_credit_concurrent_${
              i % 2
            }')`,
          );
          return;
        } catch (e) {
          if (!e.stderr?.includes("billing_busy") || n === 19) throw e;
        }
      }
    })()));
  assert.equal(
    sql(
      "select count(*) from private.ai_credit_ledger where credit_purchase_id='cd300000-0000-4000-8000-000000000003' and type='PURCHASE'",
    ).trim(),
    "1",
  );
  assert.equal(
    sql(
      "select purchased_credits from private.ai_accounts where professional_id='ca300000-0000-4000-8000-000000000004'",
    ).trim(),
    "1000.000",
  );
  console.log("PASS 8 concurrent workers, 2 event IDs, one purchase grant");
  const promotion = await Promise.allSettled(
    [5, 6].map((i) =>
      concurrent(
        `select admin3_test.prepare('ca300000-0000-4000-8000-${
          String(i).padStart(12, "0")
        }','cb300000-0000-4000-8000-000000000003','TEST_LAST')`,
      )
    ),
  );
  assert.equal(promotion.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    promotion.find((r) => r.status === "rejected").reason.stderr,
    /promotion_limit_reached/,
  );
  console.log("PASS concurrent promotion final-use limit");
  if (process.env.CREDIT_KEEP_DB === "1") {
    console.log("LOCAL_DATABASE=" + database);
  }
} finally {
  if (process.env.CREDIT_KEEP_DB !== "1") {
    execFileSync("docker", [
      "exec",
      "supabase_db_Nuthrick",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      `drop database ${database} with (force)`,
    ]);
  }
}
