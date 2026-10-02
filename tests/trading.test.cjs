// Exercise the actual legacy trading functions with isolated, disposable data.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const db={people:[{id:'p1',name:'Test',account:{opened:true}}],records:[],customGroups:[],tradeSim:{offers:[{id:'o1',symbol:'TEST',minShares:10,unitPrice:20,holdDays:3,participantCount:1}],recommendations:[]},portfolio:{holdings:[],buyPlans:[]}};
 const ctx={crypto:require("crypto").webcrypto,db,save(){},toast(){},person:id=>db.people.find(p=>p.id===id),pEnthusiasm:()=>0};
 vm.createContext(ctx);
 const source=fs.readFileSync('trading-simulator.js','utf8').replace('setupUI();bindNav();', 'renderRecommend=()=>{};globalThis.api={makeRecommendations,setCandidate,confirmBuy:executeBuy};');
 vm.runInContext(source,ctx);ctx.api.makeRecommendations('o1');return {db,api:ctx.api};
}
test('buy requires an invitation',()=>{const {db,api}=fixture();api.confirmBuy('o1','p1',10);assert.equal(db.portfolio.holdings.length,0)});
test('repeat buy is idempotent',()=>{const {db,api}=fixture();api.setCandidate('o1','p1','invited');api.confirmBuy('o1','p1',10);api.confirmBuy('o1','p1',10);assert.equal(db.portfolio.holdings.length,1)});
test('regeneration preserves completed candidate state',()=>{const {db,api}=fixture();api.setCandidate('o1','p1','invited');api.confirmBuy('o1','p1',10);api.makeRecommendations('o1');assert.equal(db.tradeSim.recommendations[0].candidates[0].status,'bought')});
test('bought candidate cannot be rejected',()=>{const {db,api}=fixture();api.setCandidate('o1','p1','invited');api.confirmBuy('o1','p1',10);api.setCandidate('o1','p1','rejected');assert.equal(db.tradeSim.recommendations[0].candidates[0].status,'bought')});
test('same symbol across offers creates separate plans',()=>{const {db,api}=fixture();db.tradeSim.offers.push({...db.tradeSim.offers[0],id:'o2'});api.makeRecommendations('o2');api.setCandidate('o1','p1','invited');api.setCandidate('o2','p1','invited');assert.equal(db.portfolio.buyPlans.length,2)});
