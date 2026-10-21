// Actual owner-scoped PostgreSQL functions with synthetic initial/follow-up
// consultations. Local socket only; every fixture and DDL change is rolled back.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {clinicalFixtureSQL} from './test-intervention-retention.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const strip=sql=>sql.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
let setup=clinicalFixtureSQL();
setup+=strip(read('supabase/migrations/20261020201721_objective_targets_patient_language.sql').split('-- Deploy Edge')[0]);
setup+=strip(read('supabase/migrations/20261021071745_minimal_intervention_approval.sql'));
if(!process.argv.includes('--without-fix')) setup+=strip(read('supabase/migrations/20261021203205_connected_clinical_approvals.sql'));
const result=spawnSync('psql',['-X','-q','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1'],{input:setup+'\n'+read('scripts/test-connected-clinical-approvals.sql')+'\nrollback;',encoding:'utf8',maxBuffer:4*1024*1024});
if(result.error)throw result.error;
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
