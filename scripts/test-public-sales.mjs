// Disposable LOCAL database; synthetic proofs; never contacts Stripe/OpenAI.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const base = process.env.BILLING_TEST_DATABASE
  ? ""
  : execFileSync(process.execPath, [
    new URL("scripts/test-live-one.mjs", root).pathname,
  ], {
    env: { ...process.env, LIVE_KEEP_DB: "1" },
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
  });
const database = process.env.BILLING_TEST_DATABASE ??
  base.match(/LOCAL_DATABASE=(nuthrick_billing_\d+)/)?.[1];
assert.match(database ?? "", /^nuthrick_billing_\d+$/);
const sql = (q) =>
  execFileSync("docker", [
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
  ], { input: q, encoding: "utf8", maxBuffer: 25 * 1024 * 1024 });
try {
  let q = `begin;
 insert into private.billing_live_allowlist(professional_id,enabled,authorized_by,reason) values('1e000000-0000-4000-8000-000000000001',true,(select user_id from private.platform_admins limit 1),'Synthetic regression');
 update public.professional_profiles set onboarding_completed=true where id='1e000000-0000-4000-8000-000000000001';
 insert into private.ai_feature_config(feature,prompt_version) values('recall_24h','recall_24h@1'),('pes_diagnosis','pes_diagnosis@1'),('diet_draft','diet_draft@2');
`;
  for (
    const file of [
      "20260930200548_controlled_ai_credit_pilot.sql",
      "20260930204511_live_ai_production.sql",
      "20261002065042_public_subscription_sales.sql",
    ]
  ) {
    q += readFileSync(new URL("supabase/migrations/" + file, root), "utf8")
      .replace(/^begin;/, "").replace(/commit;\s*$/, "");
  }
  q += readFileSync(new URL("scripts/test-public-sales.sql", root), "utf8");
  q +=
    `create temporary table original_catalog as select p.id,p.monthly_price,p.annual_price,pe.value as patients from private.plans p join private.plan_entitlements pe on pe.plan_id=p.id and pe.entitlement_key='patients.limit';`;
  q += readFileSync(
    new URL(
      "supabase/migrations/20261002065056_commercial_plan_ai_split.sql",
      root,
    ),
    "utf8",
  ).replace(/^begin;/, "").replace(/commit;\s*$/, "");
  q +=
    `select pg_temp.sales_assert(not exists(select 1 from private.plan_entitlements pe join private.plans p on p.id=pe.plan_id where p.code='esencial' and pe.entitlement_key like 'ai.%' and pe.value not in ('false'::jsonb,'0'::jsonb)), 'Esencial cannot generate or purchase AI');
 select pg_temp.sales_assert((select value='true'::jsonb from private.plan_entitlements pe join private.plans p on p.id=pe.plan_id where p.code='profesional' and pe.entitlement_key='ai.diet_draft'),'Profesional includes AI');
 select pg_temp.sales_assert(not exists(select 1 from original_catalog o join private.plans p using(id) join private.plan_entitlements pe on pe.plan_id=p.id and pe.entitlement_key='patients.limit' where p.monthly_price is distinct from o.monthly_price or p.annual_price is distinct from o.annual_price or pe.value is distinct from o.patients),'Prices and patient limits preserved');
 `;
  q += readFileSync(
    new URL(
      "supabase/migrations/20261002065058_admin_commercial_costs.sql",
      root,
    ),
    "utf8",
  ).replace(/^begin;/, "").replace(/commit;\s*$/, "");
  q +=
    `select set_config('request.jwt.claim.sub','1e000000-0000-4000-8000-000000000003',true);
 select pg_temp.sales_reject('select public.admin_commercial_costs()','admin_required');
 select set_config('request.jwt.claim.sub',(select user_id::text from private.platform_admins limit 1),true);
 select pg_temp.sales_assert(public.admin_commercial_costs() ? 'features','Admin can read configured conversion');
 select pg_temp.sales_assert(not has_function_privilege('anon','public.admin_commercial_costs()','execute'),'Anonymous cannot read commercial costs');
 rollback;`;

  sql(q);
  console.log(
    "PASS public sales routing, closed switch, legal gate, server-only refresh and TEST isolation",
  );
} finally {
  if (!process.env.BILLING_TEST_DATABASE) {
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
