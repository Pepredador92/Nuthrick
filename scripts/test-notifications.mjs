// Schema-only clone of LOCAL Nuthrick. No remote data, emails or patient writes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = "supabase_db_Nuthrick";
const database = `nuthrick_notifications_${process.pid}`;
const sql = (db, query) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
try {
  sql("postgres", `create database ${database}`);
  let schema = execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--no-owner", "-n", "public", "-n", "private", "-n", "auth", "-n", "storage", "-n", "extensions"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  schema = schema.replace("CREATE SCHEMA extensions;", 'CREATE SCHEMA extensions; CREATE EXTENSION citext WITH SCHEMA extensions; CREATE EXTENSION btree_gist WITH SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;').replace(/ALTER DEFAULT PRIVILEGES[^;]+;/g, "");
  sql(database, "drop schema public;\n" + schema);
  // Rehearse the migration even when the local source already contains it.
  sql(database, `
    drop trigger if exists portal_messages_notifications on private.portal_messages;
    drop trigger if exists agenda_requests_notifications on public.agenda_requests;
    drop trigger if exists agenda_entries_notifications on public.agenda_entries;
    drop table if exists public.professional_notifications;
  `);
  sql(database, "create publication supabase_realtime;");
  sql(database, readFileSync(new URL("../supabase/migrations/20260925070703_realtime_notifications.sql", import.meta.url), "utf8"));
  sql(database, readFileSync(new URL("./test-notifications.sql", import.meta.url), "utf8"));
  assert.equal(sql(database, "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='professional_notifications'").trim(), "1");
  console.log("PASS notifications migration, publication, message/appointment triggers, deduplication, owner RLS and read_at-only updates");
} finally {
  sql("postgres", `drop database if exists ${database} with (force)`);
}
