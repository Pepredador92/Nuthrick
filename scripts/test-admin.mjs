// Isolated schema clone on LOCAL Supabase only. No production records or provider calls.
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
const run = promisify(execFile),
  container = "supabase_db_Nuthrick",
  database = `nuthrick_admin_${process.pid}`;
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
const restName = `nuthrick-admin-rest-${process.pid}`;
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
  for (const name of readdirSync(new URL("supabase/migrations/", root))
    .filter(
      (n) =>
        n.endsWith("_admin_foundation.sql") ||
        n.endsWith("_admin_enforcement.sql"),
    )
    .sort())
    psql(
      database,
      "begin;\n" +
        readFileSync(new URL("supabase/migrations/" + name, root), "utf8") +
        "\ncommit;",
    );
  assert.equal(
    psql(
      database,
      "select private.resolve_effective_entitlements('90000000-0000-4000-8000-000000000001')->>'allowed'",
    ).trim(),
    "true",
  );
  assert.equal(
    psql(database, "select count(*) from private.platform_admins").trim(),
    "0",
  );
  console.log("PASS legacy continuity without admin elevation");
  psql(database, readFileSync(new URL("scripts/test-admin.sql", root), "utf8"));
  console.log(
    "PASS SQL authorization, plans, resolver, courtesy, credits, codes, suspension and isolation",
  );
  const admin = "d0000000-0000-4000-8000-000000000001",
    a = "d0000000-0000-4000-8000-000000000002",
    b = "d0000000-0000-4000-8000-000000000003";
  psql(
    database,
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','concurrent-admin@example.test',now()),('${a}','concurrent-a@example.test',now()),('${b}','concurrent-b@example.test',now());insert into private.platform_admins(user_id) values('${admin}');`,
  );
  const concurrent = (actor, q) =>
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
      `begin;select set_config('request.jwt.claim.sub','${actor}',true);set local role authenticated;${q};commit;`,
    ]);
  const adjustment = `select public.admin_api('adjust_credits','{"professional_id":"${a}","amount":300,"operation_key":"d1000000-0000-4000-8000-000000000001","reason":"concurrency"}')`;
  await Promise.all(
    Array.from({ length: 8 }, () => concurrent(admin, adjustment)),
  );
  assert.equal(
    psql(
      database,
      `select purchased_credits from private.ai_accounts where professional_id='${a}'`,
    ).trim(),
    "300.000",
  );
  assert.equal(
    psql(
      database,
      `select count(*) from private.ai_credit_ledger where professional_id='${a}'`,
    ).trim(),
    "1",
  );
  console.log("PASS eight concurrent credit retries produce one ledger entry");
  const withdrawals = await Promise.allSettled(
    [1, 2].map((n) =>
      concurrent(
        admin,
        `select public.admin_api('adjust_credits','{"professional_id":"${a}","amount":-200,"operation_key":"d2000000-0000-4000-8000-00000000000${n}","reason":"withdraw"}')`,
      ),
    ),
  );
  assert.equal(withdrawals.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    psql(
      database,
      `select purchased_credits from private.ai_accounts where professional_id='${a}'`,
    ).trim(),
    "100.000",
  );
  console.log("PASS concurrent withdrawals cannot overdraw");
  psql(
    database,
    `insert into private.access_codes(code_hash,name,plan_id,duration_days,max_redemptions,starts_at,expires_at) select encode(sha256(convert_to('CONCURRENT','UTF8')),'hex'),'Concurrency',id,90,1,now()-interval '1 hour',now()+interval '1 day' from private.plans where code='beta';`,
  );
  const redemption = await Promise.allSettled(
    [a, b].map((id) =>
      concurrent(id, "select public.redeem_access_code('CONCURRENT')"),
    ),
  );
  assert.equal(redemption.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    psql(
      database,
      "select redeemed_count from private.access_codes where name='Concurrency'",
    ).trim(),
    "1",
  );
  console.log("PASS last code use cannot be redeemed twice concurrently");

  const winner = psql(
    database,
    "select professional_id from private.access_code_redemptions limit 1",
  ).trim();
  await concurrent(
    admin,
    `select public.admin_api('set_override',jsonb_build_object('professional_id','${winner}','entitlement_key','patients.limit','value',1,'starts_at',now()-interval '1 hour','reason','quota concurrency'))`,
  );
  const patientRace = await Promise.allSettled(
    [1, 2].map(() =>
      concurrent(
        winner,
        `insert into public.patients(full_name) values('SYNTHETIC QUOTA')`,
      ),
    ),
  );
  assert.equal(patientRace.filter((r) => r.status === "fulfilled").length, 1);
  console.log("PASS patient quota is atomic across concurrent insertions");
  const patient = psql(
    database,
    `select id from public.patients where professional_id='${winner}' limit 1`,
  ).trim();
  await concurrent(
    admin,
    `select public.admin_api('set_override',jsonb_build_object('professional_id','${winner}','entitlement_key','consultations.monthly_limit','value',1,'starts_at',now()-interval '1 hour','reason','quota concurrency'))`,
  );
  const consultationRace = await Promise.allSettled(
    [1, 2].map(() =>
      concurrent(
        winner,
        `insert into public.consultations(patient_id,created_at) values('${patient}',now()-interval '2 months')`,
      ),
    ),
  );
  assert.equal(
    consultationRace.filter((r) => r.status === "fulfilled").length,
    1,
  );
  console.log("PASS monthly consultation quota cannot be backdated or raced");
  // Real PostgREST role switching and HTTP status, with a dedicated local-only JWT.
  const dbInfo = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0];
  const password = dbInfo.Config.Env.find((v) =>
    v.startsWith("POSTGRES_PASSWORD="),
  ).slice("POSTGRES_PASSWORD=".length);
  const network = Object.keys(dbInfo.NetworkSettings.Networks)[0],
    secret = "nuthrick-admin-isolated-test-key-32-characters";
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      restName,
      "--network",
      network,
      "-p",
      "127.0.0.1:55431:3000",
      "-e",
      `PGRST_DB_URI=postgresql://postgres:${encodeURIComponent(password)}@${container}:5432/${database}`,
      "-e",
      "PGRST_DB_ANON_ROLE=anon",
      "-e",
      "PGRST_DB_SCHEMAS=public",
      "-e",
      `PGRST_JWT_SECRET=${secret}`,
      "public.ecr.aws/supabase/postgrest:v16.1",
    ],
    { stdio: "pipe" },
  );
  const sign = (sub) => {
    const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url"),
      payload = Buffer.from(
        JSON.stringify({
          role: "authenticated",
          sub,
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString("base64url");
    return `${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
  };
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:55431/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const http = (token, body) =>
    fetch("http://127.0.0.1:55431/rpc/admin_api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await http(sign(admin), { p_action: "overview" })).status, 200);
  assert.equal((await http(sign(a), { p_action: "overview" })).status, 403);
  assert.equal((await http(null, { p_action: "overview" })).status, 401);
  const listing = await (
    await http(sign(admin), { p_action: "professionals" })
  ).json();
  assert.ok(listing.items.some((p) => p.id === winner));
  assert.ok(
    listing.items.every((p) => !("patients" in p) && !("consultations" in p)),
  );
  console.log(
    "PASS actual PostgREST: admin 200, professional 403, anonymous 401, minimal projection",
  );
  console.log("OPENAI CALLS = 0");
} finally {
  try {
    execFileSync("docker", ["stop", restName], { stdio: "ignore" });
  } catch {}
  psql("postgres", `drop database if exists ${database} with (force)`);
}
