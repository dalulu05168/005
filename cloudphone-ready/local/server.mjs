import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { JsonStore, validUsers, validMetadata, validateRegistry } from './lib/store.mjs';
import { Android } from './lib/android.mjs';

const VERSION='2.2.0', host='127.0.0.1', port=3077, origin=`http://${host}:${port}`;
const root=path.dirname(fileURLToPath(import.meta.url)), publicDir=path.join(root,'public');
const base=path.join(process.env.LOCALAPPDATA||process.cwd(),'CloudPhone'); await mkdir(base,{recursive:true});
const store=new JsonStore(base);
const config=await store.read('local-config.json',{},x=>x&&typeof x==='object'&&typeof x.sdkRoot==='string'&&typeof x.statePath==='string');
const registry=validateRegistry(await store.read(path.basename(config.statePath),[],Array.isArray).catch(async e=>{
  // statePath may be outside base in an existing installation.
  try{return validateRegistry(JSON.parse((await readFile(config.statePath,'utf8')).replace(/^\uFEFF/,'')));}catch{throw e;}
}));
const android=new Android(config,base), sessions=new Map(), jobs=new Map(), deviceQueues=new Map();
const inviteCode=String(config.inviteCode||'521314');
setInterval(()=>{const now=Date.now();for(const [k,v] of sessions)if(v.expiresAt<now)sessions.delete(k);for(const [k,v] of jobs)if(v.updatedAt+86400000<now)jobs.delete(k);},600000).unref();

function headers(){return {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"};}
function json(res,status,data,extra={}){const body=JSON.stringify(data);res.writeHead(status,{...headers(),'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),...extra});res.end(body);}
function text(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{...headers(),'Content-Type':type,'Content-Length':Buffer.byteLength(body)});res.end(body);}
function cookies(req){const out={};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}catch{}}return out;}
function session(req){const token=cookies(req).cp_session,s=sessions.get(token);if(!s||s.expiresAt<Date.now()){if(token)sessions.delete(token);return null}return {...s,token};}
function auth(req,res){const s=session(req);if(!s){json(res,401,{error:'请先登录。'});return null}return s;}
function postOrigin(req,res){if(req.headers.origin!==origin){json(res,403,{error:'请求来源不受信任。'});return false}return true;}
async function body(req){return new Promise((resolve,reject)=>{let raw='',done=false;req.on('data',c=>{if(done)return;raw+=c;if(Buffer.byteLength(raw)>32768){done=true;reject(new Error('请求数据过大'));req.destroy();}});req.on('end',()=>{if(done)return;try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('JSON 格式错误'))}});req.on('error',reject);});}
const email=x=>String(x||'').trim().toLowerCase();
function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,passwordHash:crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('hex')}}
function verify(password,u){try{const a=Buffer.from(passwordHash(password,u.salt).passwordHash,'hex'),b=Buffer.from(u.passwordHash,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
function newSession(value){const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{email:value,expiresAt:Date.now()+43200000});return token;}
function instance(id){const row=registry.find(x=>x.deviceId===id);if(!row)throw new Error('设备不存在');return row;}
function cleanError(e){return String(e?.message||e||'操作失败').replace(/[\r\n]+/g,' ').slice(0,500)}
function queueJob(deviceId,type,fn){
  const id=crypto.randomUUID(),controller=new AbortController(),job={id,deviceId,type,status:'queued',message:'已排队',createdAt:Date.now(),updatedAt:Date.now(),controller};jobs.set(id,job);
  const run=(deviceQueues.get(deviceId)||Promise.resolve()).then(async()=>{job.status='running';job.message='正在执行';job.updatedAt=Date.now();try{job.result=await fn(controller.signal);job.status='completed';job.message='完成'}catch(e){job.status=controller.signal.aborted?'cancelled':'failed';job.message=cleanError(e)}finally{job.updatedAt=Date.now()}});
  const tail=run.catch(()=>{});deviceQueues.set(deviceId,tail);tail.then(()=>{if(deviceQueues.get(deviceId)===tail)deviceQueues.delete(deviceId)});return job;
}
function publicJob(j){return {id:j.id,deviceId:j.deviceId,type:j.type,status:j.status,message:j.message,result:j.result,createdAt:j.createdAt,updatedAt:j.updatedAt}}
async function listDevices(){const [states,metadata]=await Promise.all([android.list(registry),store.read('device-metadata.json',{},validMetadata)]);return states.sort((a,b)=>a.port-b.port).map((d,i)=>{const active=[...jobs.values()].find(j=>j.deviceId===d.deviceId&&['queued','running'].includes(j.status));const booting=active&&['start','reboot'].includes(active.type);return {...d,status:booting?'starting':d.status,lastError:booting?'Android 正在启动，ADB 暂时 offline 属于正常过程。':d.lastError,activeJob:active?publicJob(active):null,displayName:metadata[d.deviceId]?.displayName||`云手机-${String(i+1).padStart(2,'0')}`,whatsappLast4:metadata[d.deviceId]?.whatsappLast4||'',businessLast4:metadata[d.deviceId]?.businessLast4||'',note:metadata[d.deviceId]?.note||'',confirmedAt:metadata[d.deviceId]?.confirmedAt||''}});}
async function staticFile(res,urlPath){const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'},name=files[urlPath];if(!name)return text(res,404,'Not Found');try{const data=await readFile(path.join(publicDir,name));const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8';res.writeHead(200,{...headers(),'Content-Type':type,'Content-Length':data.length});res.end(data)}catch{text(res,404,'Not Found')}}

const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==`${host}:${port}`||(req.headers.origin&&req.headers.origin!==origin))return json(res,403,{error:'请求来源不受信任。'});
  const u=new URL(req.url,origin),p=u.pathname;
  if(req.method==='GET'&&p==='/health')return json(res,200,{ok:true,app:'cloudphone-local',version:VERSION,pid:process.pid});
  if(req.method==='GET'&&p==='/api/auth/me'){const s=session(req);return json(res,200,s?{authenticated:true,email:s.email}:{authenticated:false});}
  if(req.method==='POST'&&p==='/api/auth/register'){
    if(!postOrigin(req,res))return;const b=await body(req),mail=email(b.email),password=String(b.password||'');
    if(String(b.inviteCode||'')!==inviteCode)return json(res,403,{error:'邀请码错误。'});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||mail.length>160)return json(res,400,{error:'邮箱格式错误。'});if(password.length<10||password.length>128)return json(res,400,{error:'密码需要 10–128 位。'});
    let created=false;await store.transaction('app-users.json',[],validUsers,users=>{if(users.some(x=>email(x.email)===mail))throw new Error('该邮箱已经注册。');users.push({email:mail,...passwordHash(password),createdAt:new Date().toISOString()});created=true});
    if(!created)throw new Error('注册失败');const token=newSession(mail);return json(res,200,{ok:true,email:mail},{'Set-Cookie':`cp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
  }
  if(req.method==='POST'&&p==='/api/auth/login'){
    if(!postOrigin(req,res))return;const b=await body(req),mail=email(b.email),password=String(b.password||'');const users=await store.read('app-users.json',[],validUsers);
    const user=users.find(x=>email(x.email)===mail);if(!user||!verify(password,user))return json(res,401,{error:'邮箱或密码错误。'});const token=newSession(mail);return json(res,200,{ok:true,email:mail},{'Set-Cookie':`cp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`});
  }
  if(req.method==='POST'&&p==='/api/auth/logout'){if(!postOrigin(req,res))return;const s=session(req);if(s)sessions.delete(s.token);return json(res,200,{ok:true},{'Set-Cookie':'cp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(p.startsWith('/api/')){if(!auth(req,res))return;
    if(req.method==='GET'&&p==='/api/diagnostics')return json(res,200,{...(await android.diagnostics()),registered:registry.length,version:VERSION});
    if(req.method==='GET'&&p==='/api/devices')return json(res,200,await listDevices());
    let m=p.match(/^\/api\/jobs\/([a-f0-9-]+)$/i);if(req.method==='GET'&&m){const j=jobs.get(m[1]);return j?json(res,200,publicJob(j)):json(res,404,{error:'任务不存在或已过期。'});}
    if(req.method==='POST'&&m){if(!postOrigin(req,res))return;const j=jobs.get(m[1]);if(!j)return json(res,404,{error:'任务不存在。'});if(!['queued','running'].includes(j.status))return json(res,409,{error:'任务已结束。'});j.controller.abort();j.message='正在取消';return json(res,202,publicJob(j));}
    m=p.match(/^\/api\/devices\/([^/]+)\/meta$/);if(req.method==='POST'&&m){if(!postOrigin(req,res))return;const id=decodeURIComponent(m[1]);instance(id);const b=await body(req),wa=String(b.whatsappLast4||'').trim(),biz=String(b.businessLast4||'').trim(),name=String(b.displayName||'').trim(),note=String(b.note||'').trim();if((wa&&!/^\d{4}$/.test(wa))||(biz&&!/^\d{4}$/.test(biz)))return json(res,400,{error:'尾号必须为四位数字或留空。'});if(name.length>32||note.length>80)return json(res,400,{error:'设备名称或备注过长。'});await store.transaction('device-metadata.json',{},validMetadata,data=>{data[id]={displayName:name,whatsappLast4:wa,businessLast4:biz,note,confirmedAt:new Date().toISOString()}});return json(res,200,{ok:true});}
    m=p.match(/^\/api\/devices\/([^/]+)\/frame$/);if(req.method==='GET'&&m)return json(res,200,await android.frame(instance(decodeURIComponent(m[1]))));
    m=p.match(/^\/api\/devices\/([^/]+)\/accounts$/);if(req.method==='GET'&&m)return json(res,200,await android.accounts(instance(decodeURIComponent(m[1]))));
    m=p.match(/^\/api\/devices\/([^/]+)\/open-app$/);if(req.method==='POST'&&m){if(!postOrigin(req,res))return;const row=instance(decodeURIComponent(m[1])),b=await body(req);return json(res,202,publicJob(queueJob(row.deviceId,'open-app',s=>android.openApp(row,b,s))));}
    m=p.match(/^\/api\/devices\/([^/]+)\/screen-(key|tap|swipe|text)$/);if(req.method==='POST'&&m){if(!postOrigin(req,res))return;const row=instance(decodeURIComponent(m[1])),b=await body(req);await android.screen(row,m[2],b);return json(res,200,{ok:true});}
    m=p.match(/^\/api\/devices\/([^/]+)\/(start|stop|reboot|recover|mirror)$/);if(req.method==='POST'&&m){if(!postOrigin(req,res))return;const row=instance(decodeURIComponent(m[1])),action=m[2];const job=queueJob(row.deviceId,action,s=>android[action](row,s));return json(res,202,publicJob(job));}
    return json(res,404,{error:'接口不存在。'});
  }
  if(req.method==='GET')return staticFile(res,p);return json(res,404,{error:'Not Found'});
}catch(e){console.error(e);return json(res,/已经注册|格式|过长|无效|不存在/.test(cleanError(e))?400:500,{error:cleanError(e)})}});
server.listen(port,host,()=>console.log(`CloudPhone ${VERSION}: ${origin}`));
