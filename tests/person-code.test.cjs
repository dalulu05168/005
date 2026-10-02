const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const acorn=require('acorn');
test('C.01–C.70 aliases resolve existing people without breaking data references',()=>{
 const people=JSON.parse(fs.readFileSync('data/people.json')).people;
 const src=fs.readFileSync('workspace-core.js','utf8'),ast=acorn.parse(src,{ecmaVersion:'latest'});
 const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['person','pCode'].includes(n.id.name)).map(n=>src.slice(n.start,n.end)).join('\n');
 const ctx={db:{people}};vm.createContext(ctx);vm.runInContext(functions,ctx);
 for(let i=0;i<70;i++){const code='C.'+String(i+1).padStart(2,'0');assert.equal(ctx.pCode(people[i]),code);assert.equal(ctx.person(code),people[i]);assert.equal(ctx.person(people[i].id),people[i]);assert.equal(people[i].display_id,code)}
 assert.equal(new Set(people.map(ctx.pCode)).size,70);assert.equal(ctx.person('C.71'),null);
 const expected=[['OLD','女',10],['NEW','女',20],['OLD','男',20],['NEW','男',20]];let offset=0;
 for(const [relation,gender,count] of expected){for(const p of people.slice(offset,offset+count)){assert.equal(p.gender,gender);assert.equal(p.customer_relation.type_code,relation)}offset+=count}
});
