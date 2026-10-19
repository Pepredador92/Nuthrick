// Isolated project only. Auth/Storage/PostgREST are real, never mocked.
// --real-ai opts into at most one generation per feature, with durable markers
// and a USD 0.05 maximum configured provider budget. Reruns reuse saved output.
import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";
import {
  composeObjective,
  objectiveIssues,
} from "../supabase/functions/_shared/objectives.ts";
import { composePesStatement } from "../supabase/functions/_shared/pes.ts";
import {
  isStrategyDocument,
  strategyIssues,
} from "../supabase/functions/_shared/interventions.ts";

const real = process.argv.includes("--real-ai");
const workdir = "tmp/feature-audit-local";
const reportPath = `${workdir}/${real ? "real-ai" : "preflight"}-report.json`;
const report = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : { checks: [], attempts: {}, fixtures: {} };
report.checks = report.checks.filter((label) => !/^(png|mp4):/.test(label));
const save = () =>
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
const pass = (label) => {
  if (!report.checks.includes(label)) report.checks.push(label);
  save();
  console.log("PASS " + label);
};
const cli = spawnSync("npx", [
  "--yes",
  "supabase@2.121.0",
  "status",
  "--workdir",
  workdir,
  "-o",
  "json",
], { encoding: "utf8" });
assert.equal(cli.status, 0, "Start the isolated local project first");
const local = JSON.parse(cli.stdout);
assert.equal(
  local.API_URL,
  "http://127.0.0.1:55321",
  "Remote Supabase is forbidden",
);
assert.match(
  readFileSync(`${workdir}/supabase/config.toml`, "utf8"),
  /project_id = "NuthrickFeatureAudit"/,
);
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
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ], { input: query, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const latestMigration = readdirSync("supabase/migrations").filter((f) =>
  f.endsWith(".sql")
).sort().at(-1).slice(0, 14);
assert.equal(
  sql("select max(version) from supabase_migrations.schema_migrations"),
  latestMigration,
  "Apply all migrations first",
);
sql("select cron.alter_job(jobid,active:=false) from cron.job;");
async function api(
  path,
  body,
  token = local.SERVICE_ROLE_KEY,
  method = "POST",
  extra = {},
) {
  const r = await fetch(local.API_URL + path, {
    method,
    headers: {
      apikey: local.ANON_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data };
}
async function rpc(name, body, token) {
  const r = await api("/rest/v1/rpc/" + name, body, token);
  assert.ok(
    [200, 204].includes(r.status),
    `${name}: ${r.status} ${r.data?.message ?? r.data?.error ?? ""}`,
  );
  return r.data;
}
const one = (result) => Array.isArray(result) ? result[0] : result;
async function identity(kind) {
  const password = randomUUID() + randomUUID();
  let user = report.fixtures[kind];
  if (!user) {
    const email = `${kind}-${randomUUID()}@example.test`;
    const created = await api("/auth/v1/admin/users", {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `SYNTHETIC FEATURE AUDIT ${kind}` },
    });
    assert.equal(created.status, 200, "Create local identity");
    user = { id: created.data.id, email };
    report.fixtures[kind] = user;
    save();
  } else {assert.equal(
      (await api(
        "/auth/v1/admin/users/" + user.id,
        { password },
        local.SERVICE_ROLE_KEY,
        "PUT",
      )).status,
      200,
      "Reset fixture password",
    );}
  const login = await api("/auth/v1/token?grant_type=password", {
    email: user.email,
    password,
  });
  assert.equal(login.status, 200, "Real Auth login");
  return { ...user, token: login.data.access_token, password };
}
const professional = await identity("professional"),
  admin = await identity("admin");
sql(`begin;
 select set_config('nuthrick.billing_apply','true',true);
 update public.professional_profiles set onboarding_completed=true,is_public=false where id in (${
  q(professional.id)
},${q(admin.id)});
 insert into private.platform_admins(user_id) values(${
  q(admin.id)
}) on conflict(user_id) do nothing;
 insert into private.professional_access(professional_id,plan_id,status,source,billing_mode,starts_at,ends_at)
 select ${
  q(professional.id)
},id,'active','manual','live',now()-interval '1 day',now()+interval '30 days' from private.plans where code='profesional'
 on conflict(professional_id) do update set plan_id=excluded.plan_id,status='active',source='manual',billing_mode='live',starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 insert into private.ai_accounts(professional_id,purchased_credits) values(${
  q(professional.id)
},20) on conflict(professional_id) do nothing;
 update private.ai_live_pilot_configuration set production_enabled=true;
 update private.ai_feature_config set enabled=true,model='gpt-5.6-luna',timeout_ms=60000,reasoning_level='low',temperature=null,
  input_usd_per_million=0.2,cached_usd_per_million=0.02,output_usd_per_million=1.2
  where feature in ('consultation_support','intervention_strategy');
 -- Local legal prerequisite fixture; production legal content is never changed.
 select set_config('request.jwt.claim.sub',${q(admin.id)},true);
 select set_config('nuthrick.legal_approval','confirmed',true);
 update private.legal_documents set review_status='approved',approved_by=${
  q(admin.id)
},
  approved_at=now(),effective_at=now(),published_at=now() where key='privacy' and review_status<>'approved';
 commit;`);
const legal = JSON.parse(
  sql(
    "select row_to_json(t) from(select key,version from private.legal_documents where key='privacy')t",
  ),
);
await rpc("record_legal_acceptance", {
  p_document_key: legal.key,
  p_version: legal.version,
  p_source: "settings",
}, professional.token);
const consent = await rpc("my_ai_processing_consent", {}, professional.token);
if (!consent.accepted) {
  await rpc("accept_ai_processing_consent", {
    p_version: consent.version,
    p_patient_authorization: true,
  }, professional.token);
}
pass("real Auth sessions, plan access and explicit AI consent");

// A genuine PNG and a generated, decodable H.264 video; no external media.
mkdirSync(`${workdir}/media`, { recursive: true });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=",
  "base64",
);
writeFileSync(`${workdir}/media/fixture.png`, png);
const videoPath = `${workdir}/media/fixture.mp4`;
if (!existsSync(videoPath)) {
  const r = spawnSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=160x90:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    videoPath,
  ], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}
assert.equal(
  spawnSync("ffmpeg", ["-v", "error", "-i", videoPath, "-f", "null", "-"], {
    encoding: "utf8",
  }).status,
  0,
  "Decode the test video",
);
const list = () =>
  rpc("my_announcements", { p_action: "list", p_data: {} }, professional.token);
for (
  const [extension, mime, bytes, frequency] of [
    ["png", "image/png", png, "once"],
    ["mp4", "video/mp4", readFileSync(videoPath), "until_dismissed"],
    ["png", "image/png", png, "session"],
  ]
) {
  const id = randomUUID(), path = `${id}/${randomUUID()}.${extension}`;
  const upload = await fetch(
    local.API_URL + "/storage/v1/object/platform-announcements/" + path,
    {
      method: "POST",
      headers: {
        apikey: local.ANON_KEY,
        authorization: `Bearer ${admin.token}`,
        "content-type": mime,
      },
      body: bytes,
    },
  );
  assert.equal(upload.status, 200, "Admin uploads real media");
  const item = {
    id,
    title: `SYNTHETIC ${extension} announcement`,
    body: "Aviso para comprobación local",
    media_path: path,
    media_mime: mime,
    media_alt: "Medio sintético",
    cta_label: "",
    cta_url: "",
    status: "draft",
    frequency,
    starts_at: null,
    ends_at: null,
    priority: 10,
    expected_revision: 0,
  };
  let items = await rpc("announcements_admin_api", {
    p_action: "save",
    p_data: item,
  }, admin.token);
  let saved = items.find((a) => a.id === id);
  assert.ok(saved);
  assert.ok(
    !(await list()).some((a) => a.id === id),
    "Draft hidden from professionals",
  );
  const denied = await api(
    "/storage/v1/object/sign/platform-announcements/" + path,
    { expiresIn: 3600 },
    professional.token,
  );
  assert.ok(denied.status >= 400, "Draft media private");
  items = await rpc("announcements_admin_api", {
    p_action: "status",
    p_data: { id, status: "published", expected_revision: saved.revision },
  }, admin.token);
  saved = items.find((a) => a.id === id);
  assert.ok(
    (await list()).some((a) => a.id === id),
    "Published announcement available",
  );
  const signed = await api(
    "/storage/v1/object/sign/platform-announcements/" + path,
    { expiresIn: 3600 },
    professional.token,
  );
  assert.equal(signed.status, 200, "Professional signs active media");
  const signedUrl = local.API_URL + "/storage/v1" + signed.data.signedURL;
  const media = await fetch(signedUrl);
  assert.equal(media.status, 200, "Signed media is served");
  assert.equal(
    createHash("sha256").update(Buffer.from(await media.arrayBuffer())).digest(
      "hex",
    ),
    createHash("sha256").update(bytes).digest("hex"),
    "Full uploaded media preserved",
  );
  const event = (event) =>
    rpc("my_announcements", {
      p_action: event,
      p_data: { id, revision: saved.revision },
    }, professional.token);
  assert.equal(await event("seen"), true, "First impression accepted");
  if (frequency === "once") {
    assert.equal(await event("seen"), false, "Duplicate impression rejected");
    assert.ok(
      !(await list()).some((a) => a.id === id),
      "Once-only receipt survives refetch",
    );
  } else if (frequency === "session") {
    assert.equal(await event("seen"), false);
    assert.ok(
      !(await list()).some((a) => a.id === id),
      "Same session does not repeat",
    );
    const next = await api("/auth/v1/token?grant_type=password", {
      email: professional.email,
      password: professional.password,
    });
    assert.equal(next.status, 200);
    const second = next.data.access_token;
    assert.ok(
      (await rpc("my_announcements", { p_action: "list", p_data: {} }, second))
        .some((a) => a.id === id),
      "New real Auth session sees the announcement",
    );
    assert.equal(
      await rpc("my_announcements", {
        p_action: "seen",
        p_data: { id, revision: saved.revision },
      }, second),
      true,
    );
    assert.equal(
      sql(
        `select count(*) from private.announcement_session_receipts where announcement_id=${
          q(id)
        }`,
      ),
      "2",
    );
  } else {
    assert.ok(
      (await list()).some((a) => a.id === id),
      "Until-dismissed remains visible",
    );
    assert.equal(await event("dismiss"), true);
    assert.ok(!(await list()).some((a) => a.id === id));
  }
  const stale = await api("/rest/v1/rpc/announcements_admin_api", {
    p_action: "save",
    p_data: item,
  }, admin.token);
  assert.ok(stale.status >= 400, "Stale admin revision rejected");
  await rpc("announcements_admin_api", {
    p_action: "status",
    p_data: { id, status: "paused", expected_revision: saved.revision },
  }, admin.token);
  items = await rpc(
    "announcements_admin_api",
    { p_action: "list", p_data: {} },
    admin.token,
  );
  saved = items.find((a) => a.id === id);
  assert.ok(
    (await api("/storage/v1/object/sign/platform-announcements/" + path, {
      expiresIn: 3600,
    }, professional.token)).status >= 400,
    "Paused media is not signable",
  );
  await rpc("announcements_admin_api", {
    p_action: "delete",
    p_data: { id, expected_revision: saved.revision },
  }, admin.token);
  assert.equal(
    (await api(
      "/storage/v1/object/platform-announcements",
      { prefixes: [path] },
      admin.token,
      "DELETE",
    )).status,
    200,
    "Orphan media removed",
  );
  pass(
    `${extension}/${frequency}: real Storage upload, publication, private signed media, receipts, pause and deletion`,
  );
}
assert.ok(
  (await api("/rest/v1/rpc/announcements_admin_api", {
    p_action: "list",
    p_data: {},
  }, professional.token)).status >= 400,
  "Non-admin cannot manage announcements",
);
pass("professional cannot administer announcements");

// The same patient/consultation revision is used across PES, SMART and strategy.
if (!report.fixtures.patient) {
  const patient = randomUUID();
  const r = await api(
    "/rest/v1/patients",
    {
      id: patient,
      professional_id: professional.id,
      full_name: "SYNTHETIC FEATURE AUDIT PATIENT",
    },
    professional.token,
    "POST",
    { Prefer: "return=representation" },
  );
  assert.equal(r.status, 201, "Create own patient");
  report.fixtures.patient = patient;
  save();
}
if (!report.fixtures.consultation) {
  const visits = await rpc("start_consultation_draft", {
    target_patient: report.fixtures.patient,
    requested_type: "initial",
  }, professional.token);
  report.fixtures.consultation = one(visits).id;
  save();
}
const c = report.fixtures.consultation;
let snapshots = await api(
  `/rest/v1/consultation_snapshots?select=*&consultation_id=eq.${c}&order=revision.desc&limit=1`,
  undefined,
  professional.token,
  "GET",
);
assert.equal(snapshots.status, 200);
if (!snapshots.data.length) {
  const templates = await api(
    "/rest/v1/consultation_templates?select=id&template_key=eq.system_initial_v2",
    undefined,
    professional.token,
    "GET",
  );
  assert.equal(templates.status, 200);
  assert.ok(templates.data.length, "Initial template");
  await rpc("adopt_consultation_template", {
    target_consultation: c,
    target_template: templates.data[0].id,
    expected_revision: 0,
  }, professional.token);
  snapshots = await api(
    `/rest/v1/consultation_snapshots?select=*&consultation_id=eq.${c}&order=revision.desc&limit=1`,
    undefined,
    professional.token,
    "GET",
  );
}
let snapshot = snapshots.data[0];
snapshot = one(
  await rpc("prepare_consultation_workflow", {
    p_consultation: c,
    p_revision: snapshot.revision,
  }, professional.token),
);
const revision = snapshot.revision;
const objectiveArgs = { p_consultation: c, p_revision: revision };
let workspace = await rpc(
  "clinical_objective",
  objectiveArgs,
  professional.token,
);
if (!workspace.pes) {
  const answers = {
    main_reason: "Organizar las comidas durante la jornada laboral",
    usual_pattern:
      "En días de trabajo omite la comida por no planificar su preparación",
    access_barriers:
      "Cuenta con refrigerador y puede preparar alimentos la noche anterior",
    first_actions:
      "Acordamos registrar las comidas y preparar una colación durante la jornada laboral; revisar el registro en la próxima consulta",
  };
  const keys = new Set(
    snapshot.structure.sections.flatMap((s) =>
      s.questions.map((q) => q.question_key)
    ),
  );
  await rpc("save_consultation_responses", {
    target_consultation: c,
    expected_revision: revision,
    responses: Object.fromEntries(
      Object.entries(answers).filter(([key]) => keys.has(key)),
    ),
  }, professional.token);
  const clinical = await rpc("clinical_workspace", {
    p_consultation: c,
    p_revision: revision,
  }, professional.token);
  const pes = {
    problem: "Ingesta oral inadecuada",
    etiology:
      "Dificultad para planificar las comidas durante la jornada laboral",
    signsSymptoms: [
      "Omite la comida durante días de trabajo según la entrevista",
    ],
    evidenceReviewed: true,
  };
  pes.pesStatement = composePesStatement(pes);
  await rpc("clinical_workspace", {
    p_consultation: c,
    p_revision: revision,
    p_kind: "pes",
    p_payload: { ...pes, stamp: clinical.stamp },
  }, professional.token);
  workspace = await rpc(
    "clinical_objective",
    objectiveArgs,
    professional.token,
  );
}
assert.ok(workspace.pes);
pass("authenticated consultation and explicit PES approval");
const sourceArgs = {
  p_owner: professional.id,
  p_patient: report.fixtures.patient,
  p_consultation: c,
  p_revision: revision,
};
const source = await api("/rest/v1/rpc/ai_clinical_source", sourceArgs);
assert.equal(
  source.status,
  200,
  `Server can read clinical context: ${source.data?.message ?? ""}`,
);
assert.ok(source.data.approvedPes);
assert.ok(
  (await api("/rest/v1/rpc/ai_clinical_source", {
    ...sourceArgs,
    p_owner: admin.id,
  })).status >= 400,
  "Foreign context rejected",
);
assert.ok(
  (await api("/rest/v1/rpc/ai_clinical_source", sourceArgs, professional.token))
    .status >= 400,
  "Client cannot call server-only source",
);
pass("server-role clinical context works and rejects foreign/client access");

const config = JSON.parse(
  sql(
    "select jsonb_agg(to_jsonb(c)) from private.ai_feature_config c where feature in ('consultation_support','intervention_strategy')",
  ),
);
for (const c of config) {
  assert.equal(c.model, "gpt-5.6-luna");
  assert.ok(c.enabled);
  assert.equal(c.execution_mode, "real");
}
const maximum = config.reduce(
  (sum, c) =>
    sum +
    (c.max_input_tokens * Number(c.input_usd_per_million) +
        c.max_output_tokens * Number(c.output_usd_per_million)) / 1e6,
  0,
);
assert.ok(maximum <= 0.05, "Configured paid test limit USD 0.05");
report.maximumProviderUSD = maximum;
save();
const env = real
  ? parseEnv(readFileSync("supabase/functions/.env", "utf8"))
  : {};
if (real) assert.ok(env.OPENAI_API_KEY, "Local provider key required");
const fd = openSync(
  `${workdir}/${real ? "real-ai" : "preflight"}-runtime.log`,
  "a",
  0o600,
);
const runtime = spawn("deno", [
  "run",
  "--config",
  "supabase/functions/ai/deno.json",
  "--allow-env",
  `--allow-net=127.0.0.1:55321,127.0.0.1:55330${real ? ",api.openai.com" : ""}`,
  "scripts/serve-clinical-integration.ts",
], {
  env: {
    ...process.env,
    SUPABASE_URL: local.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    OPENAI_API_KEY: real ? env.OPENAI_API_KEY : "synthetic-no-provider-access",
    NUTHRICK_AI_ENABLED: "true",
  },
  stdio: ["ignore", fd, fd],
});
closeSync(fd);
async function generate(feature) {
  const cached = report.attempts[feature];
  if (cached) {
    assert.equal(
      cached.status,
      200,
      "Previous paid attempt is unresolved: do not retry",
    );
    return cached.result;
  }
  const idempotencyKey = randomUUID();
  report.attempts[feature] = { idempotencyKey, attempted: true };
  save();
  const start = performance.now();
  const response = await fetch("http://127.0.0.1:55330/functions/v1/ai", {
    method: "POST",
    headers: {
      authorization: `Bearer ${professional.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      feature,
      idempotencyKey,
      patientId: report.fixtures.patient,
      consultationId: c,
      revision,
    }),
  });
  const result = await response.json();
  report.attempts[feature] = {
    idempotencyKey,
    attempted: true,
    status: response.status,
    result,
    latencyMs: Math.round(performance.now() - start),
  };
  save();
  assert.equal(
    response.status,
    200,
    `Real ${feature}: ${result.error ?? "unexpected response"}`,
  );
  assert.equal(result.status, "succeeded");
  return result;
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:55330/");
      if (r.status === 405) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Start local clinical HTTP handler");
  const invalid = await fetch("http://127.0.0.1:55330/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${professional.token}`,
      "content-type": "application/json",
    },
    body: "null",
  });
  assert.equal(invalid.status, 400);
  pass("real HTTP handler rejects invalid payloads");
  if (real) {
    const goals = await generate("consultation_support");
    assert.ok(
      goals.output.objectives.length,
      "Real AI supplies a reviewable SMART proposal",
    );
    let plan = workspace.objective?.smart_plan;
    if (!plan) {
      const goal = { ...goals.output.objectives[0].goal, agreement: "patient" };
      goal.target ||= "Registrar las comidas acordadas";
      goal.timeframe ||= "Próxima consulta";
      goal.baseline ||= "Entrevista de esta consulta";
      goal.monitoring ||= "Revisión del registro de comidas";
      goal.feasibility ||=
        "Preparaciones disponibles según horario y presupuesto";
      assert.deepEqual(objectiveIssues(goal), []);
      plan = {
        version: 1,
        pesApprovedAt: workspace.pes.approved_at,
        goals: [goal],
      };
      await rpc("save_consultation_responses", {
        target_consultation: c,
        expected_revision: revision,
        responses: { treatment_objective: composeObjective(goal) },
      }, professional.token);
      workspace = await rpc(
        "clinical_objective",
        objectiveArgs,
        professional.token,
      );
      await rpc("clinical_objective", {
        ...objectiveArgs,
        p_action: "save",
        p_stamp: workspace.stamp,
        p_question_key: "treatment_objective",
        p_plan: plan,
      }, professional.token);
      workspace = await rpc(
        "clinical_objective",
        objectiveArgs,
        professional.token,
      );
      assert.equal(workspace.objective, null, "Saving does not approve");
      workspace = await rpc("clinical_objective", {
        ...objectiveArgs,
        p_action: "approve",
        p_stamp: workspace.stamp,
        p_question_key: "treatment_objective",
        p_plan: plan,
      }, professional.token);
    }
    assert.deepEqual(workspace.objective.smart_plan, plan);
    pass(
      "real AI SMART proposal, professional changes, draft and explicit approval persist",
    );
    const strategies = await generate("intervention_strategy");
    assert.ok(
      strategies.output.strategies.length,
      "Real AI supplies a strategy",
    );
    const doc = structuredClone(strategies.output.strategies[0]);
    assert.equal(isStrategyDocument(doc), true);
    assert.equal(doc.strategy.agreement, "pending");
    // Professional review supplies missing operational agreements in this fixture.
    const patches = {
      method: "Demostración guiada del registro",
      frequency: "Según lo acordado en consulta",
      duration: "Hasta la próxima consulta",
      startDate: new Date().toISOString().slice(0, 10),
      responsible: "Nutriólogo",
      executor: "Paciente",
      adaptations: "Preparar alimentos según horario laboral",
      monitoring: "Revisión del registro acordado",
      reviewAt: "Próxima consulta",
      adjustmentCriteria: "Revisar barreras si el registro no resulta viable",
      educationTopic: "Planificación de comidas",
      materials: "Formato de registro",
      comprehensionCheck: "La persona explica cómo realizará el registro",
    };
    for (const [key, value] of Object.entries(patches)) {
      doc.strategy[key] ||= value;
    }
    doc.strategy.agreement = "patient";
    assert.deepEqual(
      strategyIssues(doc.strategy),
      [],
      "Reviewed strategy complete",
    );
    const id = report.fixtures.strategy ?? randomUUID();
    report.fixtures.strategy = id;
    save();
    const args = { p_consultation: c, p_revision: revision };
    let w = await rpc("clinical_interventions", args, professional.token);
    let item = w.items.find((i) => i.id === id);
    if (!item) {
      w = await rpc("clinical_interventions", {
        ...args,
        p_action: "save",
        p_data: { id, expectedUpdatedAt: null, document: doc },
      }, professional.token);
      item = w.items.find((i) => i.id === id);
      assert.equal(item.state, "draft");
      assert.deepEqual(item.draft.strategy.evidence, doc.strategy.evidence);
    }
    if (item.state === "draft") {
      w = await rpc("clinical_interventions", {
        ...args,
        p_action: "approve",
        p_data: { id, expectedUpdatedAt: item.updated_at, document: doc },
      }, professional.token);
      item = w.items.find((i) => i.id === id);
      assert.equal(item.state, "approved");
    }
    if (item.state === "approved") {
      w = await rpc("clinical_interventions", {
        ...args,
        p_action: "start",
        p_data: {
          id,
          expectedUpdatedAt: item.updated_at,
          executor: "Paciente",
          startDate: new Date().toISOString().slice(0, 10),
        },
      }, professional.token);
      item = w.items.find((i) => i.id === id);
      assert.equal(item.state, "executing");
    }
    assert.ok(item.approved);
    assert.ok(item.history.length >= 2);
    pass(
      "real AI strategy, unchanged evidence, explicit approval, start and history persist",
    );
    report.usage = JSON.parse(
      sql(
        `select jsonb_agg(t) from(select feature,status,model,input_tokens,output_tokens,cached_tokens,actual_cost from private.ai_generations where professional_id=${
          q(professional.id)
        } order by started_at)t`,
      ),
    );
    assert.equal(report.usage.length, 2);
    assert.ok(report.usage.every((g) => g.status === "succeeded"));
    assert.ok(
      report.usage.reduce((s, g) => s + Number(g.actual_cost), 0) <= 0.05,
    );
    save();
    const balance = await rpc("ai_balance", {}, professional.token);
    assert.equal(
      Number(balance.reserved_credits),
      0,
      "Settled calls release their reservations",
    );
    report.balance = {
      available_credits: balance.available_credits,
      reserved_credits: balance.reserved_credits,
    };
    save();
  }
  report.completed = true;
  save();
  console.log(
    JSON.stringify({
      result: "passed",
      realProvider: real,
      checks: report.checks.length,
      report: reportPath,
      usage: report.usage,
    }),
  );
} finally {
  runtime.kill("SIGTERM");
}
