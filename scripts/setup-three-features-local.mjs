// Creates only NuthrickFeatureAudit on ports 553xx. Never links a remote project.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const workdir = "tmp/feature-audit-local";
const project = "NuthrickFeatureAudit";
const migrationBoundary = "20260930200548";
const cli = (args, quiet = false) => {
  const r = spawnSync("npx", [
    "--yes",
    "supabase@2.121.0",
    ...args,
    "--workdir",
    workdir,
  ], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr || "Local Supabase command failed");
  if (!quiet) console.log(`PASS supabase ${args.slice(0, 2).join(" ")}`);
  return r.stdout;
};
function sql(query) {
  const r = spawnSync("docker", [
    "exec",
    "-i",
    `supabase_db_${project}`,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ], {
    input: query,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const migrations = readdirSync("supabase/migrations").filter((f) =>
  f.endsWith(".sql")
).sort();
const configPath = `${workdir}/supabase/config.toml`;
const container = spawnSync("docker", ["inspect", `supabase_db_${project}`], {
  encoding: "utf8",
});
if (container.status === 0) {
  assert.ok(
    existsSync(configPath),
    "Existing audit container requires its matching config",
  );
  assert.match(
    readFileSync(configPath, "utf8"),
    /project_id = "NuthrickFeatureAudit"/,
  );
  const local = JSON.parse(cli(["status", "-o", "json"], true));
  assert.equal(local.API_URL, "http://127.0.0.1:55321");
  assert.equal(
    sql("select max(version) from supabase_migrations.schema_migrations"),
    migrations.at(-1).slice(0, 14),
    "Existing audit stack has incomplete migrations; inspect it before resuming",
  );
  console.log("PASS existing isolated audit stack is ready");
  process.exit(0);
}
// Refuse to overwrite a stopped stack, its reports or its saved credentials.
assert.ok(
  !existsSync(configPath),
  "Archive the old isolated workdir before creating a fresh stack",
);
mkdirSync(`${workdir}/supabase/migrations`, { recursive: true });
let config = readFileSync("supabase/config.toml", "utf8")
  .replace('project_id = "Nuthrick"', `project_id = "${project}"`)
  .replace(/\b543(\d\d)\b/g, "553$1")
  .replace(/(\[db\.migrations\][\s\S]*?enabled = )true/, "$1false")
  .replace(/(\[db\.seed\][\s\S]*?enabled = )true/, "$1false");
assert.match(config, /project_id = "NuthrickFeatureAudit"/);
assert.match(config, /port = 55321/);
writeFileSync(configPath, config);
cli([
  "start",
  "--exclude",
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
]);
config = config.replace(
  /(\[db\.migrations\][\s\S]*?enabled = )false/,
  "$1true",
);
writeFileSync(configPath, config);
for (
  const name of migrations.filter((f) => f.slice(0, 14) < migrationBoundary)
) {
  copyFileSync(
    `supabase/migrations/${name}`,
    `${workdir}/supabase/migrations/${name}`,
  );
}
cli(["db", "push", "--local", "--yes"]);

// The historical controlled-pilot migration requires one active Live account.
// These are local fake billing rows. There is no Stripe client or network call.
const local = JSON.parse(cli(["status", "-o", "json"], true));
assert.equal(local.API_URL, "http://127.0.0.1:55321");
const response = await fetch(local.API_URL + "/auth/v1/admin/users", {
  method: "POST",
  headers: {
    apikey: local.ANON_KEY,
    authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    email: `historical-pilot-${randomUUID()}@example.test`,
    password: randomUUID() + randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: "SYNTHETIC HISTORICAL PILOT" },
  }),
});
assert.equal(response.status, 200, "Create local historical identity");
const owner = (await response.json()).id;
assert.match(owner, /^[a-f0-9-]{36}$/);
sql(`begin;
select cron.alter_job(jobid,active:=false) from cron.job;
select set_config('nuthrick.billing_apply','true',true);
insert into public.professional_profiles(id,full_name,onboarding_completed) values('${owner}','SYNTHETIC HISTORICAL PILOT',true) on conflict(id) do update set onboarding_completed=true;
insert into private.billing_price_mappings(plan_id,interval,mode,amount,currency,fingerprint) select id,'monthly','live',100,'MXN','local-historical-pilot' from private.plans where code='profesional';
insert into private.professional_access(professional_id,plan_id,status,source,billing_mode,starts_at,ends_at) select '${owner}',id,'active','billing','live',now()-interval '1 day',now()+interval '30 days' from private.plans where code='profesional' on conflict(professional_id) do update set plan_id=excluded.plan_id,status='active',source='billing',billing_mode='live',starts_at=excluded.starts_at,ends_at=excluded.ends_at;
insert into private.billing_customers(professional_id,mode,provider_customer_id) values('${owner}','live','cus_synthetic_bootstrap');
insert into private.billing_subscriptions(professional_id,mode,provider_subscription_id,provider_customer_id,price_mapping_id,state,provider_status,period_start,period_end,credit_anchor_at,paid_through,manual_hold) select '${owner}','live','sub_synthetic_bootstrap','cus_synthetic_bootstrap',id,'active','active',now()-interval '1 day',now()+interval '30 days',now()-interval '1 day',now()+interval '30 days',false from private.billing_price_mappings where fingerprint='local-historical-pilot';
insert into private.billing_live_allowlist(professional_id,enabled,authorized_by,reason) values('${owner}',true,'${owner}','Synthetic isolated fixture for historical migration');
commit;`);
writeFileSync(`${workdir}/bootstrap-identity.json`, JSON.stringify({ owner }), {
  mode: 0o600,
});
for (
  const name of migrations.filter((f) => f.slice(0, 14) >= migrationBoundary)
) {
  copyFileSync(
    `supabase/migrations/${name}`,
    `${workdir}/supabase/migrations/${name}`,
  );
}
cli(["db", "push", "--local", "--yes"]);
sql("select cron.alter_job(jobid,active:=false) from cron.job");
assert.equal(
  sql("select max(version) from supabase_migrations.schema_migrations"),
  migrations.at(-1).slice(0, 14),
);
console.log(
  "PASS isolated Auth, Storage and all migrations are ready; run scripts/test-three-features-local.mjs",
);
