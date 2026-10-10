import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

// Pull the pure selection logic for isolated regression testing: no live Redis,
// Telegram, WhatsApp or internet calls, and no production account mutations.
const src=await readFile(resolve(dirname(fileURLToPath(import.meta.url)),'../server.mjs'),'utf8');
function between(begin,end){
  const i=src.indexOf(begin),j=src.indexOf(end,i+begin.length);
  assert.ok(i>=0&&j>i,begin+' section absent');
  return src.slice(i,j);
}
const parser=between('function personaCodes(','function normalizeAccount(');
const routing=between('function selectSender(','function parseTelegram(');
const {selectSender,excludeConfirmedNotSent}=Function('isAccountOnline',parser+'\n'+routing+'\nreturn {selectSender,excludeConfirmedNotSent};')(a=>a?.status==='ONLINE');
function build({member='OFFLINE',b1='ONLINE',b2='ONLINE',b3='ONLINE'}={}){
  return {accounts:[
    {id:'assistant1',kind:'ASSISTANT',slot:'PRIMARY',status:'OFFLINE'},
    {id:'assistant2',kind:'ASSISTANT',slot:'BACKUP',status:'ONLINE'},
    {id:'professor1',kind:'PROFESSOR',slot:'PRIMARY',status:'OFFLINE'},
    {id:'professor2',kind:'PROFESSOR',slot:'BACKUP',status:'ONLINE'},
    {id:'member45',kind:'AUXILIARY',slot:'PRIMARY',auxCode:'45',personaCodes:['45'],status:member},
    {id:'reserve1',kind:'AUX_BACKUP',slot:'BACKUP',backupOrder:1,status:b1},
    {id:'reserve2',kind:'AUX_BACKUP',slot:'BACKUP',backupOrder:2,status:b2},
    {id:'reserve3',kind:'AUX_BACKUP',slot:'BACKUP',backupOrder:3,status:b3}
  ]};
}
const member={role:'AUXILIARY',auxCode:'45'};
test('a connected member uses its own sending account',()=>{
 assert.equal(selectSender(build({member:'ONLINE'}),member,{}).account.id,'member45');
});
test('member offline automatically uses shared reserve 1, not a unique backup',()=>{
 const r=selectSender(build(),member,{});
 assert.equal(r.account.id,'reserve1');
 assert.equal(r.backup,true);
});
test('offline reserve 1 is skipped without manual confirmation, then reserve 2',()=>{
 assert.equal(selectSender(build({b1:'OFFLINE'}),member,{}).account.id,'reserve2');
});
test('offline reserves 1 and 2 fall through to reserve 3',()=>{
 assert.equal(selectSender(build({b1:'OFFLINE',b2:'OFFLINE'}),member,{}).account.id,'reserve3');
});
test('confirmed NOT_SENT excludes physical sender for that target, moves to next reserve',()=>{
 const state=build(),target={};
 const first=selectSender(state,member,target);
 assert.equal(first.account.id,'reserve1');
 excludeConfirmedNotSent(target,first.account.id);
 assert.equal(selectSender(state,member,target).account.id,'reserve2');
 excludeConfirmedNotSent(target,'reserve2');
 assert.equal(selectSender(state,member,target).account.id,'reserve3');
});
test('all three offline blocks safely instead of reporting a fake send',()=>{
 const r=selectSender(build({b1:'OFFLINE',b2:'OFFLINE',b3:'OFFLINE'}),member,{});
 assert.equal(r.blocked,true);
});
test('assistant 2 is only assistant 1 backup; professor 2 is only professor 1 backup',()=>{
 const s=build();
 assert.equal(selectSender(s,{role:'ASSISTANT'},{}).account.id,'assistant2');
 assert.equal(selectSender(s,{role:'PROFESSOR'},{}).account.id,'professor2');
 s.accounts.find(a=>a.id==='assistant2').status='OFFLINE';
 assert.equal(selectSender(s,{role:'ASSISTANT'},{}).blocked,true);
 assert.equal(selectSender(s,{role:'PROFESSOR'},{}).account.id,'professor2');
});
test('one WhatsApp sender may serve multiple persona IDs',()=>{
 const s=build({member:'ONLINE'});
 s.accounts.find(a=>a.id==='member45').personaCodes=['2','45','65'];
 assert.equal(selectSender(s,{role:'AUXILIARY',auxCode:'2'},{}).account.id,'member45');
 assert.equal(selectSender(s,{role:'AUXILIARY',auxCode:'65'},{}).account.id,'member45');
});
test('after a confirmed unsent primary send, first shared reserve is selected',()=>{
 const s=build({member:'ONLINE'}),target={};
 excludeConfirmedNotSent(target,'member45');
 assert.equal(selectSender(s,member,target).account.id,'reserve1');
});
