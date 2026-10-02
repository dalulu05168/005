// Parse all runtime entry points and reject regression patterns before deployment.
const fs=require('node:fs');const assert=require('node:assert/strict');const acorn=require('acorn');
const html=fs.readFileSync('index.html','utf8');const runtime=[...html.matchAll(/<script\b[^>]*src="\.\/([^"?]+)(?:\?[^" ]*)?"[^>]*>/g)].map(m=>m[1]);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m,i)=>({file:'index.html:inline:'+i,source:m[1]}));
for(const file of runtime)scripts.push({file,source:fs.readFileSync(file,'utf8')});
function visit(n,file){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&n.callee.property?.name==='forEach'&&n.callee.object?.type==='CallExpression')assert.notEqual(n.callee.object.callee?.name,'$',file+': single-element selector iterated');const body=Array.isArray(n.body)?n.body:[];const names=new Set();for(const item of body)if(item.type==='FunctionDeclaration'){assert.ok(!names.has(item.id.name),file+': duplicate function '+item.id.name);names.add(item.id.name)}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>visit(x,file));else if(v&&typeof v==='object')visit(v,file)}
for(const {file,source} of scripts){new Function(source);visit(acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}),file);assert.ok(!source.includes('$$$'),file+': invalid selector');assert.ok(!/sb_secret_|service_role/.test(source),file+': privileged key reference in browser runtime');assert.ok(!/password\s*[:=]\s*['"][^'"]+['"]/.test(source),file+': hardcoded password');}
assert.ok(!fs.readFileSync('auth.js','utf8').includes('chennan118'),'login UI must not expose the known account name');
const edge=fs.readFileSync('supabase/functions/workspace-cloud/index.ts','utf8');
assert.ok(/mfa_verified/.test(edge)&&/workspace_complete_mfa/.test(edge),'server must enforce verified MFA sessions');
assert.ok(/PBKDF2/.test(edge)&&/constantTimeEqual/.test(edge),'password verification must remain server-side');
assert.ok(/workspace_sessions/.test(edge)&&/token_hash/.test(edge),'server session tokens must remain hashed and revocable');
console.log(JSON.stringify({gate:'PASS',compiled:scripts.map(x=>x.file),serverAuth:'password + enrolled TOTP + revocable sessions'}));
