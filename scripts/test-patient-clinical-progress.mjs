// Local PostgreSQL only. Synthetic records and schema changes are rolled back.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { clinicalFixtureSQL } from "./test-intervention-retention.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261114201553_patient_clinical_progress.sql")
  .replace(/^begin;\s*/i, "").replace(/commit;\s*$/i, "");
const fixture = clinicalFixtureSQL() + `
alter table public.consultations add column display_name text, add unique(professional_id,id,patient_id);
alter table public.consultation_snapshots add unique(professional_id,consultation_id,revision);
create function private.my_read_feature(text) returns boolean language sql stable as $$select true$$;
grant execute on function private.my_read_feature(text) to authenticated;
grant select on public.patients, public.consultations, public.consultation_snapshots, public.consultation_answers to authenticated;
`;
const sql = fixture + migration + read("scripts/test-patient-clinical-progress.sql") + "\nrollback;";
const result = spawnSync("psql", ["-X", "-q", "-h", "/tmp", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
if (result.error) throw result.error;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exitCode = result.status ?? 1;
