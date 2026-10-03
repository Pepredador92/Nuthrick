import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const migration=readFileSync(new URL('../supabase/migrations/20261003230815_supplement_library.sql',import.meta.url),'utf8');
const fixture=readFileSync(new URL('./test-supplement-library-db.sql',import.meta.url),'utf8').split('-- MIGRATION --');
const r=spawnSync('psql',['-X','-h','/tmp/nuthrick-supplements-pg','-p','55439','-U',process.env.USER,'-d','postgres','-v','ON_ERROR_STOP=1'],{input:fixture[0]+migration+fixture[1],encoding:'utf8'});
process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exit(r.status??1);
