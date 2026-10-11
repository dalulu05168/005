import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';

const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const cloudFile=await readFile(new URL('../../whatsapp-connector/cloud.mjs',import.meta.url),'utf8');
const markerA="/* Single-account cloud trial is isolated";
const markerB="const qrKey=id=>";
const a=source.indexOf(markerA),b=source.indexOf(markerB,a);
assert.ok(a>=0&&b>a,'cloud authentication helpers present');
const snippet=source.slice(a,b);
function mock(){
 const data=new Map();
 const redis={get:async key=>data.get(key)||null,set:async(key,value)=>{data.set(key,value);return 'OK'}};
 const o=Function('redis','createHash','timingSafeEqual','ACCOUNT_ALIVE_MS',
    snippet+';return {cloudAuth,currentCloudHealth};'
 )(redis,createHash,timingSafeEqual,120000);
 return {...o,redis,data};
}
test('cloud token and Windows token are separate; no unpaired cloud worker can poll',async()=>{
 const m=mock();
 const good='nc_'+ 'f'.repeat(64),windows='nw_'+'a'.repeat(64);
 const hash=createHash('sha256').update(good).digest('hex');
 m.data.set('nuvexa:wa:connector:token-sha256:v1',createHash('sha256').update(windows).digest('hex'));
 assert.equal(await m.cloudAuth({headers:{'x-nuvexa-cloud-token':windows}}),false);
 assert.equal(await m.cloudAuth({headers:{'x-nuvexa-cloud-token':good}}),false);
 m.data.set('nuvexa:wa:cloud:token:sha256:v1',hash);
 assert.equal(await m.cloudAuth({headers:{'x-nuvexa-cloud-token':good}}),true);
 assert.equal(await m.cloudAuth({headers:{'x-nuvexa-cloud-token':windows}}),false);
 assert.equal(await m.cloudAuth({headers:{'x-nuvexa-connector-token':windows}}),false);
});
test('cloud heartbeat is fresh only inside the true 120s expiry window',async()=>{
 const m=mock();
 assert.equal((await m.currentCloudHealth()).connected,false);
 m.data.set('nuvexa:wa:cloud:worker-health:v1',JSON.stringify({at:new Date().toISOString(),reportedAccounts:1,onlineAccounts:1}));
 const fresh=await m.currentCloudHealth();
 assert.equal(fresh.connected,true);
 assert.equal(fresh.onlineAccounts,1);
 m.data.set('nuvexa:wa:cloud:worker-health:v1',JSON.stringify({at:new Date(Date.now()-130000).toISOString(),onlineAccounts:1}));
 assert.equal((await m.currentCloudHealth()).connected,false);
});
test('cloud pilot exposes its own restricted QR and heartbeat APIs',()=>{
 for(const path of ['/v1/cloud/enrollment/claim','/v1/cloud/status','/v1/cloud/heartbeat',
    '/v1/cloud/accounts/requests','/v1/cloud/accounts/qr']){
   assert.ok(source.includes("url.pathname==='"+path+"'"),path);
 }
 assert.ok(source.includes("if(input.mode==='cloud')"));
 assert.ok(source.includes('CLOUD_PILOT_ALREADY_ASSIGNED'));
 assert.ok(source.includes('ACCOUNT_ALREADY_ONLINE_ON_WINDOWS'));
 // Old Windows credential is not overwritten by the cloud pairing claim.
 const i=source.indexOf("if(url.pathname==='/v1/cloud/enrollment/claim'");
 const j=source.indexOf("if(url.pathname==='/v1/cloud/status'",i);
 const claim=source.slice(i,j);
 assert.ok(claim.includes('CLOUD_AUTH_KEY'));
 assert.ok(!claim.includes('DEVICE_CONNECTOR_TOKEN_KEY'));
});
test('cloud worker refuses ephemeral profile storage and never sends WhatsApp messages',()=>{
 assert.ok(cloudFile.includes("PERSISTENT_DISK_NOT_MOUNTED"));
 assert.ok(cloudFile.includes("'/proc/self/mountinfo'"));
 assert.ok(cloudFile.includes('maxActive:1'));
 assert.ok(!cloudFile.includes('sendMessage('));
 assert.ok(cloudFile.includes('new ws.LocalAuth'));
});

test('one-click account QR uses local authorized worker without asking for CMD each time',async()=>{
 const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
 const pageStart=html.indexOf('function accountsPageCore()');
 const pageEnd=html.indexOf('function accountRow(',pageStart);
 assert.ok(pageStart>=0&&pageEnd>pageStart,'account page renderer exists');
 const page=html.slice(pageStart,pageEnd);
 assert.ok(page.includes('本地后台服务'),'account page explains local service');
 assert.ok(page.includes('service-setup')&&page.includes('id="waEnroll"'),'first-time enrollment is available under optional maintenance');
 for(const obsolete of ['id="waDownload"','id="waConnectMode"','连接 Windows 扫码程序','下载 Windows 扫码程序','连接云端扫码服务']){
  assert.ok(!page.includes(obsolete),'daily UI must not expose legacy setup controls: '+obsolete);
 }
 assert.ok(!html.includes('class="wa-direct-download"'),'no global Windows download');
 assert.match(html,/const mode='windows';/);
 assert.ok(html.includes("body:JSON.stringify({accountId,mode})"),'backend receives Windows connection mode');
 assert.ok(source.includes("if(url.pathname==='/v1/worker/accounts/heartbeat'"),'auth-protected local heartbeat exists');
 assert.ok(html.includes('WHATSAPP_CONNECTOR_OFFLINE'),'must report offline honestly');
 assert.ok(!html.includes('const mode=\'cloud\';'),'cloud-only mode must not override local worker');
});
