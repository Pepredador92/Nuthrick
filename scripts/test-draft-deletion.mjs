import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260921223620_safe_diet_draft_deletion.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = readFileSync(
  new URL("./test-draft-deletion.sql", import.meta.url),
  "utf8",
).replace("-- MIGRATION --", () => migration);
const result = spawnSync(
  "psql",
  ["-X", "-h", "/tmp", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { input: sql, encoding: "utf8" },
);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
