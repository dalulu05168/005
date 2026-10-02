const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(rows){
 const db={portfolio:{holdings:rows,buyPlans:[]},tradeSim:{offers:[],recommendations:[]}};
 const ctx={db};
 vm.createContext(ctx);
 const source=fs.readFileSync('trading-simulator.js','utf8').replace('setupUI();bindNav();','globalThis.api={stockGroups,renderStockChart};');
 vm.runInContext(source,ctx);
 return ctx.api;
}
test('same stock merges purchase batches and deduplicates holders, excluding sold positions',()=>{
 const api=fixture([
 {batchId:'a',symbol:'aaa',market:'美股',currency:'USD',personId:'p1',status:'holding',quantity:10,buyPrice:20},
 {batchId:'b',symbol:'AAA',market:'美股',currency:'USD',personId:'p1',status:'holding',quantity:1000,buyPrice:999},
 {batchId:'c',symbol:'AAA',market:'美股',currency:'USD',personId:'p2',status:'holding'},
 {batchId:'d',symbol:'AAA',market:'美股',currency:'USD',personId:'p3',status:'sold'},
 {batchId:'e',symbol:'BBB',market:'美股',currency:'USD',personId:'p4',status:'holding'}
 ]);
 const groups=api.stockGroups();
 assert.equal(groups.length,2);assert.equal(groups[0].symbol,'AAA');assert.equal(groups[0].count,2);assert.equal(groups[1].count,1);
 const html=api.renderStockChart(groups);
 assert.equal((html.match(/role="listitem"/g)||[]).length,2);
 assert.ok(html.includes('height:180px'));assert.ok(html.includes('height:90px'));
 assert.ok(html.includes('2 人'));assert.ok(html.includes('1 人'));
});
test('same ticker in different markets or currencies stays separate',()=>{
 const api=fixture([
 {symbol:'AAA',market:'美股',currency:'USD',personId:'p1'},
 {symbol:'AAA',market:'港股',currency:'HKD',personId:'p2'},
 {symbol:'AAA',market:'美股',currency:'EUR',personId:'p3'}
 ]);
 assert.equal(api.stockGroups().length,3);
});
test('empty chart is readable and positions without person identifiers do not invent holders',()=>{
 const api=fixture([]);assert.equal(api.stockGroups().length,0);assert.ok(api.renderStockChart([]).includes('暂无持仓'));
 const missing=fixture([{symbol:'AAA'},{symbol:'AAA',personId:''}]);assert.equal(missing.stockGroups()[0].count,0);
});
