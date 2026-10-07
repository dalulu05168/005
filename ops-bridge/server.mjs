import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=String(process.env.REDIS_URL||'').trim();
const ADMIN_USER=String(process.env.OPS_ADMIN_USER||'admin');
const ADMIN_PASSWORD=String(process.env.OPS_ADMIN_PASSWORD||'');
const SESSION_SECRET=String(process.env.OPS_SESSION_SECRET||'');
const AGENT_KEY=String(process.env.NUVEXA_AGENT_KEY||'');
const ALLOWED_ORIGIN=String(process.env.OPS_ALLOWED_ORIGIN||'https://ops.sasakic.cc').replace(/\/+$/,'');
const SNAPSHOT_KEY='nuvexa:ops:snapshot:v1';
const POLICY_KEY='nuvexa:ops:group-policy:v1';
const MAX_BODY=2*1024*1024;

if(!REDIS_URL||!ADMIN_PASSWORD||!SESSION_SECRET||!AGENT_KEY){
  console.error('Missing required environment configuration');
  process.exit(1);
}
const redis=createClient({url:REDIS_URL});
redis.on('error',error=>console.error('redis:',error.message));
await redis.connect();

const b64=value=>Buffer.from(value).toString('base64url');
const unb64=value=>Buffer.from(value,'base64url').toString('utf8');
function signToken(user){
  const payload=b64(JSON.stringify({sub:user,exp:Date.now()+12*60*60*1000}));
  const sig=createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(token=''){
  try{
    const [payload,sig]=String(token).split('.');
    if(!payload||!sig)return null;
    const expected=createHmac('sha256',SESSION_SECRET).update(payload).digest();
    const actual=Buffer.from(sig,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const data=JSON.parse(unb64(payload));
    return data.exp>Date.now()?data:null;
  }catch{return null}
}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()}
function userAuth(req){return verifyToken(bearer(req))}
function agentAuth(req){const key=String(req.headers['x-nuvexa-agent-key']||'');return key&&key===AGENT_KEY}

function cors(req,res){
  const origin=String(req.headers.origin||'');
  if(origin===ALLOWED_ORIGIN)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Nuvexa-Agent-Key');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Max-Age','600');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
}
function send(res,status,payload){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
}
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY)throw Object.assign(new Error('Body too large'),{status:413});
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
async function getJson(key){const value=await redis.get(key);if(!value)return null;try{return JSON.parse(value)}catch{return null}}
async function setJson(key,value){await redis.set(key,JSON.stringify(value))}
async function getStoredPolicy(){return await getJson(POLICY_KEY)}
async function getPolicy(){
  return await getStoredPolicy()||{enabled:false,groupId:'',groupName:'',revision:0,updatedAt:null};
}
function normalizePolicy(value={},previous={}){
  const groupId=String(value.groupId??previous.groupId??'').trim();
  const groupName=String(value.groupName??previous.groupName??'').trim();
  return {
    enabled:value.enabled===true,
    groupId,groupName,
    revision:Number(previous.revision||0)+1,
    updatedAt:new Date().toISOString(),
  };
}
function onlineSnapshot(snapshot){
  if(!snapshot)return {executorOnline:false,stale:true,ageMs:null};
  const heartbeat=Date.parse(snapshot?.executor?.heartbeatAt||0);
  const ageMs=Number.isFinite(heartbeat)?Date.now()-heartbeat:null;
  return {executorOnline:ageMs!==null&&ageMs<20_000,stale:ageMs===null||ageMs>=20_000,ageMs};
}
function sanitizeSnapshot(input={}){
  const accounts=Array.isArray(input.accounts)?input.accounts.slice(0,100):[];
  const tasks=Array.isArray(input.tasks)?input.tasks.slice(0,100):[];
  const groupCandidates=Array.isArray(input.groupCandidates)?input.groupCandidates.slice(0,100):[];
  return {
    schemaVersion:1,
    agentVersion:String(input.agentVersion||''),
    executor:{
      machineId:String(input?.executor?.machineId||'windows-executor').slice(0,120),
      startedAt:input?.executor?.startedAt||null,
      heartbeatAt:new Date().toISOString(),
    },
    summary:input.summary||{},
    accounts,
    tasks,
    queue:input.queue||{},
    telegram:input.telegram||{},
    groupCandidates,
    localPolicy:input.localPolicy||{},
    receivedAt:new Date().toISOString(),
  };
}

const server=createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/v1/health'&&req.method==='GET'){
      const snapshot=await getJson(SNAPSHOT_KEY);
      return send(res,200,{ok:true,redis:redis.isReady,...onlineSnapshot(snapshot),timestamp:new Date().toISOString()});
    }
    if(url.pathname==='/v1/auth/login'&&req.method==='POST'){
      const input=await body(req);
      if(String(input.username||'')!==ADMIN_USER||String(input.password||'')!==ADMIN_PASSWORD)return send(res,401,{error:'账号或密码错误'});
      return send(res,200,{token:signToken(ADMIN_USER),user:{username:ADMIN_USER},expiresIn:43200});
    }
    if(url.pathname==='/v1/auth/me'&&req.method==='GET'){
      const user=userAuth(req);if(!user)return send(res,401,{error:'AUTH_REQUIRED'});
      return send(res,200,{user:{username:user.sub}});
    }

    if(url.pathname==='/v1/executor/config'&&req.method==='GET'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      return send(res,200,{groupPolicy:await getStoredPolicy(),serverTime:new Date().toISOString()});
    }
    if(url.pathname==='/v1/executor/heartbeat'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const snapshot=sanitizeSnapshot(await body(req));
      await setJson(SNAPSHOT_KEY,snapshot);
      const existing=await getJson(POLICY_KEY);
      if(!existing&&snapshot.localPolicy?.groupId){
        const seeded={
          enabled:snapshot.localPolicy.enabled===true,
          groupId:String(snapshot.localPolicy.groupId||''),
          groupName:String(snapshot.localPolicy.groupName||''),
          revision:Number(snapshot.localPolicy.revision||1),
          updatedAt:snapshot.localPolicy.updatedAt||new Date().toISOString(),
        };
        await setJson(POLICY_KEY,seeded);
      }
      return send(res,200,{ok:true,receivedAt:snapshot.receivedAt});
    }

    const user=userAuth(req);
    if(!user)return send(res,401,{error:'AUTH_REQUIRED'});

    if(url.pathname==='/v1/dashboard'&&req.method==='GET'){
      const snapshot=await getJson(SNAPSHOT_KEY);
      const policy=await getPolicy();
      const status=onlineSnapshot(snapshot);
      return send(res,200,{snapshot,groupPolicy:policy,...status,serverTime:new Date().toISOString()});
    }
    if(url.pathname==='/v1/accounts'&&req.method==='GET'){
      const snapshot=await getJson(SNAPSHOT_KEY);
      return send(res,200,{items:snapshot?.accounts||[],...onlineSnapshot(snapshot)});
    }
    if(url.pathname==='/v1/group-policy'&&req.method==='GET'){
      const snapshot=await getJson(SNAPSHOT_KEY);
      return send(res,200,{groupPolicy:await getPolicy(),groupCandidates:snapshot?.groupCandidates||[],...onlineSnapshot(snapshot)});
    }
    if(url.pathname==='/v1/group-policy'&&req.method==='PUT'){
      const previous=await getPolicy();
      const input=await body(req);
      if(input.enabled===true&&!String(input.groupId??previous.groupId??'').trim())return send(res,400,{error:'开启发布前必须先设置目标群组'});
      const next=normalizePolicy(input,previous);
      await setJson(POLICY_KEY,next);
      return send(res,200,{groupPolicy:next});
    }
    return send(res,404,{error:'NOT_FOUND'});
  }catch(error){
    console.error(error);
    return send(res,error.status||500,{error:error.message||'INTERNAL_ERROR'});
  }
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Nuvexa Ops Bridge listening on ${PORT}`));
