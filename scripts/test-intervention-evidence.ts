// LOCAL PostgreSQL only. Check the real SQL document validator with documents
// produced by the strategy hydrator. All schema/table changes roll back.
import { strict as assert } from "node:assert";
import { emptyObjective } from "../supabase/functions/_shared/objectives.ts";
import {
  emptyStrategy,
  isStrategyDocument,
} from "../supabase/functions/_shared/interventions.ts";
import {
  buildInterventionContext,
  hydrateInterventionOutput,
} from "../supabase/functions/ai/intervention.ts";

const goal = {
  ...emptyObjective(),
  outcome: "o".repeat(400),
  etiology: "e".repeat(800),
  sign: "s".repeat(800),
  indicator: "i".repeat(400),
  baseline: 'Registro "citado"\nRuta \\ 😀 '.repeat(15),
  target: "t".repeat(400),
  timeframe: "f".repeat(400),
  monitoring: "m".repeat(400),
  feasibility: "v".repeat(400),
  agreement: "patient" as const,
};
const pes = {
  approved_at: "2026-10-18T12:00:00Z",
  problem: "Ingesta insuficiente",
  etiology: goal.etiology,
  signsSymptoms: goal.sign,
  pesStatement: "Enunciado sintético",
};
const context = buildInterventionContext({
  stamp: "synthetic",
  facts: [],
  identifiers: [],
  approvedPes: pes,
  approvedObjective: {
    approved_at: "2026-10-18T12:10:00Z",
    pes_approved_at: pes.approved_at,
    smart_plan: {
      version: 1,
      pesApprovedAt: pes.approved_at,
      goals: [goal, goal, goal],
    },
  },
});
const documents = hydrateInterventionOutput(
  {
    strategies: context.approvedGoals.map((g) => ({
      ...emptyStrategy(),
      title: "Educación nutricional",
      action: "Practicar registro",
      etiologyLink: "Aborda conocimientos",
      goalIndexes: [g.index],
      evidenceFactIds: context.facts.filter((f) =>
        f.source.startsWith(`Objetivo aprobado · ${g.index + 1} · `)
      ).map((f) => f.id),
    })),
  },
  context,
  "11111111-1111-4111-8111-111111111111",
).strategies;
assert.ok(documents.every(isStrategyDocument));
assert.ok(JSON.stringify(goal).length > 4000);
const oversized = structuredClone(documents[0]);
for (const field of Object.keys(oversized.strategy)) {
  if (
    typeof oversized.strategy[field as keyof typeof oversized.strategy] ===
      "string" &&
    !["category", "route", "agreement"].includes(field)
  ) {
    (oversized.strategy as unknown as Record<string, unknown>)[field] = "漢"
      .repeat(1500);
  }
}
assert.equal(isStrategyDocument(oversized), false);
const migration = [...Deno.readDirSync("supabase/migrations")].find((file) =>
  file.name.endsWith("_clinical_intervention_strategies.sql")
);
assert.ok(migration);
const source = Deno.readTextFileSync(`supabase/migrations/${migration.name}`);
const start = source.indexOf(
  "create function private.validate_intervention_document(",
);
const end = source.indexOf(
  "revoke all on function private.validate_intervention_document",
  start,
);
assert.ok(start >= 0 && end > start);
const quote = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sql = `begin;
set local standard_conforming_strings=on;
create schema private;
${source.slice(start, end)}
create temporary table evidence_documents(doc jsonb check(octet_length(doc::text)<=90000));
${
  documents.map((doc) =>
    `select private.validate_intervention_document(${
      quote(doc)
    },false); insert into evidence_documents values(${quote(doc)});`
  ).join("\n")
}
do $test$begin
 if (select count(*) from evidence_documents)<>3 then raise exception 'Missing saved documents';end if;
 if exists(select 1 from evidence_documents where jsonb_array_length(doc->'strategy'->'evidence')<>9) then raise exception 'Lost evidence';end if;
 begin
  perform private.validate_intervention_document(${quote(oversized)},false);
  raise exception 'Oversized document accepted';
 exception when raise_exception then if sqlerrm<>'invalid_strategy' then raise;end if;end;
end $test$;
select jsonb_build_object('result','Three hydrated strategies validated and saved; oversized document rejected','documents',count(*)) from evidence_documents;
rollback;`;
const process = new Deno.Command("psql", {
  args: ["-X", "-q", "-h", "/tmp", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  stdin: "piped",
  stdout: "piped",
  stderr: "piped",
}).spawn();
const writer = process.stdin.getWriter();
await writer.write(new TextEncoder().encode(sql));
await writer.close();
const result = await process.output();
await Deno.stdout.write(result.stdout);
await Deno.stderr.write(result.stderr);
if (!result.success) Deno.exit(result.code);
