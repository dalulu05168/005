import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNextDispatchTask,planPrioritySeat,isPriorityRole} from '../priority-scheduler.mjs';
const task=(id,role,status='WAITING',targets=[{status:'WAITING'}])=>({id,role,status,targets});
test('assistant jumps pending ordinary messages without reordering ordinary FIFO',()=>{
 const q=[task('ordinary1','AUXILIARY'),task('assistant','ASSISTANT'),task('ordinary2','AUXILIARY')];
 assert.equal(selectNextDispatchTask(q).id,'assistant');
 assert.equal(selectNextDispatchTask([q[0],q[2]]).id,'ordinary1');
});
test('professor and assistant equal priority preserve their Telegram arrival order',()=>{
 const q=[task('ordinary','AUXILIARY'),task('professor','PROFESSOR'),task('assistant','ASSISTANT')];
 assert.equal(selectNextDispatchTask(q).id,'professor');
 assert.ok(isPriorityRole('ASSISTANT'));assert.ok(isPriorityRole('PROFESSOR'));
});
test('never interrupt SENDING, VERIFYING or partially ACKED multi-group task',()=>{
 for(const progress of [
  task('active','AUXILIARY','SENDING',[{status:'SENDING'}]),
  task('uncertain','AUXILIARY','VERIFYING',[{status:'VERIFYING'}]),
  task('partial','AUXILIARY','WAITING',[{status:'ACKED'},{status:'WAITING'}])
 ]){
   assert.equal(selectNextDispatchTask([progress,task('assistant','ASSISTANT')]).id,progress.id);
 }
});
test('VERIFYING blocks newer work even if another task is listed as sending',()=>{
 const v=task('verifying','AUXILIARY','VERIFYING',[{status:'VERIFYING'}]);
 const a=task('assistant','ASSISTANT','SENDING',[{status:'SENDING'}]);
 assert.equal(selectNextDispatchTask([a,v]).id,'verifying');
});
test('finished tasks do not clog the priority queue',()=>{
 assert.equal(selectNextDispatchTask([task('completed','PROFESSOR','ACKED'),task('ordinary','AUXILIARY')]).id,'ordinary');
 assert.equal(selectNextDispatchTask([task('done','AUXILIARY','ACKED')]),null);
});
test('assistant/professor reuse seats or fill vacant capacity without exceeding 7',()=>{
 assert.deepEqual(planPrioritySeat([{accountId:'assistant1'}],{id:'assistant1',role:'ASSISTANT',authorized:true}).action,'REUSE');
 assert.equal(planPrioritySeat([],{id:'professor1',role:'PROFESSOR',authorized:true}).action,'FILL');
});
test('assistant is admitted only by releasing a safe ordinary seat',()=>{
 const seats=Array.from({length:7},(_,i)=>({accountId:'ordinary'+i,pinned:false,releasable:i===3,inFlight:false,verifying:false,pendingTargets:false}));
 const p=planPrioritySeat(seats,{id:'assistant1',role:'ASSISTANT',authorized:true});
 assert.deepEqual(p,{action:'REPLACE_AFTER_RELEASE',accountId:'assistant1',releaseAccountId:'ordinary3'});
});
test('priority cannot evict busy, verifying, pending or pinned accounts',()=>{
 const seats=Array.from({length:7},(_,i)=>({accountId:'account'+i,pinned:i===0,releasable:true,
  inFlight:i===1,verifying:i===2,pendingTargets:i===3}));
 for(const seat of seats.slice(4))seat.pinned=true;
 const x=planPrioritySeat(seats,{id:'professor1',role:'PROFESSOR',authorized:true});
 assert.equal(x.action,'WAIT');
});
test('unauthorized sender and nonpriority request never steals a seat',()=>{
 const seats=Array.from({length:7},(_,i)=>({accountId:'member'+i,releasable:true}));
 assert.equal(planPrioritySeat(seats,{id:'stranger',role:'ASSISTANT',authorized:false}).action,'BLOCKED');
 assert.equal(planPrioritySeat(seats,{id:'memberNew',role:'AUXILIARY',authorized:true}).action,'WAIT');
});
