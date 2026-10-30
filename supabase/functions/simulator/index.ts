import { createClient } from '@supabase/supabase-js';
import { productOriginAllowed, siteOrigin } from '../_shared/site.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const site=siteOrigin(Deno.env.get('BILLING_SITE_URL'));
type Data=Record<string,unknown>;
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':productOriginAllowed(origin,site)?origin!:site,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return respond({error:'method_not_allowed'},405);
  try{
    if(origin&&!productOriginAllowed(origin,site))throw new Error('unauthorized');
    const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)throw new Error('unauthorized');
    const {data,error}=await db.auth.getUser(token);
    const user=data.user;
    if(error||!user||user.is_anonymous)throw new Error('unauthorized');
    const bodyText=await req.text();if(bodyText.length>8000)throw new Error('invalid_request');
    const body=JSON.parse(bodyText) as Data;
    const action=String(body.action??'');
    const call=async(command:string,payload:Data={})=>{
      const result=await db.rpc('simulator_server',{p_action:command,p_actor:user.id,p_data:payload});
      if(result.error)throw new Error(result.error.message);
      return result.data;
    };
    if(action==='create'){
      await call('authorize');
      if(!uuid(body.plan_id)||!['empty','examples'].includes(String(body.scenario)))throw new Error('invalid_request');
      const id=crypto.randomUUID();
      const email=`simulator.${id}@example.invalid`;
      const created=await db.auth.admin.createUser({email,email_confirm:true,password:crypto.randomUUID()+crypto.randomUUID(),app_metadata:{nuthrick_simulation:true},user_metadata:{full_name:''}});
      if(created.error||!created.data.user)throw new Error('simulation_unavailable');
      const run=await call('create',{professional_id:created.data.user.id,plan_id:body.plan_id,scenario:body.scenario});
      const link=await db.auth.admin.generateLink({type:'magiclink',email});
      if(link.error||!link.data.properties?.hashed_token)throw new Error('simulation_unavailable');
      const verifier=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')??serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const verified=await verifier.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});
      const session=verified.data.session;
      if(verified.error||!session||session.user.id!==created.data.user.id)throw new Error('simulation_unavailable');
      return respond({run,session:{access_token:session.access_token,refresh_token:session.refresh_token}});
    }
    if(['list','end_admin'].includes(action))return respond(await call(action,action==='end_admin'?{id:body.id}:{}));
    if(user.app_metadata.nuthrick_simulation!==true)throw new Error('simulation_required');
    // All chargeable subscription/credit operations route here in a demo tab.
    // Only these harmless commands are implemented; others fail closed.
    if(!['status','checkout','preview','expire_checkout','portal','cancel','resume','change','end','credit_preview','credit_checkout','credit_expire'].includes(action))throw new Error('invalid_action');
    if(action==='preview'){
      await call('status');
      if(String(body.code??''))throw new Error('simulation_promotion_unavailable');
      return respond({campaign:null});
    }
    const command=action==='change'?'checkout':action;
    const result=await call(command,{plan_id:body.plan_id,interval:body.interval,code:body.code,package_id:body.package_id,operation_key:body.operation_key});
    return respond(result);
  }catch(error){
    const code=error instanceof Error?error.message:'simulation_unavailable';
    const safe=['unauthorized','admin_required','simulation_required','simulation_expired','simulation_unavailable','simulation_promotion_unavailable','invalid_request','invalid_action','entitlement_required','patients_limit_reached'];
    // No sessions, credentials, request bodies or identities in logs/errors.
    if(!safe.includes(code))console.error(JSON.stringify({event:'simulation_command_failed',code:code.slice(0,100)}));
    return respond({error:safe.includes(code)?code:'simulation_unavailable'},['unauthorized','admin_required','simulation_required'].includes(code)?403:400);
  }
});
