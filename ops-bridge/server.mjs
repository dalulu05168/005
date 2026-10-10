import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=String(process.env.REDIS_URL||'').trim();
const ADMIN_USER=String(process.env.OPS_ADMIN_USER||'admin');
const ADMIN_PASSWORD=String(process.env.OPS_ADMIN_PASSWORD||'');
const SESSION_SECRET=String(process.env.OPS_SESSION_SECRET||'');
const AGENT_KEY=String(process.env.NUVEXA_AGENT_KEY||'');
const ALLOWED_ORIGINS=new Set(
  String(process.env.OPS_ALLOWED_ORIGIN||'https://ops.sasakic.cc')
    .split(',')
    .map(x=>x.trim().replace(/\/+$/,''))
    .filter(Boolean)
    .concat(['https://admin.nuvexapro.com','https://ops.sasakic.cc','https://chennan-005.vercel.app'])
);
const STATE_KEY='nuvexa:cloud:state:v3';
const LOCK_KEY='nuvexa:cloud:lock:v3';
const MAX_BODY=4*1024*1024;
const TERMINAL_TARGETS=new Set(['ACKED','SKIPPED_DISABLED','FAILED']);
const TERMINAL_TASKS=new Set(['ACKED','FAILED','CANCELLED']);

if(!REDIS_URL||!ADMIN_PASSWORD||!SESSION_SECRET||!AGENT_KEY){
  console.error('Missing required environment configuration');
  process.exit(1);
}

const redis=createClient({url:REDIS_URL});
redis.on('error',error=>console.error('redis:',error.message));
await redis.connect();

const nowIso=()=>new Date().toISOString();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const safeString=(v,max=500)=>String(v??'').trim().slice(0,max);
const b64=value=>Buffer.from(value).toString('base64url');
const unb64=value=>Buffer.from(value,'base64url').toString('utf8');
const randomMs=(min,max)=>{
  const a=Math.max(0,Number(min)||0),b=Math.max(a,Number(max)||a);
  return Math.round(a+Math.random()*(b-a));
};

function signToken(user){
  const payload=b64(JSON.stringify({sub:user,exp:Date.now()+12*60*60*1000}));
  const sig=createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
  return payload+'.'+sig;
}
function verifyToken(token=''){
  try{
    const parts=String(token).split('.');
    if(parts.length!==2)return null;
    const payload=parts[0],sig=parts[1];
    const expected=createHmac('sha256',SESSION_SECRET).update(payload).digest();
    const actual=Buffer.from(sig,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const data=JSON.parse(unb64(payload));
    return data.exp>Date.now()?data:null;
  }catch{return null}
}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()}
function userAuth(req){return verifyToken(bearer(req))}
function agentAuth(req){const key=String(req.headers['x-nuvexa-agent-key']||'');return Boolean(key&&key===AGENT_KEY)}

function cors(req,res){
  const origin=String(req.headers.origin||'').replace(/\/+$/,'');
  if(ALLOWED_ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Nuvexa-Agent-Key');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,OPTIONS');
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

function defaultState(){
  return {
    schemaVersion:3,
    version:'0.3.0',
    mode:'cloud',
    updatedAt:nowIso(),
    settings:{
      globalPublishEnabled:true,
      crossGroupInterval:{minMs:2000,maxMs:3000},
      sameGroupInterval:{minMs:2000,maxMs:3000},
    },
    collector:{
      status:'WAITING_CREDENTIALS',
      running:false,
      lastHeartbeatAt:null,
      lastCollectedAt:null,
      todayCollected:0,
      parsed:0,
      rejected:0,
      sourceChats:[],
    },
    accounts:[],
    groups:[],
    tasks:[],
    pendingImages:[],
    queue:{
      paused:false,
      pauseReason:'',
      headTaskId:null,
      lastAck:null,
      updatedAt:nowIso(),
    },
  };
}
async function getState(){
  const raw=await redis.get(STATE_KEY);
  if(!raw)return defaultState();
  try{
    const s=JSON.parse(raw);
    const d=defaultState();
    return {
      ...d,...s,
      settings:{...d.settings,...(s.settings||{}),
        crossGroupInterval:{...d.settings.crossGroupInterval,...(s.settings?.crossGroupInterval||{})},
        sameGroupInterval:{...d.settings.sameGroupInterval,...(s.settings?.sameGroupInterval||{})},
      },
      collector:{...d.collector,...(s.collector||{})},
      queue:{...d.queue,...(s.queue||{})},
      accounts:Array.isArray(s.accounts)?s.accounts:[],
      groups:Array.isArray(s.groups)?s.groups:[],
      tasks:Array.isArray(s.tasks)?s.tasks:[],
      pendingImages:Array.isArray(s.pendingImages)?s.pendingImages:[],
    };
  }catch{return defaultState()}
}
async function setState(state){
  state.updatedAt=nowIso();
  await redis.set(STATE_KEY,JSON.stringify(state));
  return state;
}
async function withLock(fn){
  const token=randomUUID();
  const ok=await redis.set(LOCK_KEY,token,{NX:true,PX:5000});
  if(!ok)throw Object.assign(new Error('QUEUE_BUSY'),{status:409});
  try{return await fn()}
  finally{
    try{if(await redis.get(LOCK_KEY)===token)await redis.del(LOCK_KEY)}catch{}
  }
}

function normalizeRange(value,prev){
  let minMs=Number(value?.minMs);
  let maxMs=Number(value?.maxMs);
  if(!Number.isFinite(minMs))minMs=Number(prev?.minMs)||2000;
  if(!Number.isFinite(maxMs))maxMs=Number(prev?.maxMs)||3000;
  minMs=clamp(Math.round(minMs),0,600000);
  maxMs=clamp(Math.round(maxMs),0,600000);
  if(minMs>maxMs)[minMs,maxMs]=[maxMs,minMs];
  return {minMs,maxMs};
}
function normalizeAccount(a,index=0){
  const kind=['ASSISTANT','PROFESSOR','AUXILIARY','AUX_BACKUP'].includes(a.kind)?a.kind:'AUXILIARY';
  const slot=['PRIMARY','BACKUP'].includes(a.slot)?a.slot:(kind==='AUX_BACKUP'?'BACKUP':'PRIMARY');
  const status=['ONLINE','OFFLINE','UNCONFIGURED','CONFIRMED_UNAVAILABLE','NEEDS_QR','VERIFYING'].includes(a.status)?a.status:'UNCONFIGURED';
  return {
    id:safeString(a.id,120)||randomUUID(),
    name:safeString(a.name,120)||('账号 '+(index+1)),
    kind,slot,status,
    auxCode:safeString(a.auxCode,32),
    backupOrder:Math.max(0,Number(a.backupOrder)||0),
    phoneLast4:safeString(a.phoneLast4,8),
    sessionId:safeString(a.sessionId,160),
    lastHeartbeatAt:a.lastHeartbeatAt||null,
    lastSentAt:a.lastSentAt||null,
    meta:a.meta&&typeof a.meta==='object'?a.meta:{},
  };
}
function normalizeGroup(g,index=0){
  return {
    id:safeString(g.id||g.groupId,220)||randomUUID(),
    name:safeString(g.name||g.groupName,220)||('群组 '+(index+1)),
    enabled:g.enabled!==false,
    order:Math.max(1,Number(g.order)||index+1),
    lastSentAt:g.lastSentAt||null,
  };
}
function logicalSenderKey(task){
  if(task.role==='AUXILIARY')return 'AUXILIARY:'+safeString(task.auxCode,32);
  return task.role;
}
function isAccountOnline(a){return a?.status==='ONLINE'}
function selectSender(state,task){
  const accounts=state.accounts||[];
  let primary=null;
  if(task.role==='ASSISTANT')primary=accounts.find(a=>a.kind==='ASSISTANT'&&a.slot==='PRIMARY');
  else if(task.role==='PROFESSOR')primary=accounts.find(a=>a.kind==='PROFESSOR'&&a.slot==='PRIMARY');
  else primary=accounts.find(a=>a.kind==='AUXILIARY'&&a.slot==='PRIMARY'&&String(a.auxCode)===String(task.auxCode));

  if(!primary)return {blocked:true,reason:'PRIMARY_ACCOUNT_NOT_CONFIGURED'};
  if(isAccountOnline(primary))return {account:primary,backup:false};
  if(primary.status!=='CONFIRMED_UNAVAILABLE'){
    return {blocked:true,reason:'AWAITING_PRIMARY_CONFIRMATION',account:primary};
  }

  if(task.role==='ASSISTANT'){
    const backup=accounts.find(a=>a.kind==='ASSISTANT'&&a.slot==='BACKUP');
    if(isAccountOnline(backup))return {account:backup,backup:true,replaces:primary.id};
    return {blocked:true,reason:'ASSISTANT_BACKUP_UNAVAILABLE',account:backup||null};
  }
  if(task.role==='PROFESSOR'){
    const backup=accounts.find(a=>a.kind==='PROFESSOR'&&a.slot==='BACKUP');
    if(isAccountOnline(backup))return {account:backup,backup:true,replaces:primary.id};
    return {blocked:true,reason:'PROFESSOR_BACKUP_UNAVAILABLE',account:backup||null};
  }
  const backups=accounts.filter(a=>a.kind==='AUX_BACKUP'&&a.slot==='BACKUP').sort((a,b)=>(a.backupOrder||999)-(b.backupOrder||999));
  for(const backup of backups){
    if(isAccountOnline(backup))return {account:backup,backup:true,replaces:primary.id};
    if(backup.status!=='CONFIRMED_UNAVAILABLE'){
      return {blocked:true,reason:'AWAITING_AUX_BACKUP_CONFIRMATION',account:backup};
    }
  }
  return {blocked:true,reason:'AUX_BACKUP_POOL_UNAVAILABLE'};
}
function parseTelegram(input){
  const raw=safeString(input.text??input.caption,12000);
  const explicitRole=safeString(input.role,32).toUpperCase();
  let role='',auxCode=safeString(input.auxCode,32);
  if(['ASSISTANT','PROFESSOR','AUXILIARY'].includes(explicitRole))role=explicitRole;
  if(!role){
    const m=raw.match(/^\s*(助理|教授|辅助(?:号)?\s*([0-9]{1,3}))/m);
    if(m){
      if(m[1].startsWith('助理'))role='ASSISTANT';
      else if(m[1].startsWith('教授'))role='PROFESSOR';
      else {role='AUXILIARY';auxCode=safeString(m[2],32)}
    }
  }
  let romanian=safeString(input.romanianText,10000);
  if(!romanian){
    const m=raw.match(/罗马尼亚(?:语|文字)?\s*[:：]\s*([\s\S]+)$/i);
    if(m)romanian=safeString(m[1],10000);
  }
  const mediaRef=safeString(input.mediaRef||input.imageUrl,2000);
  if(!role)return {ok:false,error:'ROLE_NOT_RECOGNIZED'};
  if(role==='AUXILIARY'&&!auxCode)return {ok:false,error:'AUX_CODE_REQUIRED'};
  if(!romanian&&!mediaRef)return {ok:false,error:'ROMANIAN_TRANSLATION_REQUIRED',role,auxCode,roleName:safeString(input.roleName,120)||((raw.match(/^\s*(助理|教授|辅助(?:号)?\s*[0-9]{1,3})/m)||[])[1]||'')};
  return {ok:true,role,auxCode,romanianText:romanian,mediaRef,raw,roleName:safeString(input.roleName,120)||((raw.match(/^\s*(助理|教授|辅助(?:号)?\s*[0-9]{1,3})/m)||[])[1]||'')};
}
function enabledTargets(state){
  return (state.groups||[]).filter(g=>g.enabled).sort((a,b)=>a.order-b.order).map(g=>({
    id:randomUUID(),
    groupId:g.id,
    groupName:g.name,
    status:'WAITING',
    attempts:0,
    senderAccountId:null,
    senderAccountName:null,
    leaseId:null,
    leaseUntil:null,
    notBefore:null,
    ackedAt:null,
    error:null,
  }));
}
function deriveTaskStatus(task){
  if((task.targets||[]).some(t=>t.status==='VERIFYING'))return 'VERIFYING';
  if((task.targets||[]).some(t=>t.status==='SENDING'))return 'SENDING';
  if((task.targets||[]).some(t=>t.status==='WAITING'))return 'WAITING';
  if((task.targets||[]).some(t=>t.status==='FAILED'))return 'FAILED';
  return 'ACKED';
}
function reconcile(state){
  const groupMap=new Map((state.groups||[]).map(g=>[g.id,g]));
  for(const task of state.tasks||[]){
    for(const target of task.targets||[]){
      const group=groupMap.get(target.groupId);
      if(target.status==='WAITING'&&(!group||group.enabled===false)){
        target.status='SKIPPED_DISABLED';
        target.error='GROUP_DISABLED';
      }
      if(target.status==='SENDING'&&target.leaseUntil&&Date.parse(target.leaseUntil)<=Date.now()){
        target.status='VERIFYING';
        target.error='LEASE_EXPIRED_RESULT_UNKNOWN';
      }
    }
    task.status=deriveTaskStatus(task);
    if(task.status==='ACKED'&&!task.completedAt)task.completedAt=nowIso();
  }
  const head=(state.tasks||[]).find(t=>!TERMINAL_TASKS.has(t.status));
  state.queue.headTaskId=head?.id||null;
  state.queue.updatedAt=nowIso();
  return head||null;
}
function summary(state){
  const targets=(state.tasks||[]).flatMap(t=>t.targets||[]);
  const counts={waiting:0,processing:0,success:0,failed:0,verifying:0,skipped:0,total:targets.length};
  for(const t of targets){
    if(t.status==='ACKED')counts.success++;
    else if(t.status==='FAILED')counts.failed++;
    else if(t.status==='SENDING')counts.processing++;
    else if(t.status==='VERIFYING')counts.verifying++;
    else if(t.status==='SKIPPED_DISABLED')counts.skipped++;
    else counts.waiting++;
  }
  const completed=counts.success+counts.failed;
  counts.successRate=completed?counts.success/completed*100:0;
  counts.onlineAccounts=(state.accounts||[]).filter(a=>a.status==='ONLINE').length;
  counts.totalAccounts=(state.accounts||[]).length;
  counts.enabledGroups=(state.groups||[]).filter(g=>g.enabled).length;
  counts.totalGroups=(state.groups||[]).length;
  counts.queuePaused=Boolean(state.queue?.paused);
  return counts;
}
function publicState(state){
  reconcile(state);
  return {
    schemaVersion:state.schemaVersion,
    version:state.version,
    mode:state.mode,
    updatedAt:state.updatedAt,
    settings:state.settings,
    collector:state.collector,
    accounts:state.accounts,
    groups:state.groups,
    tasks:(state.tasks||[]).slice(-200),
    queue:state.queue,
    summary:summary(state),
  };
}
function intervalFor(state,task,target){
  if(task.messageType==='IMAGE')return 0;
  const last=state.queue?.lastAck;
  if(!last||last.logicalSenderKey!==logicalSenderKey(task))return 0;
  const range=last.groupId===target.groupId?state.settings.sameGroupInterval:state.settings.crossGroupInterval;
  const elapsed=last.at?Math.max(0,Date.now()-Date.parse(last.at)):0;
  return Math.max(0,randomMs(range.minMs,range.maxMs)-elapsed);
}

async function handleLease(){
  return await withLock(async()=>{
    const state=await getState();
    const head=reconcile(state);
    if(state.queue.paused){
      await setState(state);
      return {status:'QUEUE_PAUSED',reason:state.queue.pauseReason||'MANUAL_PAUSE'};
    }
    if(!state.settings.globalPublishEnabled){
      await setState(state);
      return {status:'GLOBAL_PUBLISH_DISABLED'};
    }
    if(!head){
      await setState(state);
      return {status:'IDLE'};
    }
    const verifying=(head.targets||[]).find(t=>t.status==='VERIFYING');
    if(verifying){
      await setState(state);
      return {status:'VERIFYING',taskId:head.id,targetId:verifying.id,reason:verifying.error||'RESULT_UNKNOWN'};
    }
    const active=(head.targets||[]).find(t=>t.status==='SENDING');
    if(active){
      await setState(state);
      return {status:'LEASE_ACTIVE',taskId:head.id,targetId:active.id,leaseUntil:active.leaseUntil};
    }
    const target=(head.targets||[]).find(t=>t.status==='WAITING');
    if(!target){
      head.status=deriveTaskStatus(head);
      reconcile(state);
      await setState(state);
      return {status:'IDLE'};
    }
    const selection=selectSender(state,head);
    if(selection.blocked){
      state.queue.pauseReason=selection.reason;
      await setState(state);
      return {status:'BLOCKED',reason:selection.reason,taskId:head.id,accountId:selection.account?.id||null};
    }

    if(!target.notBefore){
      const delay=intervalFor(state,head,target);
      if(delay>0)target.notBefore=new Date(Date.now()+delay).toISOString();
    }
    const remaining=target.notBefore?Date.parse(target.notBefore)-Date.now():0;
    if(remaining>0){
      await setState(state);
      return {status:'WAIT_INTERVAL',waitMs:remaining,taskId:head.id,targetId:target.id};
    }

    const leaseId=randomUUID();
    target.status='SENDING';
    target.attempts=(target.attempts||0)+1;
    target.senderAccountId=selection.account.id;
    target.senderAccountName=selection.account.name;
    target.backup=Boolean(selection.backup);
    target.replacesAccountId=selection.replaces||null;
    target.leaseId=leaseId;
    target.leaseUntil=new Date(Date.now()+45_000).toISOString();
    head.status='SENDING';
    head.activeSenderId=selection.account.id;
    await setState(state);
    return {
      status:'DISPATCHED',
      leaseId,
      leaseUntil:target.leaseUntil,
      task:{
        id:head.id,
        sequence:head.sequence,
        logicalSenderKey:logicalSenderKey(head),
        role:head.role,
        auxCode:head.auxCode||'',
        romanianText:head.romanianText||'',
        mediaRef:head.mediaRef||'',
        messageType:head.messageType||'TEXT',
        roleName:head.roleName||'',
        sourceMessageId:head.sourceMessageId||'',
      },
      target:{id:target.id,groupId:target.groupId,groupName:target.groupName},
      sender:{
        accountId:selection.account.id,
        name:selection.account.name,
        kind:selection.account.kind,
        slot:selection.account.slot,
        backup:Boolean(selection.backup),
        replacesAccountId:selection.replaces||null,
      },
    };
  });
}

const server=createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname==='/v1/health'&&req.method==='GET'){
      const state=await getState();
      reconcile(state);
      return send(res,200,{ok:true,redis:redis.isReady,mode:'cloud',version:'0.3.0',summary:summary(state),timestamp:nowIso()});
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

    if(url.pathname==='/v1/collector/telegram/status'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      const state=await getState();
      state.collector={...state.collector,
        running:input.running===true,
        status:safeString(input.status,64)||state.collector.status,
        lastHeartbeatAt:nowIso(),
        sourceChats:Array.isArray(input.sourceChats)?input.sourceChats.slice(0,50).map(x=>safeString(x,220)):state.collector.sourceChats,
      };
      await setState(state);
      return send(res,200,{ok:true,collector:state.collector});
    }

    if(url.pathname==='/v1/collector/telegram/ingest'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      const parsed=parseTelegram(input);
      const state=await getState();
      const chatId=safeString(input.sourceChatId,220);
      const messageId=safeString(input.sourceMessageId,220);
      const senderId=safeString(input.sourceSenderId,220);
      const media=safeString(input.mediaRef||input.imageUrl,2000);
      const now=nowIso();
      state.pendingImages=(state.pendingImages||[]).filter(p=>p&&Date.parse(p.receivedAt)>Date.now()-180000).slice(-100);
      state.collector.todayCollected=(state.collector.todayCollected||0)+1;
      state.collector.lastCollectedAt=now;
      state.collector.lastHeartbeatAt=now;
      state.collector.running=true;
      state.collector.status='RUNNING';
      // A photo without a role is held for the next matching role message.
      // No image content analysis, OCR or translation is performed.
      if(media&&!parsed.role){
        if(!chatId||!messageId)return send(res,422,{error:'PHOTO_SOURCE_REQUIRED'});
        if(!state.pendingImages.some(p=>p.chatId===chatId&&p.messageId===messageId)){
          state.pendingImages.push({chatId,messageId,senderId,threadId:safeString(input.sourceThreadId,220),media,receivedAt:now});
        }
        state.pendingImages=state.pendingImages.slice(-100);
        await setState(state);
        return send(res,202,{ok:true,queued:false,status:'AWAITING_ROLE',imageInspected:false});
      }
      if(!parsed.role){
        state.collector.rejected=(state.collector.rejected||0)+1;
        await setState(state);
        return send(res,422,{error:parsed.error||'ROLE_NOT_RECOGNIZED'});
      }
      const replyId=safeString(input.replyToMessageId,220);
      const threadId=safeString(input.sourceThreadId,220);
      const candidates=media?[]:state.pendingImages.filter(p=>
        p.chatId===chatId&&(replyId?true:Boolean(senderId&&p.senderId&&senderId===p.senderId))&&
        (!threadId||!p.threadId||threadId===p.threadId)&&
        (replyId?p.messageId===replyId:(!/^\d+$/.test(messageId)||!/^\d+$/.test(p.messageId)||BigInt(messageId)>BigInt(p.messageId)))
      );
      if(candidates.length>1){
        await setState(state);
        return send(res,409,{error:'AMBIGUOUS_PHOTO_PAIR',queued:false});
      }
      const paired=candidates[0]||null;
      const photoRef=media||paired?.media||'';
      const rawText=safeString(input.text??input.caption,12000);
      const roleOnly=rawText.replace(/^\s*(助理|教授|辅助(?:号)?\s*[0-9]{1,3})\s*/m,'').trim()==='';
      const containsText=Boolean(parsed.romanianText)||(!roleOnly&&Boolean(rawText));
      if(!photoRef&&!parsed.romanianText){
        await setState(state);
        return send(res,422,{error:containsText?'ROMANIAN_TRANSLATION_REQUIRED':'MESSAGE_CONTENT_REQUIRED',queued:false});
      }
      const imageMessageId=paired?.messageId||messageId;
      const knownImage=state.tasks.find(t=>t.sourceChatId===chatId&&t.sourceMessageId===imageMessageId&&t.messageType==='IMAGE');
      const knownText=state.tasks.find(t=>t.sourceChatId===chatId&&t.sourceMessageId===messageId&&t.messageType!=='IMAGE');
      const targets=()=>enabledTargets(state);
      const taskIds=[];
      function queueItem(kind,sourceId,ref,romanian){
        const task={
          id:randomUUID(),messageType:kind,
          sequence:(state.tasks.reduce((m,t)=>Math.max(m,Number(t.sequence)||0),0)||0)+1,
          sourceChatId:chatId,sourceMessageId:sourceId,
          sourceAt:input.sourceAt||now,createdAt:now,
          role:parsed.role,roleName:parsed.roleName||parsed.role,
          auxCode:parsed.auxCode||'',romanianText:romanian,mediaRef:ref,
          status:'WAITING',completedAt:null,targets:targets()
        };
        if(!task.targets.length){task.status='ACKED';task.completedAt=now;}
        state.tasks.push(task);taskIds.push(task.id);
      }
      // The image is ready once its sending role is known. Translation does not delay it.
      if(photoRef&&!knownImage)queueItem('IMAGE',imageMessageId,photoRef,'');
      if(parsed.romanianText&&!knownText)queueItem('TEXT',messageId,'',parsed.romanianText);
      if(paired&&(!containsText||parsed.romanianText))state.pendingImages=state.pendingImages.filter(p=>p!==paired);
      if(!taskIds.length){
        await setState(state);
        if(containsText&&!parsed.romanianText)return send(res,422,{error:'ROMANIAN_TRANSLATION_REQUIRED',queued:false,hasImage:Boolean(photoRef)});
        return send(res,200,{ok:true,duplicate:true,taskId:knownText?.id||knownImage?.id||null});
      }
      state.tasks=state.tasks.slice(-1000);
      state.collector.parsed=(state.collector.parsed||0)+1;
      reconcile(state);
      await setState(state);
      return send(res,containsText&&!parsed.romanianText?202:201,{ok:true,taskIds,messageCount:taskIds.length,
        role:parsed.role,roleName:parsed.roleName||parsed.role,hasImage:Boolean(photoRef),
        translationRequired:Boolean(containsText&&!parsed.romanianText),
        textRequiresInterval:Boolean(parsed.romanianText),targetCount:state.groups.filter(g=>g.enabled).length});
    }

    if(url.pathname==='/v1/worker/lease'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      return send(res,200,await handleLease());
    }
    if(url.pathname==='/v1/worker/authorize'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      return await withLock(async()=>{
        const state=await getState();
        const leaseId=safeString(input.leaseId,120);
        let task=null,target=null;
        for(const t of state.tasks){
          const hit=(t.targets||[]).find(x=>x.leaseId===leaseId);
          if(hit){task=t;target=hit;break}
        }
        if(!task||!target)return send(res,404,{error:'LEASE_NOT_FOUND'});
        if(target.status!=='SENDING')return send(res,409,{error:'LEASE_NOT_ACTIVE',status:target.status});
        if(target.leaseUntil&&Date.parse(target.leaseUntil)<=Date.now()){
          target.status='VERIFYING';
          target.error='LEASE_EXPIRED_RESULT_UNKNOWN';
          await setState(state);
          return send(res,409,{authorized:false,error:'RESULT_MUST_BE_VERIFIED'});
        }
        if(!state.settings.globalPublishEnabled){
          target.status='WAITING';
          target.leaseId=null;target.leaseUntil=null;target.notBefore=null;
          target.error='GLOBAL_PUBLISH_DISABLED';
          task.status=deriveTaskStatus(task);
          await setState(state);
          return send(res,200,{authorized:false,reason:'GLOBAL_PUBLISH_DISABLED'});
        }
        const group=state.groups.find(g=>g.id===target.groupId);
        if(!group||group.enabled===false){
          target.status='SKIPPED_DISABLED';
          target.leaseId=null;target.leaseUntil=null;
          target.error='GROUP_DISABLED_BEFORE_SEND';
          task.status=deriveTaskStatus(task);
          reconcile(state);
          await setState(state);
          return send(res,200,{authorized:false,reason:'GROUP_DISABLED'});
        }
        const sender=state.accounts.find(a=>a.id===target.senderAccountId);
        if(!sender||sender.status!=='ONLINE'){
          target.status='WAITING';
          target.leaseId=null;target.leaseUntil=null;target.notBefore=null;
          target.error='SENDER_NOT_ONLINE_BEFORE_SEND';
          task.status=deriveTaskStatus(task);
          await setState(state);
          return send(res,200,{authorized:false,reason:'SENDER_NOT_ONLINE'});
        }
        return send(res,200,{authorized:true,leaseId,targetId:target.id,groupId:target.groupId,senderAccountId:target.senderAccountId});
      });
    }

    if(url.pathname==='/v1/worker/account-status'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      return await withLock(async()=>{
        const state=await getState();
        const account=state.accounts.find(a=>a.id===safeString(input.accountId,120));
        if(!account)return send(res,404,{error:'ACCOUNT_NOT_FOUND'});
        const allowed=['ONLINE','OFFLINE','NEEDS_QR','VERIFYING','CONFIRMED_UNAVAILABLE'];
        if(!allowed.includes(input.status))return send(res,400,{error:'INVALID_ACCOUNT_STATUS'});
        account.status=input.status;
        account.lastHeartbeatAt=nowIso();
        if(input.sessionId!==undefined)account.sessionId=safeString(input.sessionId,160);
        if(input.phoneLast4!==undefined)account.phoneLast4=safeString(input.phoneLast4,8);
        if(input.meta&&typeof input.meta==='object')account.meta={...account.meta,...input.meta};
        await setState(state);
        return send(res,200,{ok:true,account});
      });
    }
    if(url.pathname==='/v1/worker/ack'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      return await withLock(async()=>{
        const state=await getState();
        const leaseId=safeString(input.leaseId,120);
        let task=null,target=null;
        for(const t of state.tasks){
          const hit=(t.targets||[]).find(x=>x.leaseId===leaseId);
          if(hit){task=t;target=hit;break}
        }
        if(!task||!target)return send(res,404,{error:'LEASE_NOT_FOUND'});
        if(target.status!=='SENDING')return send(res,409,{error:'LEASE_NOT_ACTIVE',status:target.status});
        const result=safeString(input.result,64).toUpperCase();
        const account=state.accounts.find(a=>a.id===target.senderAccountId);
        if(result==='ACKED'){
          target.status='ACKED';
          target.ackedAt=nowIso();
          target.error=null;
          target.leaseUntil=null;
          if(account){account.lastSentAt=target.ackedAt;account.status='ONLINE'}
          const group=state.groups.find(g=>g.id===target.groupId);if(group)group.lastSentAt=target.ackedAt;
          if(task.messageType!=='IMAGE')state.queue.lastAck={at:target.ackedAt,groupId:target.groupId,logicalSenderKey:logicalSenderKey(task),actualAccountId:target.senderAccountId};
        }else if(result==='CONFIRMED_UNAVAILABLE'){
          target.status='WAITING';
          target.error='SENDER_CONFIRMED_UNAVAILABLE';
          target.leaseId=null;target.leaseUntil=null;target.notBefore=null;
          if(account){account.status='CONFIRMED_UNAVAILABLE';account.lastHeartbeatAt=nowIso()}
        }else if(result==='NOT_SENT'){
          target.status='WAITING';
          target.error=safeString(input.error,500)||'CONFIRMED_NOT_SENT';
          target.leaseId=null;target.leaseUntil=null;target.notBefore=null;
        }else if(result==='FAILED'){
          target.status='FAILED';
          target.error=safeString(input.error,500)||'SEND_FAILED';
          target.leaseUntil=null;
        }else{
          target.status='VERIFYING';
          target.error=safeString(input.error,500)||'RESULT_UNKNOWN';
          target.leaseUntil=null;
        }
        task.status=deriveTaskStatus(task);
        reconcile(state);
        await setState(state);
        return send(res,200,{ok:true,taskStatus:task.status,targetStatus:target.status,headTaskId:state.queue.headTaskId});
      });
    }
    if(url.pathname==='/v1/worker/resolve'&&req.method==='POST'){
      if(!agentAuth(req))return send(res,401,{error:'AGENT_AUTH_REQUIRED'});
      const input=await body(req);
      return await withLock(async()=>{
        const state=await getState();
        const targetId=safeString(input.targetId,120);
        let task=null,target=null;
        for(const t of state.tasks){
          const hit=(t.targets||[]).find(x=>x.id===targetId);
          if(hit){task=t;target=hit;break}
        }
        if(!task||!target)return send(res,404,{error:'TARGET_NOT_FOUND'});
        if(target.status!=='VERIFYING')return send(res,409,{error:'TARGET_NOT_VERIFYING'});
        const resolution=safeString(input.resolution,32).toUpperCase();
        if(resolution==='ACKED'){
          target.status='ACKED';target.ackedAt=nowIso();target.error=null;
          if(task.messageType!=='IMAGE')state.queue.lastAck={at:target.ackedAt,groupId:target.groupId,logicalSenderKey:logicalSenderKey(task),actualAccountId:target.senderAccountId};
        }else if(resolution==='NOT_SENT'){
          target.status='WAITING';target.error='VERIFIED_NOT_SENT';target.leaseId=null;target.notBefore=null;
        }else return send(res,400,{error:'INVALID_RESOLUTION'});
        task.status=deriveTaskStatus(task);
        reconcile(state);
        await setState(state);
        return send(res,200,{ok:true,taskStatus:task.status,targetStatus:target.status});
      });
    }

    const user=userAuth(req);
    if(!user)return send(res,401,{error:'AUTH_REQUIRED'});

    if(url.pathname==='/v1/dashboard'&&req.method==='GET'){
      const state=await getState();
      const data=publicState(state);
      await setState(state);
      return send(res,200,data);
    }
    if(url.pathname==='/v1/accounts'&&req.method==='GET'){
      const state=await getState();
      return send(res,200,{items:state.accounts,summary:summary(state)});
    }
    if(url.pathname==='/v1/accounts'&&req.method==='PUT'){
      const input=await body(req);
      if(!Array.isArray(input.items))return send(res,400,{error:'items 必须是数组'});
      const state=await getState();
      const items=input.items.slice(0,200).map(normalizeAccount);
      const primaryAssistant=items.filter(a=>a.kind==='ASSISTANT'&&a.slot==='PRIMARY').length;
      const backupAssistant=items.filter(a=>a.kind==='ASSISTANT'&&a.slot==='BACKUP').length;
      const primaryProfessor=items.filter(a=>a.kind==='PROFESSOR'&&a.slot==='PRIMARY').length;
      const backupProfessor=items.filter(a=>a.kind==='PROFESSOR'&&a.slot==='BACKUP').length;
      if(primaryAssistant>1||backupAssistant>1||primaryProfessor>1||backupProfessor>1)return send(res,400,{error:'助理1/助理2/教授1/教授2各只能配置一个账号'});
      const auxCodes=new Set();
      for(const a of items.filter(x=>x.kind==='AUXILIARY'&&x.slot==='PRIMARY')){
        if(!a.auxCode)return send(res,400,{error:'普通辅助号必须设置唯一编号'});
        if(auxCodes.has(a.auxCode))return send(res,400,{error:'普通辅助号编号不能重复: '+a.auxCode});
        auxCodes.add(a.auxCode);
      }
      state.accounts=items;
      await setState(state);
      return send(res,200,{items:state.accounts});
    }
    if(url.pathname==='/v1/groups'&&req.method==='GET'){
      const state=await getState();
      return send(res,200,{items:state.groups});
    }
    if(url.pathname==='/v1/groups'&&req.method==='PUT'){
      const input=await body(req);
      if(!Array.isArray(input.items))return send(res,400,{error:'items 必须是数组'});
      const state=await getState();
      const items=input.items.slice(0,300).map(normalizeGroup);
      const ids=new Set();
      for(const g of items){
        if(ids.has(g.id))return send(res,400,{error:'群组 ID 不能重复: '+g.id});
        ids.add(g.id);
      }
      state.groups=items.sort((a,b)=>a.order-b.order);
      reconcile(state);
      await setState(state);
      return send(res,200,{items:state.groups});
    }
    if(url.pathname==='/v1/settings'&&req.method==='GET'){
      const state=await getState();
      return send(res,200,{settings:state.settings});
    }
    if(url.pathname==='/v1/settings'&&req.method==='PUT'){
      const input=await body(req);
      const state=await getState();
      if(input.globalPublishEnabled!==undefined)state.settings.globalPublishEnabled=input.globalPublishEnabled===true;
      if(input.crossGroupInterval)state.settings.crossGroupInterval=normalizeRange(input.crossGroupInterval,state.settings.crossGroupInterval);
      if(input.sameGroupInterval)state.settings.sameGroupInterval=normalizeRange(input.sameGroupInterval,state.settings.sameGroupInterval);
      await setState(state);
      return send(res,200,{settings:state.settings});
    }
    if(url.pathname==='/v1/queue'&&req.method==='GET'){
      const state=await getState();reconcile(state);await setState(state);
      return send(res,200,{queue:state.queue,tasks:(state.tasks||[]).slice(-200),summary:summary(state)});
    }
    if(url.pathname==='/v1/queue/pause'&&req.method==='POST'){
      const input=await body(req);
      const state=await getState();
      state.queue.paused=input.paused===true;
      state.queue.pauseReason=state.queue.paused?(safeString(input.reason,220)||'MANUAL_PAUSE'):'';
      await setState(state);
      return send(res,200,{queue:state.queue});
    }

    return send(res,404,{error:'NOT_FOUND'});
  }catch(error){
    console.error(error);
    return send(res,error.status||500,{error:error.message||'INTERNAL_ERROR'});
  }
});

server.listen(PORT,'0.0.0.0',()=>console.log('Nuvexa Pro Cloud API v0.3.0 listening on '+PORT));