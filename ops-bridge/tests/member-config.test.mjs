import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const backend=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const ui=await readFile(new URL('../../index.html',import.meta.url),'utf8');
const between=(a,b)=>{
 const i=backend.indexOf(a),j=backend.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,a+' section missing');
 return backend.slice(i,j);
};
const helper=between('const MEMBER_IDENTITIES=', 'function defaultState(){');
const {defaultMemberIdentity,accountIdentity,standard72AccountSlots}=Function(
 helper+'return {defaultMemberIdentity,accountIdentity,standard72AccountSlots};'
)();
test('65 ordinary members with 51-65 new men and 3 shared reserves plus 2 dedicated',()=>{
 const slots=standard72AccountSlots();
 assert.equal(slots.length,72);
 assert.equal(slots.filter(a=>a.kind==='AUXILIARY').length,65);
 assert.equal(slots.filter(a=>a.kind==='AUX_BACKUP').length,3);
 assert.equal(slots.filter(a=>a.kind==='ASSISTANT'&&a.slot==='BACKUP').length,1);
 assert.equal(slots.filter(a=>a.kind==='PROFESSOR'&&a.slot==='BACKUP').length,1);
 assert.equal(slots.filter(a=>a.kind==='ASSISTANT'&&a.slot==='PRIMARY').length,1);
 assert.equal(slots.filter(a=>a.kind==='PROFESSOR'&&a.slot==='PRIMARY').length,1);
 const expected={老女:10,新女:20,老男:20,新男:15};
 for(const [identity,count] of Object.entries(expected)){
   assert.equal(slots.filter(a=>a.identity===identity).length,count,identity);
 }
 for(let n=51;n<=65;n++){
   assert.equal(slots.find(a=>a.id==='member-'+String(n).padStart(2,'0')).identity,'新男');
 }
});
test('identity and code are independently editable and preserved across old-slot migration',()=>{
 const slots=standard72AccountSlots();
 const person=slots.find(a=>a.id==='member-45');
 assert.equal(accountIdentity(person),'老男');
 person.identity='新女';
 person.auxCode='77';
 assert.equal(accountIdentity(person),'新女');
 assert.equal(person.auxCode,'77');
 delete person.identity;
 assert.equal(accountIdentity(person),'老男'); // old accounts retain stable slot identity
});
test('frontend has an editable identity select and persists both fields',()=>{
 assert.ok(ui.includes('class="acc-identity"'));
 assert.ok(ui.includes("a.identity=a.kind==='AUXILIARY'?tr.querySelector('.acc-identity').value:''"));
 assert.ok(ui.includes("a.identity=a.kind==='AUXILIARY'?row.querySelector('.acc-identity').value:''"));
 for(const label of ['老男31–50','老女01–10','新男51–65','新女11–30'])assert.ok(ui.includes(label));
 assert.equal(ui.includes('老男1–20'),false);
 assert.equal(ui.includes('新女51–65'),false);
});
test('backend does not store implicit extra old code when primary code was edited',()=>{
 assert.ok(backend.includes('normalized.personaCodes.filter(c=>c!==oldCode).concat([newCode])'));
 assert.ok(backend.includes("return send(res,422,{error:match.length===0?'ROLE_ACCOUNT_NOT_MAPPED':"));
 assert.ok(backend.includes("'ROLE_IDENTITY_MISMATCH'"));
});
