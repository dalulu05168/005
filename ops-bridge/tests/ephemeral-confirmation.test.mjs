import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reconcileSeatPlan} from '../seat-plan.mjs';

const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
function section(start,end){
  const i=source.indexOf(start);
  const j=source.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'missing '+start);
  return source.slice(i,j);
}
const terminalSnippet=section('const COMPLETED_DEDUP_TTL_SECONDS=', 'if(!REDIS_URL');
const {completedTaskKey,removeFinishedTasks,COMPLETED_DEDUP_TTL_SECONDS}=Function(
  'createHash','TERMINAL_TASKS',
  terminalSnippet+'\nreturn {completedTaskKey,removeFinishedTasks,COMPLETED_DEDUP_TTL_SECONDS}'
)(createHash,new Set(['ACKED','FAILED','CANCELLED']));

const receiptSnippet=section('function verifiedForwardReceipt(', 'function enabledTargets(');
const {verifiedForwardReceipt}=Function('safeString',
  receiptSnippet+'\nreturn {verifiedForwardReceipt}'
)((v,n=500)=>String(v??'').trim().slice(0,n));

function receipt(changes={}){
  return {actualSenderAccountId:'wa-assistant-1',actualGroupId:'123456@g.us',
    whatsAppMessageId:'true-provider-id-123',providerAck:'ACK_SERVER',...changes};
}
const target={senderAccountId:'wa-assistant-1',groupId:'123456@g.us'};

test('matching provider-confirmed sender, group, message ID is accepted',()=>{
  assert.equal(verifiedForwardReceipt(receipt(),target),true);
  assert.equal(verifiedForwardReceipt(receipt({providerAck:'ACK_DEVICE'}),target),true);
});
test('a worker saying ACKED alone is not evidence of a WhatsApp forward',()=>{
  assert.equal(verifiedForwardReceipt({result:'ACKED'},target),false);
  assert.equal(verifiedForwardReceipt(receipt({whatsAppMessageId:''}),target),false);
  assert.equal(verifiedForwardReceipt(receipt({providerAck:'PENDING'}),target),false);
});
test('matching a wrong sender or wrong group never counts as success',()=>{
  assert.equal(verifiedForwardReceipt(receipt({actualSenderAccountId:'backup-1'}),target),false);
  assert.equal(verifiedForwardReceipt(receipt({actualGroupId:'other-group@g.us'}),target),false);
});
test('completed and failed tasks are purged; in-flight and unknown results remain',()=>{
  const state={tasks:[
    {id:'1',status:'ACKED',romanianText:'private delivered body',mediaRef:'private-image-1'},
    {id:'2',status:'WAITING',romanianText:'pending content'},
    {id:'3',status:'VERIFYING',romanianText:'unknown delivery'},
    {id:'4',status:'CANCELLED',romanianText:'not retained'}
  ]};
  const finished=removeFinishedTasks(state);
  assert.deepEqual(finished.map(x=>x.id),['1','4']);
  assert.deepEqual(state.tasks.map(x=>x.id),['2','3']);
  assert.ok(!JSON.stringify(state).includes('private delivered body'));
});
test('temporary de-dup markers are hashed and only last one hour',()=>{
  const key=completedTaskKey('source-chat','message-10','TEXT');
  assert.equal(COMPLETED_DEDUP_TTL_SECONDS,3600);
  assert.match(key,/^nuvexa:ops:dedup:v1:[a-f0-9]{64}$/);
  assert.ok(!key.includes('source-chat'));
  assert.notEqual(key,completedTaskKey('source-chat','message-10','IMAGE'));
});
test('persisting state removes delivered contents and stores only timed de-dup markers',async()=>{
  const store=new Map(),options=new Map();
  const redis={
    async set(key,value,opts){store.set(key,value);options.set(key,opts);return 'OK';}
  };
  const snippet=section('async function setState(', 'async function withLock(');
  const persist=Function('redis','nowIso','STATE_KEY','removeFinishedTasks',
      'completedTaskKey','COMPLETED_DEDUP_TTL_SECONDS','reconcileSeatPlan',
      snippet+'\nreturn setState'
  )(redis,()=>new Date(0).toISOString(),'nuvexa:cloud:state:v3',
    removeFinishedTasks,completedTaskKey,COMPLETED_DEDUP_TTL_SECONDS,reconcileSeatPlan);
  const state={tasks:[
    {id:'done',status:'ACKED',sourceChatId:'c',sourceMessageId:'12',messageType:'TEXT',romanianText:'secret content'},
    {id:'waiting',status:'WAITING',sourceChatId:'c',sourceMessageId:'13',messageType:'TEXT',romanianText:'pending'}
  ]};
  await persist(state);
  const saved=store.get('nuvexa:cloud:state:v3');
  assert.equal(saved.includes('secret content'),false);
  assert.equal(saved.includes('pending'),true);
  assert.equal(options.get(completedTaskKey('c','12','TEXT')).EX,3600);
});
test('the ACK and resolve routes require actual receipt evidence',()=>{
  assert.ok(source.includes("if(result==='ACKED'&&!verifiedForwardReceipt(input,target))"));
  assert.ok(source.includes("if(resolution==='ACKED'&&!verifiedForwardReceipt(input,target))"));
  assert.ok(source.includes('FORWARD_RECEIPT_MISSING_OR_MISMATCHED'));
  assert.ok(source.includes('completedImage'));
  assert.ok(source.includes('completedText'));
});
