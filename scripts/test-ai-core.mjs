import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migration=readFileSync(new URL('../supabase/migrations/20260922005406_ai_core_credit_ledger.sql',import.meta.url),'utf8');
const precision=readFileSync(new URL('../supabase/migrations/20260922010129_ai_cost_precision.sql',import.meta.url),'utf8');
const sql=readFileSync(new URL('./test-ai-core.sql',import.meta.url),'utf8').replace('-- MIGRATION --',()=>migration+'\n'+precision);
const result=spawnSync('psql',['-X','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exit(result.status ?? 1);
