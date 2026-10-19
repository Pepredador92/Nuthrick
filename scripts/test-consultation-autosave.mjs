// Real local Auth + HTTP + PostgreSQL. Never accepts a remote URL.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const workdir = "tmp/feature-audit-local";
const status = spawnSync("npx", [
  "--yes",
  "supabase@2.121.0",
  "status",
  "--workdir",
  workdir,
  "-o",
  "json",
], { encoding: "utf8" });
assert.equal(status.status, 0, "Start the isolated stack first");
const local = JSON.parse(status.stdout);
assert.equal(local.API_URL, "http://127.0.0.1:55321");
const report = JSON.parse(
  readFileSync(workdir + "/preflight-report.json", "utf8"),
);
const owner = report.fixtures.professional,
  foreign = report.fixtures.admin,
  consultation = report.fixtures.consultation;
async function call(
  path,
  body,
  token = local.SERVICE_ROLE_KEY,
  method = "POST",
) {
  const r = await fetch(local.API_URL + path, {
    method,
    headers: {
      apikey: local.ANON_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { status: r.status, data };
}
async function login(user) {
  const password = randomUUID() + randomUUID();
  assert.equal(
    (await call(
      "/auth/v1/admin/users/" + user.id,
      { password },
      local.SERVICE_ROLE_KEY,
      "PUT",
    )).status,
    200,
  );
  const r = await call("/auth/v1/token?grant_type=password", {
    email: user.email,
    password,
  });
  assert.equal(r.status, 200);
  return r.data.access_token;
}
const token = await login(owner), otherToken = await login(foreign);
for (const value of [owner.id, consultation]) {
  assert.match(value, /^[0-9a-f-]{36}$/);
}
function sql(query) {
  const r = spawnSync("docker", [
    "exec",
    "-i",
    "supabase_db_NuthrickFeatureAudit",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ], { input: query, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
const args = { p_consultation: consultation, p_revision: 1 };
let checks = 0;
const pass = (label) => {
  checks++;
  console.log("PASS " + label);
};
const sync = (body = {}, auth = token) =>
  call("/rest/v1/rpc/sync_consultation_answers", { ...args, ...body }, auth);
const read = async () => {
  const r = await sync();
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
let state = await read();
assert.ok(Number.isSafeInteger(state.version));
pass("atomic owned answer/version read");
const key = "main_reason";
const request = {
  p_version: state.version,
  p_changes: { [key]: "SYNTHETIC AUTOSAVE A" },
  p_request: randomUUID(),
};
let response = await sync(request);
assert.equal(response.status, 200, JSON.stringify(response.data));
assert.equal(response.data.answers[key], request.p_changes[key]);
assert.ok(response.data.version > state.version);
assert.equal(response.data.conflict, false);
state = response.data;
pass("delta save returns a confirmed newer version");
const replay = await sync(request);
assert.equal(replay.status, 200);
assert.equal(replay.data.version, state.version);
pass("same request replay is idempotent");
assert.ok(
  (await sync({ ...request, p_changes: { [key]: "REUSED" } })).status >= 400,
);
pass("request identifier cannot be reused for a different payload");
const oldVersion = state.version;
const newer = await sync({
  p_version: oldVersion,
  p_changes: { [key]: "SYNTHETIC NEWEST" },
  p_request: randomUUID(),
});
assert.equal(newer.status, 200);
state = newer.data;
const late = await sync({
  p_version: oldVersion,
  p_changes: { [key]: "SYNTHETIC LATE" },
  p_request: randomUUID(),
});
assert.equal(late.status, 200);
assert.equal(late.data.conflict, true);
assert.equal(late.data.answers[key], "SYNTHETIC NEWEST");
pass("late old request cannot overwrite a newer answer");
const fenceBase = state.version;
const fence = await sync({
  p_version: fenceBase,
  p_changes: {},
  p_request: randomUUID(),
});
assert.equal(fence.status, 200);
assert.ok(fence.data.version > fenceBase);
state = fence.data;
const fenced = await sync({
  p_version: fenceBase,
  p_changes: { [key]: "DELAYED" },
  p_request: randomUUID(),
});
assert.equal(fenced.data.conflict, true);
assert.equal(fenced.data.answers[key], "SYNTHETIC NEWEST");
pass("empty recovery sync fences an old in-flight request");
const beforeLegacy = await read();
const timestamps = () =>
  call(
    "/rest/v1/consultation_answers?select=question_key,updated_at&consultation_id=eq." +
      consultation,
    undefined,
    token,
    "GET",
  );
const datesBefore = (await timestamps()).data;
const legacy = await call("/rest/v1/rpc/save_consultation_responses", {
  target_consultation: consultation,
  expected_revision: 1,
  responses: { [key]: "OLD TAB OVERWRITE" },
}, token);
assert.ok(legacy.status >= 400);
assert.ok(legacy.data.message.includes("Reload"));
assert.equal((await read()).version, beforeLegacy.version);
pass("old tab without a version cannot overwrite an adopted revision");
sql(`begin;
select set_config('request.jwt.claim.sub','${owner.id}',true);
select public.save_consultation_responses('${consultation}',1,jsonb_build_object('main_reason','SYNTHETIC NEWEST'));
commit;`);
assert.equal((await read()).version, beforeLegacy.version);
assert.deepEqual((await timestamps()).data, datesBefore);
pass("server clinical no-op does not write or bump answer version");
sql(`begin;
select set_config('request.jwt.claim.sub','${owner.id}',true);
select public.save_consultation_responses('${consultation}',1,jsonb_build_object('main_reason','LEGACY SYNTHETIC CHANGE'));
commit;`);
assert.ok((await read()).version > beforeLegacy.version);
pass("checked server clinical writes participate in version checks");
assert.ok((await sync({}, otherToken)).status >= 400);
assert.ok(
  (await sync({
    p_version: state.version,
    p_changes: {},
    p_request: randomUUID(),
  }, otherToken)).status >= 400,
);
pass("foreign owner cannot read or write");
assert.ok((await sync({}, local.ANON_KEY)).status >= 400);
pass("anonymous access denied");
assert.ok((await sync({ p_revision: 999 })).status >= 400);
pass("obsolete questionnaire revision rejected");
assert.ok(
  (await sync({
    p_version: (await read()).version,
    p_changes: { unknown_key: "NO" },
    p_request: randomUUID(),
  })).status >= 400,
);
pass("unknown question key rejected");
state = await read();
const unrelated = Object.entries(state.answers).find(([k]) => k !== key);
const update = await sync({
  p_version: state.version,
  p_changes: { [key]: "" },
  p_request: randomUUID(),
});
assert.equal(update.status, 200);
assert.equal(update.data.answers[key], "");
if (unrelated) {
  assert.deepEqual(update.data.answers[unrelated[0]], unrelated[1]);
}
pass("clearing a field preserves unrelated answers");
sql(`begin;
update public.consultations set status='completed' where id='${consultation}';
select set_config('request.jwt.claim.sub','${owner.id}',true);
set local role authenticated;
do $$ begin
 perform public.sync_consultation_answers('${consultation}',1);
 begin
  perform public.sync_consultation_answers('${consultation}',1,0,'{}',gen_random_uuid());
  raise exception 'test_expected_closed_write_rejection';
 exception when insufficient_privilege then
  if SQLERRM<>'consultation_not_editable' then raise;end if;
 end;
end $$;
rollback;`);
pass("completed consultation remains readable and rejects writes");
assert.ok(
  (await sync({
    p_revision: 999,
    p_version: 0,
    p_changes: {},
    p_request: randomUUID(),
  })).status >= 400,
);
pass("stale revision cannot write an empty recovery fence");
console.log(
  JSON.stringify({
    result: "passed",
    checks,
    environment: "NuthrickFeatureAudit",
    providerCalls: 0,
  }),
);
