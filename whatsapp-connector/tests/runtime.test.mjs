import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import { WhatsAppSessionRuntime,validAccountId,phoneSuffix } from '../runtime.mjs';

class FakeClient extends EventEmitter{
 constructor(id){super();this.id=id;this.started=false;this.info={wid:{user:'60123456789'}};this.state='CONNECTED';this.destroyed=false}
 async initialize(){this.started=true;this.emit('qr','real-qr-from-whatsapp-'+this.id)}
 async getState(){return this.state}
 async destroy(){this.destroyed=true}
}
function harness(){
 const connections=new Map(),posts=[],requests=[];
 const api={
   get:async()=>({items:requests}),
   post:async(route,data)=>{posts.push({route,data});return {ok:true}}
 };
 let saved=[];
 const rt=new WhatsAppSessionRuntime({
   createClient:async id=>{const c=new FakeClient(id);connections.set(id,c);return c},
   toPngDataUrl:async raw=>'data:image/png;base64,'+Buffer.from(raw).toString('base64'),
   transport:api,loadAccounts:async()=>saved,
   saveAccounts:async arr=>{saved=[...arr]},maxActive:3
 });
 return {rt,connections,posts,requests,getSaved:()=>saved};
}
test('reject path traversal in client profile ID; phone suffix extracted only after ready',()=>{
 assert.equal(validAccountId('member-45'),true);
 assert.equal(validAccountId('../sensitive'),false);
 assert.equal(validAccountId(''),false);
 assert.equal(phoneSuffix({wid:{user:'60123456789'}}),'6789');
});
test('genuine WhatsApp QR is rendered and published only on matching pending account request',async()=>{
 const {rt,connections,posts,requests,getSaved}=harness();
 try{
   rt.knownAccounts.add('member-45');
   await rt.openSession('member-45');
   await new Promise(setImmediate);
   assert.equal(posts.filter(x=>x.route.endsWith('/qr')).length,0);
   requests.push({accountId:'member-45'});
   await rt.pollRequests();
   assert.deepEqual(getSaved(),['member-45']);
   const q=posts.find(x=>x.route==='/v1/worker/accounts/qr');
   assert.equal(q.data.accountId,'member-45');
   assert.ok(Buffer.from(q.data.qrDataUrl.split(',')[1],'base64').toString().includes('real-qr-from-whatsapp'));
   connections.get('member-45').emit('ready');
   assert.equal(rt.snapshot()[0].status,'ONLINE');
   assert.equal(rt.snapshot()[0].phoneLast4,'6789');
   await new Promise(resolve=>setTimeout(resolve,25));
   await rt.heartbeat();
   assert.ok(posts.find(x=>x.route==='/v1/worker/accounts/heartbeat').data.accounts[0].status==='ONLINE');
 }finally{await rt.stop()}
});
test('disconnection is immediately not online, then reconnect uses same account id',async()=>{
 const {rt,connections,posts,requests}=harness();
 try{
   rt.knownAccounts.add('role-assistant-primary');
   await rt.openSession('role-assistant-primary');await new Promise(setImmediate);
   const c=connections.get('role-assistant-primary');
   c.emit('ready');
   assert.equal(rt.snapshot()[0].status,'ONLINE');
   c.emit('disconnected','INTERNET_DISCONNECT');
   assert.equal(rt.snapshot()[0].status,'OFFLINE');
   await new Promise(resolve=>setTimeout(resolve,25));
   await rt.heartbeat();
   const h=posts.filter(x=>x.route.endsWith('/heartbeat')).at(-1);
   assert.equal(h.data.accounts[0].status,'OFFLINE');
   requests.push({accountId:'role-assistant-primary'});
   await rt.pollRequests();
   assert.equal(rt.snapshot()[0].status,'OFFLINE'); // reconnect delay
 }finally{await rt.stop()}
});
test('restores only previously enrolled account profiles on startup; no fake online',async()=>{
 const {rt,posts}=harness();
 rt.loadAccounts=async()=>['member-01','../invalid'];
 try{
   await rt.start();await new Promise(setImmediate);
   assert.equal(rt.knownAccounts.size,1);
   assert.equal(rt.snapshot()[0].status,'NEEDS_QR');
   assert.ok(posts.some(x=>x.route==='/v1/worker/accounts/heartbeat'));
 }finally{await rt.stop()}
});
