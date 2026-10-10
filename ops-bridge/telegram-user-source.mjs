/* Telegram user-source connection (MTProto, no bot, no translation).
 * Session and API hash stay server-side, encrypted at rest. Live monitoring
 * is disabled until an administrator selects and enables exactly one group.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { identifySourceRole } from './telegram-collector.mjs';

const STORE='nuvexa:source:telegram:user:v1';
const expiresMs=10*60*1000;
function safeError(e){
  const name=String(e?.errorMessage||e?.code||e?.message||'SOURCE_UNAVAILABLE');
  if(/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PHONE_CODE_EMPTY|SESSION_PASSWORD_NEEDED|PASSWORD_HASH_INVALID|FLOOD_WAIT|PHONE_NUMBER_INVALID|API_ID_INVALID|AUTH_KEY_UNREGISTERED/i.test(name)){
    return name.replace(/[^\w ]/g,'_').slice(0,90);
  }
  return 'TELEGRAM_OPERATION_FAILED';
}
function assertText(value,max=200){return String(value??'').trim().slice(0,max)}
function normalizedId(value){return assertText(value,80)}
function numberId(value){return Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null}
function cryptoBox(secret){
  if(!secret||secret.length<16)throw Error('SESSION_ENCRYPTION_NOT_CONFIGURED');
  const key=Buffer.from(hkdfSync('sha256',Buffer.from(secret),'nuvexa-sessions-v1','telegram-mtproto-user',32));
  return {
    seal(obj){
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      const ciphertext=Buffer.concat([cipher.update(JSON.stringify(obj),'utf8'),cipher.final()]);
      return JSON.stringify({version:1,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')});
    },
    open(input){
      const data=JSON.parse(input);
      if(data.version!==1)throw Error('SOURCE_SESSION_VERSION');
      const decrypt=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'base64'));
      decrypt.setAuthTag(Buffer.from(data.tag,'base64'));
      return JSON.parse(Buffer.concat([decrypt.update(Buffer.from(data.ciphertext,'base64')),decrypt.final()]).toString('utf8'));
    }
  }
}
async function gram(){
  const t=await import('telegram');
  const a=t.default||t;
  const ss=await import('telegram/sessions/index.js');
  const se=ss.default||ss;
  const ev=await import('telegram/events/index.js');
  const e=ev.default||ev;
  const TelegramClient=t.TelegramClient||a.TelegramClient;
  const StringSession=ss.StringSession||se.StringSession;
  const NewMessage=ev.NewMessage||e.NewMessage;
  const Api=t.Api||a.Api;
  if(!TelegramClient||!StringSession||!NewMessage||!Api)throw Error('SOURCE_CLIENT_NOT_AVAILABLE');
  return {TelegramClient,StringSession,NewMessage,Api};
}
export function createTelegramSource({redis,secret,ingest,clientLibrary=gram,now=()=>Date.now()}){
  const box=cryptoBox(secret);
  let client=null, saved=null, pending=null, lastError='', connected=false, processing=Promise.resolve(), lastCollectedAt=null, collected=0;
  let dialogs=[];
  let loading=false;
  const getStatus=()=>({
    connected,enabled:connected&&Boolean(saved?.enabled&&saved?.chatId),
    selectedGroupId:saved?.chatId||'',selectedGroupName:saved?.chatTitle||'',
    phoneSuffix:saved?.phone?String(saved.phone).slice(-4):'',
    stage:pending?.stage||'',
    sessionStored:Boolean(saved?.session),
    lastCollectedAt,received:collected,error:lastError||'',
    configuredForCapture:Boolean(saved?.chatId&&saved?.enabled)
  });
  async function persist(){if(saved)await redis.set(STORE,box.seal(saved))}
  async function detach(){
    const old=client;client=null;connected=false;dialogs=[];
    if(old){try{await old.disconnect()}catch{}}
  }
  async function attach(c){
    client=c;connected=true;lastError='';dialogs=[];
    const {NewMessage}=await clientLibrary();
    c.addEventHandler(event=>{
      processing=processing.then(async()=>{
        if(!saved?.enabled||!saved?.chatId)return;
        if(normalizedId(event?.chatId)!==saved.chatId)return;
        const msg=event?.message;
        if(!msg||!msg.id)return;
        const text=String(msg.message??msg.text??'').trim();
        const hasImage=Boolean(msg.photo||(msg.document&&String(msg.document.mimeType||'').startsWith('image/')));
        if(!hasImage&&!identifySourceRole(text))return;
        const sourceChatId=saved.chatId;
        const sourceMessageId=String(msg.id);
        const sourceSenderId=normalizedId(msg.senderId)||sourceChatId;
        const input={sourceChatId,sourceMessageId,sourceSenderId,
          sourceThreadId:normalizedId(msg.replyTo?.replyToTopId)||'',
          replyToMessageId:normalizedId(msg.replyTo?.replyToMsgId)||'',
          text,mediaRef:hasImage?'tgmsg:'+sourceChatId+':'+sourceMessageId:''
        };
        await ingest(input);
        collected++;lastCollectedAt=new Date(now()).toISOString();
      }).catch(e=>{lastError=safeError(e)});
    },new NewMessage({}));
  }
  async function restore(){
    const raw=await redis.get(STORE);
    if(!raw)return getStatus();
    try{
      saved=box.open(raw);
      if(!saved?.session||!saved?.apiHash||!saved?.apiId)return getStatus();
      const {TelegramClient,StringSession}=await clientLibrary();
      const c=new TelegramClient(new StringSession(saved.session),Number(saved.apiId),saved.apiHash,{connectionRetries:3});
      await c.connect();
      if(!await c.checkAuthorization()){await c.disconnect();lastError='SESSION_REAUTH_REQUIRED';saved.enabled=false;return getStatus()}
      await attach(c);
    }catch(e){lastError=safeError(e);connected=false}
    return getStatus();
  }
  async function begin({apiId,apiHash,phone}){
    if(pending)throw Object.assign(Error('LOGIN_ALREADY_PENDING'),{status:409});
    if(saved?.session&&connected)throw Object.assign(Error('DISCONNECT_FIRST'),{status:409});
    const id=numberId(apiId),hash=assertText(apiHash,90),normalizedPhone=assertText(phone,32);
    if(!id||!/^[a-f0-9]{32}$/i.test(hash)||! /^\+[1-9]\d{6,15}$/.test(normalizedPhone))throw Object.assign(Error('INVALID_API_CREDENTIALS_OR_PHONE'),{status:400});
    const {TelegramClient,StringSession}=await clientLibrary();
    const c=new TelegramClient(new StringSession(''),id,hash,{connectionRetries:3});
    try{
      await c.connect();
      const code=await c.sendCode({apiId:id,apiHash:hash},normalizedPhone);
      pending={client:c,apiId:id,apiHash:hash,phone:normalizedPhone,phoneCodeHash:code.phoneCodeHash,
        stage:'code',started:now(),attempts:0};
      return {stage:'code',isCodeViaApp:code.isCodeViaApp===true};
    }catch(e){try{await c.disconnect()}catch{};throw Object.assign(Error(safeError(e)),{status:400})}
  }
  function getPending(stage){
    if(!pending||pending.stage!==stage)throw Object.assign(Error('LOGIN_STAGE_INVALID'),{status:409});
    if(now()-pending.started>expiresMs){
      const old=pending;pending=null;void old.client.disconnect().catch(()=>{});
      throw Object.assign(Error('LOGIN_EXPIRED'),{status:409});
    }
    if(pending.attempts++>=4)throw Object.assign(Error('TOO_MANY_ATTEMPTS'),{status:429});
    return pending;
  }
  async function finish(p){
    const me=await p.client.getMe();
    const session=p.client.session.save();
    saved={apiId:p.apiId,apiHash:p.apiHash,phone:p.phone,session:String(session),
      chatId:'',chatTitle:'',enabled:false,userId:String(me?.id||'')};
    await persist();pending=null;
    await attach(p.client);
    return getStatus();
  }
  async function verifyCode(raw){
    const p=getPending('code'),code=assertText(raw,16);
    if(!/^\d{4,8}$/.test(code))throw Object.assign(Error('INVALID_CODE_FORMAT'),{status:400});
    try{
      const {Api}=await clientLibrary();
      await p.client.invoke(new Api.auth.SignIn({phoneNumber:p.phone,phoneCodeHash:p.phoneCodeHash,phoneCode:code}));
      return await finish(p);
    }catch(e){
      if(String(e?.errorMessage||'')==='SESSION_PASSWORD_NEEDED'){p.stage='password';return {stage:'password',passwordRequired:true}}
      throw Object.assign(Error(safeError(e)),{status:400});
    }
  }
  async function verifyPassword(password){
    const p=getPending('password');
    if(!String(password||'').trim())throw Object.assign(Error('PASSWORD_REQUIRED'),{status:400});
    try{
      await p.client.signInWithPassword({apiId:p.apiId,apiHash:p.apiHash},{
        password:async()=>String(password),onError:async()=>true
      });
      return await finish(p);
    }catch(e){throw Object.assign(Error(safeError(e)),{status:400})}
  }
  async function listGroups(){
    if(!connected||!client)throw Object.assign(Error('TELEGRAM_NOT_CONNECTED'),{status:409});
    if(loading)throw Object.assign(Error('GROUP_LIST_IN_PROGRESS'),{status:409});
    loading=true;
    try{
      const ds=await client.getDialogs({limit:200});
      dialogs=ds.filter(d=>d.isGroup===true||d.isChannel===true).map(d=>({
        id:normalizedId(d.id),title:assertText(d.title||d.name||'未命名群组',180),entity:d.entity,
      })).filter(d=>d.id);
      return dialogs.map(({id,title})=>({id,title}));
    }finally{loading=false}
  }
  async function choose({chatId,enabled}){
    if(!connected||!saved)throw Object.assign(Error('TELEGRAM_NOT_CONNECTED'),{status:409});
    if(!dialogs.length)await listGroups();
    const target=dialogs.find(d=>d.id===normalizedId(chatId));
    if(!target)throw Object.assign(Error('SOURCE_GROUP_NOT_ACCESSIBLE'),{status:400});
    saved.chatId=target.id;saved.chatTitle=target.title;saved.enabled=enabled===true;
    await persist();return getStatus();
  }
  async function pause(){
    if(!saved)return getStatus();
    saved.enabled=false;await persist();return getStatus();
  }
  async function disconnect(){
    const p=pending;pending=null;
    if(p)try{await p.client.disconnect()}catch{}
    const active=client;
    saved=null;dialogs=[];client=null;connected=false;lastError='';
    await redis.del(STORE);
    if(active)try{await active.logOut()}catch{try{await active.disconnect()}catch{}}
    return getStatus();
  }
  async function download(ref){
    if(!connected||!client||!saved?.chatId)throw Object.assign(Error('SOURCE_NOT_CONNECTED'),{status:409});
    const m=String(ref||'').match(/^tgmsg:(-?\d+):(\d+)$/);
    if(!m||m[1]!==saved.chatId)throw Object.assign(Error('MEDIA_NOT_FROM_SELECTED_SOURCE'),{status:403});
    if(!dialogs.length)await listGroups();
    const d=dialogs.find(x=>x.id===saved.chatId);
    if(!d)throw Object.assign(Error('SOURCE_GROUP_NOT_ACCESSIBLE'),{status:404});
    const messages=await client.getMessages(d.entity,{ids:[Number(m[2])]});
    const original=messages?.[0];
    if(!original||( !original.photo && !original.document))throw Object.assign(Error('SOURCE_MEDIA_NOT_FOUND'),{status:404});
    if(Number(original.document?.size)>15*1024*1024)throw Object.assign(Error('MEDIA_TOO_LARGE'),{status:413});
    const bytes=await client.downloadMedia(original,{workers:1});
    if(!Buffer.isBuffer(bytes)||bytes.length>15*1024*1024)throw Object.assign(Error('MEDIA_UNAVAILABLE'),{status:502});
    return {bytes,contentType:original.photo?'image/jpeg':String(original.document?.mimeType||'application/octet-stream')};
  }
  return {status:getStatus,restore,begin,verifyCode,verifyPassword,listGroups,choose,pause,disconnect,download};
}
