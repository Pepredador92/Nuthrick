// Isolated schema clone on LOCAL Supabase only. No production records or provider calls.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const run = promisify(execFile),
  container = "supabase_db_Nuthrick",
  database = `nuthrick_billing_${process.pid}`;
const psql = (db, input) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      db,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
const root = new URL("../", import.meta.url);

try {
  psql("postgres", `create database ${database}`);
  let schema = execFileSync(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--schema-only",
      "--no-owner",
      "-n",
      "public",
      "-n",
      "private",
      "-n",
      "auth",
      "-n",
      "storage",
      "-n",
      "extensions",
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  assert.ok(
    !schema.includes("CREATE TABLE private.platform_admins"),
    "Base local schema must precede ADMIN-1",
  );
  schema = schema
    .replace(
      "CREATE SCHEMA extensions;",
      'CREATE SCHEMA extensions;\nCREATE EXTENSION citext WITH SCHEMA extensions;\nCREATE EXTENSION btree_gist WITH SCHEMA extensions;\nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;\nCREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;',
    )
    .replace(/ALTER DEFAULT PRIVILEGES[^;]+;/g, "");
  psql(database, "drop schema public;\n" + schema);
  psql(
    database,
    "insert into auth.users(id,email,email_confirmed_at) values('90000000-0000-4000-8000-000000000001','legacy@example.test',now());",
  );
  for (
    const name of readdirSync(new URL("supabase/migrations/", root))
      .filter(
        (n) =>
          n.endsWith("_admin_foundation.sql") ||
          n.endsWith("_admin_enforcement.sql"),
      )
      .sort()
  ) {
    psql(
      database,
      "begin;\n" +
        readFileSync(new URL("supabase/migrations/" + name, root), "utf8") +
        "\ncommit;",
    );
  }
  for (
    const name of readdirSync(new URL("supabase/migrations/", root)).filter(
      (n) =>
        n.endsWith("_commercial_configuration.sql") ||
        n.endsWith("_billing_subscriptions_promotions.sql"),
    ).sort()
  ) {
    psql(
      database,
      "begin;\n" +
        readFileSync(new URL("supabase/migrations/" + name, root), "utf8") +
        "\ncommit;",
    );
  }
  console.log("PASS billing migration compiles on isolated local schema");
  if (process.env.BILLING_SCHEMA_ONLY !== "1") {
    psql(
      database,
      readFileSync(new URL("scripts/test-billing.sql", root), "utf8"),
    );
    console.log("PASS billing SQL fixture");
    const snapshot = psql(
      database,
      `select jsonb_build_object('id',s.provider_subscription_id,'intent_id','bc000000-0000-4000-8000-000000000001','customer_id',s.provider_customer_id,'price_id',m.provider_price_id,'status','active','provider_status','active','livemode',false,'period_start',s.period_start,'period_end',s.period_end,'anchor',s.credit_anchor_at,'pending_update',false,'cancel_at_period_end',false,'latest_invoice',jsonb_build_object('id',b.provider_invoice_id,'customer_id',s.provider_customer_id,'subscription_id',s.provider_subscription_id,'price_id',m.provider_price_id,'status','paid','amount_due',b.amount_due,'amount_paid',b.amount_paid,'currency',b.currency,'created',b.issued_at,'paid_at',b.paid_at,'period_start',s.period_start,'period_end',s.period_end,'hosted_url',b.hosted_url)) from private.billing_subscriptions s join private.billing_price_mappings m on m.id=s.price_mapping_id join private.billing_payments b on b.provider_invoice_id=s.latest_invoice_id where s.provider_subscription_id='sub_fixture_a'`,
    ).trim();
    const sqlJson = (value) =>
      "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
    const concurrent = (sql) =>
      run("docker", [
        "exec",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        database,
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ]);
    const countBefore = psql(
      database,
      "select count(*) from private.ai_credit_ledger",
    ).trim();
    const eventTime = Date.now() / 1000;
    await Promise.all(Array.from({ length: 8 }, async () => {
      const lockKey = randomUUID();
      const claim = sqlJson({
        event_id: "evt_concurrent",
        type: "invoice.paid",
        customer_id: "cus_fixture_a",
        subscription_id: "sub_fixture_a",
        created: eventTime,
        livemode: false,
        lock_key: lockKey,
      });
      const apply = sqlJson({
        event_id: "evt_concurrent",
        owner: "ba000000-0000-4000-8000-000000000002",
        lock_key: lockKey,
        subscription: JSON.parse(snapshot),
      });
      for (let n = 0; n < 12; n++) {
        try {
          await concurrent(
            `begin;set local role service_role;do $$declare ctx jsonb;begin ctx:=public.billing_server('claim_event',${claim}); if not coalesce((ctx->>'replay')::boolean,false) then perform public.billing_server('apply',${apply}); end if;end$$;commit;`,
          );
          return;
        } catch (e) {
          if (!e.stderr?.includes("billing_busy") || n === 11) throw e;
        }
      }
    }));
    assert.equal(
      psql(database, "select count(*) from private.ai_credit_ledger").trim(),
      countBefore,
    );
    assert.equal(
      psql(
        database,
        "select count(*) from private.billing_webhook_events where provider_event_id='evt_concurrent' and processed_at is not null",
      ).trim(),
      "1",
    );
    console.log("PASS eight simultaneous verified event retries commit once");
    const allocationsBefore = Number(
      psql(
        database,
        "select count(*) from private.ai_credit_ledger where type='PLAN_ALLOCATION'",
      ).trim(),
    );
    await Promise.all(
      Array.from(
        { length: 8 },
        () =>
          concurrent("select private.billing_tick(now()+interval '2 months')"),
      ),
    );
    assert.equal(
      Number(
        psql(
          database,
          "select count(*) from private.ai_credit_ledger where type='PLAN_ALLOCATION'",
        ).trim(),
      ),
      allocationsBefore + 1,
    );
    console.log("PASS eight simultaneous monthly jobs allocate once");
    const competitor = "ba000000-0000-4000-8000-000000000004";
    psql(
      database,
      `insert into auth.users(id,email,email_confirmed_at) values('${competitor}','billing-concurrent@example.test',now());insert into private.billing_test_accounts(professional_id) values('${competitor}');insert into private.promotion_campaigns(code,name,audience,eligible_plan_ids,intervals,benefits,max_redemptions,starts_at) select 'LASTONE','Concurrent promotion','campaign',array[id],array['monthly'],'[{"type":"percentage_discount","amount":20,"duration":{"kind":"months","months":3}}]',1,now()-interval '1 day' from private.plans where code='esencial';`,
    );
    const essential = psql(
      database,
      "select id from private.plans where code='esencial'",
    ).trim();
    const lastUse = await Promise.allSettled(
      ["ba000000-0000-4000-8000-000000000003", competitor].map((owner) => {
        const data = {
          owner,
          lock_key: randomUUID(),
          operation_key: randomUUID(),
          plan_id: essential,
          interval: "monthly",
          code: "LASTONE",
        };
        return concurrent(
          `begin;set local role service_role;select public.billing_server('lock',${
            sqlJson(data)
          });select public.billing_server('prepare_checkout',${
            sqlJson(data)
          });select public.billing_server('unlock',${sqlJson(data)});commit;`,
        );
      }),
    );
    assert.equal(lastUse.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      lastUse.filter((r) =>
        r.status === "rejected" &&
        r.reason.stderr.includes("promotion_limit_reached")
      ).length,
      1,
    );
    console.log(
      "PASS two professionals cannot reserve the final promotion use",
    );
  }
  if (process.env.BILLING_KEEP_DB === "1") {
    console.log(`LOCAL_DATABASE=${database}`);
  }
} finally {
  if (process.env.BILLING_KEEP_DB !== "1") {
    psql("postgres", `drop database if exists ${database} with (force)`);
  }
}
