// Transaction-only database integration test. Requires a LOCAL empty PostgreSQL database.
// All fixture tables, test roles and migration changes are rolled back, even on failure.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migration = readFileSync(new URL('../supabase/migrations/20260915212701_reusable_diet_library.sql', import.meta.url), 'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
const expansion = readFileSync(new URL('../supabase/migrations/20260915221308_library_contributions_and_targets.sql', import.meta.url), 'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
const expansionChecks = readFileSync(new URL('./test-library-contributions.sql', import.meta.url), 'utf8');
const normalization = readFileSync(new URL('../supabase/migrations/20260915223943_normalize_library_reference_energy.sql', import.meta.url), 'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
const seed = readFileSync(new URL('../supabase/migrations/20260915222636_seed_anonymized_pdf_library.sql', import.meta.url), 'utf8').replace(/^begin;\s*/im,'').replace(/commit;\s*$/i,'');
const fixture = readFileSync(new URL('./test-diet-library-db.sql', import.meta.url), 'utf8');
const catalog = JSON.parse(readFileSync(new URL('./data/library-food-snapshots.json', import.meta.url), 'utf8'));
const catalogSetup = `create table public.food_items(id uuid default gen_random_uuid(), owner_id uuid, stable_code text); insert into public.food_items(stable_code) values ${catalog.map(f=>`('${f.stable_code}')`).join(',')};`;
const [setup, checks] = fixture.split('-- MIGRATION INSERTION POINT --');
const run = spawnSync('psql', ['-X', '-h', '/tmp', '-d', process.env.LIBRARY_TEST_DATABASE || 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `begin;\n${setup}\n${migration}\n${expansion}\n${normalization}\n${checks}\n${expansionChecks}\n${catalogSetup}\n${seed}\n${seed}\ndo $$ begin if (select count(*) from public.diet_library_items where provenance->>'kind'='provided_pdf')<>21 then raise exception 'Seed count or idempotency failed'; end if; if (private.library_reference_macro('{"energy_kcal":1597.5,"protein_g":100,"carbohydrate_g":200,"fat_g":44.1666666667}') ->>'target_energy_kcal')::numeric<>1598 then raise exception 'Whole-kcal goal regression'; end if; end $$;\nrollback;`, encoding:'utf8' });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
process.exit(run.status ?? 1);
