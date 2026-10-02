// Disposable CI accounts only. This endpoint cannot select an administrator account.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { testAccountName } from './policy.mjs';
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const key=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}catch{return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}})();
const admin=createClient(Deno.env.get('SUPABASE_URL')!,key!,{auth:{persistSession:false}});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({ok:false},405);
 let username:string;
 try{
  const raw=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const {payload}=await jwtVerify(raw,jwks,{issuer:'https://token.actions.githubusercontent.com',audience:'chennan-e2e',algorithms:['RS256'],maxTokenAge:'10m'});
  username=testAccountName(payload);
 }catch{return reply({ok:false,error:'Trusted GitHub Actions identity required'},401)}
 let body;try{body=await req.json()}catch{return reply({ok:false},400)}
 if(body.action==='cleanup'){
  // FK cascading deletion affects only this signed workflow run's synthetic account.
  const {error}=await admin.from('workspace_accounts').delete().eq('username',username);
  return error?reply({ok:false,error:'Cleanup failed'},500):reply({ok:true,username});
 }
 if(body.action!=='provision'||!/^.{22}==$/.test(String(body.salt))||!/^.{43}=$/.test(String(body.hash))||body.iterations!==210000)return reply({ok:false,error:'Invalid verifier'},400);
 const {error}=await admin.from('workspace_accounts').insert({username,display_name:'自动化隔离验收',password_salt:body.salt,password_hash:body.hash,password_iterations:body.iterations});
 return error?reply({ok:false,error:'Provision failed'},409):reply({ok:true,username});
});
