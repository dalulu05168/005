import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailySeatPlan,findSeatPlanStep,markSeatPlanReceived,
  reconcileSeatPlan,desiredSeatAccounts} from '../seat-plan.mjs';
const accounts=[
 {id:'assistant',kind:'ASSISTANT',slot:'PRIMARY'},
 {id:'professor',kind:'PROFESSOR',slot:'PRIMARY'},
 ...Array.from({length:12},(_,i)=>({id:'member-'+String(i+1).padStart(2,'0'),
   kind:'AUXILIARY',slot:'PRIMARY',auxCode:String(i+1),
   identity:'老女',personaCodes:[String(i+1)]}))
];
test('creates an ordered day with unique physical account mapping and capped seats',()=>{
 const p=createDailySeatPlan(['01老女','助理','02老女','教授','03老女','04老女','05老女','06老女','07老女'],accounts);
 assert.equal(p.entries.length,9);
 assert.equal(p.maxSeats,7);
 const seats=desiredSeatAccounts(p,accounts,[]);
 assert.equal(seats.desired.length,7);
 assert.deepEqual(seats.desired.slice(0,2),['assistant','professor']);
 assert.ok(seats.desired.includes('member-01'));
 assert.ok(!seats.desired.includes('member-07'));
});
test('priority roles can arrive ahead of ordinary plan steps but ordinary cannot overtake',()=>{
 const p=createDailySeatPlan(['01老女','02老女','助理','教授'],accounts);
 assert.equal(findSeatPlanStep(p,{role:'AUXILIARY',auxCode:'2',identity:'老女'}),null);
 assert.equal(findSeatPlanStep(p,{role:'ASSISTANT'}).index,2);
 assert.equal(findSeatPlanStep(p,{role:'PROFESSOR'}).index,3);
 assert.equal(findSeatPlanStep(p,{role:'AUXILIARY',auxCode:'1',identity:'老女'}).index,0);
});
test('advancement requires all WhatsApp group sends ACKED and does not skip unknowns',()=>{
 const p=createDailySeatPlan(['01老女','02老女','03老女','04老女','05老女','06老女','07老女','08老女'],accounts);
 const first=findSeatPlanStep(p,{role:'AUXILIARY',auxCode:'1',identity:'老女'});
 markSeatPlanReceived(first,['text','photo']);
 const initial=desiredSeatAccounts(p,accounts,[]).desired;
 assert.deepEqual(initial,['member-01','member-02','member-03','member-04','member-05','member-06','member-07']);
 const tasks=[
  {id:'text',status:'WAITING',targets:[{status:'ACKED'},{status:'WAITING'}]},
  {id:'photo',status:'ACKED',targets:[{status:'ACKED'}]}
 ];
 reconcileSeatPlan(p,tasks);assert.equal(p.cursor,0);
 tasks[0].status='ACKED';tasks[0].targets[1].status='ACKED';
 reconcileSeatPlan(p,tasks);
 assert.equal(p.cursor,1);
 assert.equal(first.status,'ACKED');
 const next=desiredSeatAccounts(p,accounts,[]).desired;
 assert.ok(!next.includes('member-01'));
 assert.ok(next.includes('member-08'));
});
test('missing task or failed target cannot be considered delivered',()=>{
 const p=createDailySeatPlan(['01老女'],accounts);
 markSeatPlanReceived(p.entries[0],['gone']);
 reconcileSeatPlan(p,[]);assert.equal(p.cursor,0);
 reconcileSeatPlan(p,[{id:'gone',status:'FAILED'}]);assert.equal(p.cursor,0);
 assert.equal(p.entries[0].status,'BLOCKED');
});
test('protected senders are never released even after their step is absent',()=>{
 const p=createDailySeatPlan(['01老女','02老女','03老女'],accounts);
 const t=[{status:'VERIFYING',activeSenderId:'member-12',targets:[{status:'VERIFYING',senderAccountId:'member-12'}]}];
 assert.deepEqual(desiredSeatAccounts(p,accounts,t).protectedAccountIds,['member-12']);
});
test('invalid ID, identity, or >7 capacity fails closed',()=>{
 assert.throws(()=>createDailySeatPlan(['11新女'],accounts),/UNMAPPED/);
 assert.throws(()=>createDailySeatPlan(['01新女'],accounts),/UNMAPPED/);
 assert.throws(()=>createDailySeatPlan([],accounts),/LENGTH/);
 assert.throws(()=>createDailySeatPlan(['01老女'],accounts,{maxSeats:8}),/CAPACITY/);
});
