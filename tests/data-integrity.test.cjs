const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const index=fs.readFileSync('workspace-core.js','utf8');
const deletion=index.slice(index.indexOf('function deletePerson('),index.indexOf('function openSystemGroup('));
for(const kind of ['records','holdings','buyPlans','recommendations','docs','dailyDocs','none'])test('person deletion protects '+kind,()=>{
 const db={people:[{id:'p1'}],records:[],customGroups:[{members:['p1']}],portfolio:{holdings:[],buyPlans:[]},tradeSim:{recommendations:[]},docs:[],dailyDocs:{}};
 if(kind==='records')db.records.push({personId:'p1'});
 if(['holdings','buyPlans'].includes(kind))db.portfolio[kind].push({personId:'p1'});
 if(kind==='recommendations')db.tradeSim.recommendations.push({candidates:[{personId:'p1'}]});
 if(kind==='docs')db.docs.push({html:'<span data-person="p1">Test</span>'});
 if(kind==='dailyDocs')db.dailyDocs['2026-09-29']={html:'<span data-person="p1">Test</span>'};
 const ctx={db,person:()=>db.people[0],pName:()=> 'Test',confirm:()=>true,save(){},render(){},toast(){}};vm.createContext(ctx);vm.runInContext(deletion+"deletePerson('p1')",ctx);
 assert.equal(db.people.length,kind==='none'?0:1);assert.equal(db.customGroups[0].members.length,kind==='none'?0:1);
});
