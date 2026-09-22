import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {build}=require('esbuild');
const built=await build({entryPoints:['frontend/src/features/diet-workshop/generationCalibrationFixtures.ts'],bundle:true,write:false,format:'esm',platform:'node',alias:{'@/src':process.cwd()+'/frontend/src'}});
const {dietCalibrationFixture}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
writeFileSync('supabase/functions/ai/fixtures/diet-phase3.json',JSON.stringify(Object.fromEntries(['A','B','C'].map(k=>[k,dietCalibrationFixture(k)])),null,2)+'\n');
