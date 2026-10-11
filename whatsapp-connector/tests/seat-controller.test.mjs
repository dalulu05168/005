import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {planSeatMoves} from '../seat-controller.mjs';
import {WhatsAppSessionRuntime} from '../runtime.mjs';
class FakeClient extends EventEmitter{
  constructor(id){super();this.id=id;this.destroyed=false;this.info={wid:{user:'60123459999'}}}
  async initialize(){this.emit('qr','real-qr');}
  async destroy(){this.destroyed=true;}
  async getState(){return 'CONNECTED'}
}
function harness(maxActive=7){
  const connections=new Map(),state={saved:[]};
  const rt=new WhatsAppSessionRuntime({
    createClient:async id=>{const c=new FakeClient(id);connections.set(id,c);return c;},
    toPngDataUrl:async()=>'',transport:{get:async()=>({items:[]}),post:async()=>({ok:true})},
    loadAccounts:async()=>state.saved,saveAccounts:async a=>{state.saved=a},
    seatMode:true,maxActive
  });
  return {rt,connections,state};
}
const asIds=n=>Array.from({length:n},(_,i)=>'account-'+(i+1));
test('placement releases only no-longer-needed, unprotected account',()=>{
 assert.deepEqual(planSeatMoves({active:['a','b','c'],desired:['a','c','d'],protectedIds:['b'],maxActive:3}),
   {release:[],fill:[],blocked:['d'],cap:3});
 assert.deepEqual(planSeatMoves({active:['a','b','c'],desired:['a','c','d'],maxActive:3}),
   {release:['b'],fill:['d'],blocked:[],cap:3});
});
test('seat capacity capped to seven even with a higher requested number',()=>{
 const a=planSeatMoves({active:[],desired:asIds(10),maxActive:19});
 assert.equal(a.fill.length,7);
 assert.equal(a.cap,7);
});
test('opens exactly seven saved authorized sessions, releases one and fills next without logout',async()=>{
 const {rt,state,connections}=harness();
 state.saved=asIds(9);
 rt.knownAccounts=new Set(state.saved);
 try{
   const initial=await rt.syncSeatPlan({enabled:true,desired:asIds(7),protectedAccountIds:[]});
   assert.equal(initial.started.length,7);
   assert.equal(rt.sessions.size,7);
   await new Promise(setImmediate);
   for(const id of asIds(7))connections.get(id).emit('ready');
   const replacement=await rt.syncSeatPlan({enabled:true,desired:[...asIds(7).slice(1),'account-8'],protectedAccountIds:[]});
   assert.deepEqual(replacement.released,['account-1']);
   assert.deepEqual(replacement.started,['account-8']);
   assert.equal(connections.get('account-1').destroyed,true);
   assert.equal(rt.sessions.size,7);
   assert.equal(rt.knownAccounts.has('account-1'),true);
   assert.equal(rt.snapshot().find(x=>x.accountId==='account-1').status,'SLEEPING');
 }finally{await rt.stop()}
});
test('a protected in-flight account refuses eviction and will not overfill seat budget',async()=>{
 const {rt,state,connections}=harness(3);
 state.saved=asIds(5);rt.knownAccounts=new Set(state.saved);
 try{
   await rt.syncSeatPlan({enabled:true,desired:asIds(3)});
   await new Promise(setImmediate);
   for(const id of asIds(3))connections.get(id).emit('ready');
   const plan=await rt.syncSeatPlan({enabled:true,desired:['account-2','account-3','account-4'],
     protectedAccountIds:['account-1']});
   assert.deepEqual(plan.released,[]);
   assert.deepEqual(plan.started,[]);
   assert.equal(rt.sessions.size,3);
   assert.equal(connections.get('account-1').destroyed,false);
 }finally{await rt.stop()}
});
test('unknown account ID is never silently added or allowed to boot via seat plan',async()=>{
 const {rt,state}=harness();
 state.saved=['account-1'];rt.knownAccounts=new Set(state.saved);
 try{
   const plan=await rt.syncSeatPlan({enabled:true,desired:['account-1','unknown-account']});
   assert.equal(plan.status,'NEEDS_AUTHORIZATION');
   assert.deepEqual(plan.started,['account-1']);
   assert.deepEqual(plan.unpaired,['unknown-account']);
   assert.equal(rt.knownAccounts.has('unknown-account'),false);
 }finally{await rt.stop()}
});
test('not enabled seat mode never releases active accounts',async()=>{
 const {rt}=harness();rt.seatMode=false;
 try{assert.equal((await rt.syncSeatPlan({enabled:true,desired:['other']})).status,'DISABLED');}
 finally{await rt.stop()}
});
test('release refuses accounts still pairing or initializing',async()=>{
 const {rt,state,connections}=harness();
 state.saved=['account-1'];rt.knownAccounts.add('account-1');
 try{
   await rt.syncSeatPlan({enabled:true,desired:['account-1']});
   assert.equal(await rt.releaseSession('account-1'),false);
   await new Promise(setImmediate);
   connections.get('account-1').emit('ready');
   assert.equal(await rt.releaseSession('account-1'),true);
   assert.equal(rt.sleeping.has('account-1'),true);
 }finally{await rt.stop()}
});
