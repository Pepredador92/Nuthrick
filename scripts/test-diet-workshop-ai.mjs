import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const setup=read('./test-clinical-copilot.sql').split('-- AI CORE --')[0];
const sql=read('./test-diet-workshop-ai.sql')
 .replace('-- SETUP --',()=>setup)
 .replace('-- CORE --',()=>read('../supabase/migrations/20260922005406_ai_core_credit_ledger.sql')+'\n'+read('../supabase/migrations/20260922010129_ai_cost_precision.sql'))
 .replace('-- WORKSHOP --',()=>read('../supabase/migrations/20260922022646_diet_workshop_ai.sql'));
const result=spawnSync('psql',['-X','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exit(result.status??1);
