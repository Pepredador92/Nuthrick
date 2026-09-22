// Real loopback HTTP against index.ts. All outbound dependencies are intercepted;
// no real credentials or paid provider requests are permitted in this suite.
import { strict as assert } from 'node:assert';
import recorded from './fixtures/pes-real-calibration-20260922.json' with { type: 'json' };

Deno.test('HTTP production handler: contracts, auth, upstream failures and secrecy', async t => {
  const nativeFetch = globalThis.fetch, nativeServe = Deno.serve, nativeWarn = console.warn;
  const logs: string[] = [];
  const env = { SUPABASE_URL:'http://mock.invalid', SUPABASE_SERVICE_ROLE_KEY:'test-service-sentinel', OPENAI_API_KEY:'test-key-sentinel', NUTHRICK_AI_ENABLED:'true' };
  const previous = Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));
  for(const [k,v] of Object.entries(env)) Deno.env.set(k,v);
  console.warn = (...v)=>{logs.push(v.join(' '));};
  let server: Deno.HttpServer, port=0, mode='ok', calls=0;
  const owner='11111111-1111-4111-8111-111111111111';
  const request={feature:'pes_diagnosis',idempotencyKey:owner,patientId:owner,consultationId:owner,revision:1};
  const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
  const config={feature:'pes_diagnosis',enabled:true,provider:'openai',model:'gpt-5.6-terra',prompt_version:'pes_diagnosis@1',max_input_tokens:8192,max_output_tokens:1024,timeout_ms:20,reasoning_level:'low',temperature:null};
  globalThis.fetch = async (input,init) => {
    const url=String(input);
    if(url.startsWith('http://127.0.0.1:')) return nativeFetch(input,init);
    if(url.includes('/auth/v1/user')) return new Headers(init?.headers).get('authorization')==='Bearer valid' ? json({id:owner,is_anonymous:false}) : json({message:'invalid'},401);
    if(url.includes('/rest/v1/rpc/')) {
      const body=JSON.parse(String(init?.body));
      if(url.endsWith('ai_clinical_source')) return mode==='foreign' ? json({message:'context_unavailable'},403) : json({facts:mode==='empty'?[]:recorded.A.exactInput.context.facts,identifiers:[],stamp:'stamp'});
      if(url.endsWith('ai_bind_clinical_context')) return json(null);
      if(body.p_action==='config') return json(config);
      if(body.p_action==='reserve') return json({created:true,generation:{id:owner,status:'reserved'}});
      if(body.p_action==='claim') return json({claimed:true});
      return json({id:owner,status:body.p_data?.status??'uncertain'});
    }
    assert.equal(url,'https://api.openai.com/v1/responses'); calls++;
    if(mode==='timeout') { await new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error(env.OPENAI_API_KEY)),{once:true})); }
    if(mode==='upstream') return json({error:{code:env.OPENAI_API_KEY,message:env.SUPABASE_SERVICE_ROLE_KEY}},503);
    const output=mode==='schema'?{bad:true}:mode==='empty'?recorded.B.output:recorded.A.output;
    return json({id:'resp_mock',status:'completed',usage:{input_tokens:10,output_tokens:10,total_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});
  };
  Deno.serve = ((handler: Deno.ServeHandler)=> { server=nativeServe({hostname:'127.0.0.1',port:0,onListen:a=>{port=a.port;}},handler); return server; }) as typeof Deno.serve;
  try {
    await import('./index.ts');
    async function check(name:string,body:unknown,status:number,error?:string,options:{method?:string;auth?:string;raw?:boolean}={}) {
      await t.step(name,async()=>{
        const method=options.method??'POST';
        const response=await nativeFetch(`http://127.0.0.1:${port}/functions/v1/ai`,{method,headers:{authorization:options.auth??'Bearer valid','content-type':'application/json'},...(method==='POST'?{body:options.raw?String(body):JSON.stringify(body)}:{})});
        const text=await response.text();
        assert.equal(response.status,status,text);
        if(error) assert.equal(JSON.parse(text).error,error);
        for(const secret of [env.OPENAI_API_KEY,env.SUPABASE_SERVICE_ROLE_KEY]) assert.ok(!text.includes(secret));
      });
    }
    await check('wrong method',null,405,'method_not_allowed',{method:'GET'});
    await check('absent auth',request,401,'unauthorized',{auth:''});
    await check('invalid auth',request,401,'unauthorized',{auth:'Bearer invalid'});
    await check('invalid JSON','{',400,'invalid_request',{raw:true});
    for(const value of [null,[],{}, {...request,revision:null},{...request,revision:0},{...request,patientId:''},{...request,model:'override'}]) await check('invalid contract '+JSON.stringify(value),value,400,'invalid_request');
    assert.equal(calls,0);
    mode='foreign'; await check('unowned context',request,409,'context_unavailable'); assert.equal(calls,0);
    mode='empty'; await check('empty context blocked before provider',request,409,'context_unavailable'); assert.equal(calls,0);
    mode='schema'; await check('invalid provider schema',request,409,'invalid_output');
    mode='upstream'; await check('upstream error',request,409,'provider_outcome_unknown');
    mode='timeout'; await check('controlled timeout',request,409,'provider_outcome_unknown');
    mode='ok'; await check('valid response',request,200);
    await t.step('no secret in logs',()=>{for(const secret of [env.OPENAI_API_KEY,env.SUPABASE_SERVICE_ROLE_KEY]) assert.ok(!logs.join('\n').includes(secret));});
  } finally {
    await server!?.shutdown(); globalThis.fetch=nativeFetch; Deno.serve=nativeServe; console.warn=nativeWarn;
    for(const [k,v] of Object.entries(previous)) if(v===undefined) Deno.env.delete(k); else Deno.env.set(k,v);
  }
});
