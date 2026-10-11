import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WhatsAppSessionRuntime} from '../../whatsapp-connector/runtime.mjs';
import {createDailySeatPlan,findSeatPlanStep,markSeatPlanReceived,reconcileSeatPlan,desiredSeatAccounts} from '../seat-plan.mjs';
class FakeClient extends EventEmitter{
 constructor(id){super();this.id=id;this.closed=false;this.info={wid:{user:'60123224567'}}}
 async initialize(){this.emit('qr','not-a-real-world-login')}
 async getState(){return 'CONNECTED'}
 async destroy(){this.closed=true}
}
test('multi-group ACK releases exactly one ordinary seat and restores next while assistant/professor remain',async()=>{
 const people=Array.from({length:8},(_,i)=>({
   id:'member-'+String(i+1).padStart(2,'0'),kind:'AUXILIARY',slot:'PRIMARY',
   auxCode:String(i+1),personaCodes:[String(i+1)],identity:'老女'
 }));
 const accounts=[
   {id:'assistant',kind:'ASSISTANT',slot:'PRIMARY'},
   {id:'professor',kind:'PROFESSOR',slot:'PRIMARY'},...people
 ];
 const inputs=['助理','01老女','02老女','教授','03老女','04老女','05老女','06老女','07老女','08老女','助理'];
 const p=createDailySeatPlan(inputs,accounts);
 const clients=new Map();
 const runtime=new WhatsAppSessionRuntime({
   seatMode:true,maxActive:7,
   loadAccounts:async()=>accounts.map(a=>a.id),
   saveAccounts:async()=>{},
   toPngDataUrl:async()=>'',transport:{get:async()=>({items:[]}),post:async()=>({ok:true})},
   createClient:async id=>{const c=new FakeClient(id);clients.set(id,c);return c}
 });
 runtime.knownAccounts=new Set(accounts.map(x=>x.id));
 try{
   const start=desiredSeatAccounts(p,accounts,[]);
   assert.deepEqual(start.desired.slice(0,2),['assistant','professor']);
   assert.equal(start.desired.length,7);
   await runtime.syncSeatPlan(start);
   await new Promise(setImmediate);
   for(const id of start.desired)clients.get(id).emit('ready');
   assert.equal(runtime.sessions.size,7);
   // Assistant step confirmed first; assistant remains pinned because needed again.
   const first=findSeatPlanStep(p,{role:'ASSISTANT'});
   markSeatPlanReceived(first,['a']);
   reconcileSeatPlan(p,[{id:'a',status:'ACKED',targets:[{status:'ACKED'}]}]);
   assert.equal(p.cursor,1);
   // Member 01 sent to group A but group B remains unconfirmed.
   const member=findSeatPlanStep(p,{role:'AUXILIARY',auxCode:'1',identity:'老女'});
   markSeatPlanReceived(member,['m1']);
   const pending={id:'m1',status:'WAITING',activeSenderId:'member-01',
     targets:[{status:'ACKED',senderAccountId:'member-01'},
       {status:'WAITING',senderAccountId:'member-01'}]};
   reconcileSeatPlan(p,[pending]);
   const remain=desiredSeatAccounts(p,accounts,[pending]);
   assert.ok(remain.protectedAccountIds.includes('member-01'));
   const unchanged=await runtime.syncSeatPlan(remain);
   assert.deepEqual(unchanged.released,[]);
   assert.equal(p.cursor,1);
   // Both target groups get real-ACK *shaped* fixture confirmation:
   // no actual WhatsApp group is contacted in this test.
   pending.status='ACKED';
   pending.targets[1].status='ACKED';
   reconcileSeatPlan(p,[pending]);
   assert.equal(p.cursor,2);
   const next=desiredSeatAccounts(p,accounts,[]);
   assert.ok(!next.desired.includes('member-01'));
   assert.ok(next.desired.includes('member-06'));
   const move=await runtime.syncSeatPlan(next);
   assert.deepEqual(move.released,['member-01']);
   assert.deepEqual(move.started,['member-06']);
   assert.equal(runtime.sessions.size,7);
   assert.equal(clients.get('member-01').closed,true);
   assert.equal(runtime.knownAccounts.has('member-01'),true);
   assert.ok(runtime.sessions.has('assistant')&&runtime.sessions.has('professor'));
 }finally{await runtime.stop()}
});
