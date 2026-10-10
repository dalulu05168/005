/**
 * Nuvexa Pro single-account CLOUD QR bridge.
 * No WhatsApp message sending. Requires a real paid disk mounted /var/data.
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { WhatsAppSessionRuntime } from './runtime.mjs';

const PORT=Number(process.env.PORT||10000);
const ORIGIN='https://nuvexa-ops-bridge.onrender.com';
const DATA_DIR=path.resolve(process.env.NUVEXA_CLOUD_DATA_DIR||'/var/data/nuvexa-wa');
const MOUNT_POINT='/var/data';
const configFile=path.join(DATA_DIR,'cloud-pairing.json');
const accountsFile=path.join(DATA_DIR,'cloud-authorized-accounts.json');
const profilesDir=path.join(DATA_DIR,'profiles');
const CHROME=process.env.NUVEXA_CHROME_PATH||'/usr/bin/chromium';
const log=m=>console.log('['+new Date().toISOString()+'] '+String(m).slice(0,400));
let paired=false,ready=false,sessionCount=0,lastBackendHeartbeat=null,starting=false,runtime=null;
function health(){
  return {service:'nuvexa-whatsapp-cloud-pilot',alive:true,paired,workerReady:ready,
    diskRequired:true,diskVerified:true,authorizedSessionCount:sessionCount,
    lastBackendHeartbeatAt:lastBackendHeartbeat,
    phase:ready?'READY':paired?'STARTING':'AWAITING_PAIRING',maxActive:1};
}
const app=http.createServer((req,res)=>{
  if(req.method==='GET'&&(req.url==='/'||req.url==='/healthz')){
    const data=JSON.stringify(health());
    res.writeHead(200,{'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    return res.end(data);
  }
  res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"NOT_FOUND"}');
});
async function ensureDisk(){
  if(!DATA_DIR.startsWith(MOUNT_POINT+'/'))throw Error('INVALID_PERSISTENT_STORAGE_PATH');
  const mounts=await fs.readFile('/proc/self/mountinfo','utf8');
  if(!mounts.split('\n').some(line=>line.split(' ')[4]===MOUNT_POINT))
    throw Error('PERSISTENT_DISK_NOT_MOUNTED: attach paid Render persistent disk at /var/data');
  await fs.mkdir(profilesDir,{recursive:true});
  const probe=path.join(DATA_DIR,'.write-test-'+process.pid);
  await fs.writeFile(probe,'ok',{mode:0o600});await fs.unlink(probe);
}
async function load(file,def){
  try{return JSON.parse(await fs.readFile(file,'utf8'))}
  catch(e){if(e.code==='ENOENT')return def;throw Error('CORRUPT_CLOUD_DATA: '+path.basename(file))}
}
async function save(file,data){
  const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await fs.rename(tmp,file);
}
function requestWithAuth(token){
  return async(route,method='GET',body)=>{
    const headers={'accept':'application/json','x-nuvexa-cloud-token':token};
    if(body!==undefined)headers['content-type']='application/json';
    const response=await fetch(ORIGIN+route,{
      method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(18000)
    });
    let data={};try{data=await response.json()}catch{}
    if(!response.ok){const error=Error(String(data.error||'BACKEND_UNAVAILABLE')+' HTTP '+response.status);
      error.status=response.status;throw error}
    return data;
  }
}
async function retrieveToken(){
  const conf=await load(configFile,{});
  let token=String(conf.token||'');
  if(/^nc_[0-9a-f]{64}$/.test(token)){
    try{await requestWithAuth(token)('/v1/cloud/accounts/requests');return token}
    catch(e){if(e.status!==401)throw e;token='';log('Cloud pairing credential expired, requires a fresh admin enrollment.')}
  }
  const code=String(process.env.NUVEXA_CLOUD_PAIR_CODE||'').replace(/[\s-]/g,'').toUpperCase();
  if(!/^[A-F0-9]{24}$/.test(code)){
    log('Waiting for admin pairing. Paste a short-lived pairing code into Render private env NUVEXA_CLOUD_PAIR_CODE.');
    return null;
  }
  const response=await fetch(ORIGIN+'/v1/cloud/enrollment/claim',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({code}),signal:AbortSignal.timeout(18000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('CLOUD_PAIRING_REJECTED: '+String(data.error||response.status));
  if(!/^nc_[0-9a-f]{64}$/.test(data.token))throw Error('INVALID_CLOUD_PAIRING_RESPONSE');
  await save(configFile,{token:data.token,createdAt:new Date().toISOString(),origin:ORIGIN});
  log('Cloud device securely paired. Token stored only on cloud disk, never in logs.');
  return data.token;
}
async function startWorker(token){
  if(starting)return;starting=true;
  const ww=await import('whatsapp-web.js'),ws=ww.default||ww;
  const q=await import('qrcode'),qr=q.default||q;
  if(!ws.Client||!ws.LocalAuth||typeof qr.toDataURL!=='function')throw Error('WEB_CLIENT_NOT_AVAILABLE');
  const fetchCloud=requestWithAuth(token);
  const run=new WhatsAppSessionRuntime({
    createClient:async id=>new ws.Client({
      authStrategy:new ws.LocalAuth({clientId:id,dataPath:profilesDir}),
      qrMaxRetries:0,
      puppeteer:{headless:true,executablePath:CHROME,
        args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run']}
    }),
    toPngDataUrl:data=>qr.toDataURL(data,{type:'image/png',margin:2,width:456}),
    transport:{
      get:()=>fetchCloud('/v1/cloud/accounts/requests'),
      post:async(route,data)=>{
        const destination=route.endsWith('/qr')?'/v1/cloud/accounts/qr':'/v1/cloud/heartbeat';
        const result=await fetchCloud(destination,'POST',data);
        if(destination.endsWith('/heartbeat'))lastBackendHeartbeat=new Date().toISOString();
        return result;
      }
    },
    loadAccounts:async()=>{
      const ids=await load(accountsFile,[]);
      const result=Array.isArray(ids)?ids.slice(0,1):[];
      sessionCount=result.length;return result;
    },
    saveAccounts:async ids=>{
      const one=ids.slice(0,1);await save(accountsFile,one);sessionCount=one.length;
    },log,maxActive:1
  });
  runtime=run;await run.start();ready=true;
  log('Cloud pilot ready for one explicitly selected account. Never sends WhatsApp messages.');
}
async function main(){
  await ensureDisk();app.listen(PORT,'0.0.0.0',()=>log('Health server started on :'+PORT));
  const token=await retrieveToken();
  if(token){paired=true;await startWorker(token)}
}
async function shutdown(){
  ready=false;try{await runtime?.stop()}catch{}
  app.close();
}
process.on('SIGTERM',()=>{void shutdown().then(()=>process.exit(0))});
process.on('SIGINT',()=>{void shutdown().then(()=>process.exit(0))});
main().catch(e=>{log('Cloud startup blocked: '+e.message);process.exitCode=1;setTimeout(()=>process.exit(1),250).unref()});
