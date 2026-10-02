const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function fixture(overrides={}){let refreshed=0;const data=new Map(),requests=[];const ctx={window:{ChenNanDocumentWorkspace:{refresh(){refreshed++}}},db:{people:[],records:[]},save(){ctx.localStorage.setItem("data",JSON.stringify(ctx.db))},render(){},normalizePerson:p=>p,STORAGE_KEY:'data',DATA_URL:'data/people.json',DEFAULT_DATASET_VERSION:'3',sessionStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},localStorage:{setItem(){},removeItem(){}},document:{dispatchEvent(){}},CustomEvent:class{},AbortController,console:{error(){}},setTimeout,clearTimeout,fetch:async(u,opts)=>{const r=JSON.parse(opts.body);requests.push(r);const answer=r.action==='login'?{ok:true,token:'test-token',account:{username:'test'}}:r.action==='load'?{ok:true,version:1,payload:{people:[{id:'21'}],dailyDocs:{'2026-09-29':{content:'existing'}}}}:{ok:true,version:2};return{ok:true,json:async()=>answer}}};Object.assign(ctx,overrides);vm.createContext(ctx);vm.runInContext(fs.readFileSync('cloud-sync.js','utf8'),ctx);return{ctx,requests,refreshed:()=>refreshed}}
test('cloud hydration refreshes the document editor after loading remote dates',async()=>{const f=fixture();await f.ctx.window.ChenNanCloud.login('test','test');assert.equal(f.refreshed(),1);assert.equal(f.ctx.db.dailyDocs['2026-09-29'].content,'existing')});
test('logout flushes the most recent changes before revoking the session',async()=>{const f=fixture();await f.ctx.window.ChenNanCloud.login('test','test');f.ctx.db.records=[{content:'last edit'}];f.ctx.save();await f.ctx.window.ChenNanCloud.logout();const actions=f.requests.map(x=>x.action);assert.ok(actions.indexOf('save')>0);assert.ok(actions.indexOf('save')<actions.indexOf('logout'));assert.equal(f.requests.find(x=>x.action==='save').payload.records[0].content,'last edit')});
test('logout without edits revokes session without rewriting cloud state',async()=>{const f=fixture();await f.ctx.window.ChenNanCloud.login('test','test');await f.ctx.window.ChenNanCloud.logout();assert.equal(f.requests.filter(x=>x.action==='save').length,0);assert.equal(f.requests.at(-1).action,'logout')});

test('stalled login is aborted and returns a bounded retryable error',async()=>{
  let signal;
  const f=fixture({setTimeout:(fn,ms)=>setTimeout(fn,ms===15000?5:ms),fetch:(_url,opts)=>{signal=opts.signal;return new Promise(()=>{})}});
  await assert.rejects(f.ctx.window.ChenNanCloud.login('invalid','invalid'),e=>e.code==='CLOUD_TIMEOUT'&&/登录连接超时/.test(e.message));
  assert.equal(signal.aborted,true);assert.equal(f.ctx.window.ChenNanCloud.hasSession(),false);
});
test('response body timeout remains bounded after headers arrive',async()=>{
  const f=fixture({setTimeout:(fn,ms)=>setTimeout(fn,ms===15000?5:ms),fetch:async()=>({ok:true,json:()=>new Promise(()=>{})})});
  await assert.rejects(f.ctx.window.ChenNanCloud.login('invalid','invalid'),e=>e.code==='CLOUD_TIMEOUT');
});
test('HTTP authentication errors retain status and server message',async()=>{
  const f=fixture({fetch:async()=>({ok:false,status:401,json:async()=>({ok:false,error:'账号或密码错误'})})});
  await assert.rejects(f.ctx.window.ChenNanCloud.login('invalid','invalid'),e=>e.status===401&&e.message==='账号或密码错误');
});
test('failed writes retain edits and permit a later explicit flush',async()=>{
  const f=fixture({setTimeout:(fn,ms)=>setTimeout(fn,ms===15000?5:ms)});
  await f.ctx.window.ChenNanCloud.login('test','test');
  const original=f.ctx.fetch;let requests=0;
  f.ctx.fetch=(_url,opts)=>{requests++;return new Promise(()=>{})};
  f.ctx.db.records=[{content:'unsynced edit'}];f.ctx.save();
  await assert.rejects(f.ctx.window.ChenNanCloud.flush(),e=>e.code==='CLOUD_TIMEOUT');
  assert.equal(requests,1);assert.equal(f.ctx.db.records[0].content,'unsynced edit');
  f.ctx.fetch=original;await f.ctx.window.ChenNanCloud.flush();
  assert.equal(f.requests.at(-1).payload.records[0].content,'unsynced edit');
});
test('network failure has a readable error without caching credentials',async()=>{
  const f=fixture({fetch:async()=>{throw new TypeError('Failed to fetch')}});
  await assert.rejects(f.ctx.window.ChenNanCloud.login('invalid','invalid'),e=>e.code==='NETWORK_ERROR'&&/检查网络/.test(e.message));
  assert.equal(f.ctx.window.ChenNanCloud.hasSession(),false);
});

test('pending edits survive a new login without being overwritten by the same cloud version',async()=>{
 const storage=new Map();const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const first=fixture({localStorage});await first.ctx.window.ChenNanCloud.login('test','test');
 first.ctx.db.dailyDocs['2026-09-29'].content='offline final sentence';first.ctx.save();
 const second=fixture({localStorage});await second.ctx.window.ChenNanCloud.login('test','test');
 assert.equal(second.ctx.db.dailyDocs['2026-09-29'].content,'offline final sentence');
 await second.ctx.window.ChenNanCloud.flush();assert.equal(storage.has('chennan-pending-v2:test'),false);
 await first.ctx.window.ChenNanCloud.logout();await second.ctx.window.ChenNanCloud.logout();
});
test('a conflicting remote version preserves the pending recovery snapshot',async()=>{
 const storage=new Map();const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 storage.set('chennan-pending-v2:test',JSON.stringify({version:0,payload:{people:[],dailyDocs:{draft:{content:'must not disappear'}}}}));
 const f=fixture({localStorage});await f.ctx.window.ChenNanCloud.login('test','test');
 assert.equal(f.ctx.window.ChenNanCloud.pending().payload.dailyDocs.draft.content,'must not disappear');
 assert.equal(f.ctx.db.dailyDocs['2026-09-29'].content,'existing');await f.ctx.window.ChenNanCloud.logout();
});
test('an MFA challenge does not issue a client session or load private data',async()=>{const f=fixture({fetch:async()=>({ok:true,json:async()=>({ok:true,requiresMfa:true,challenge:'opaque-test-challenge'})})});const result=await f.ctx.window.ChenNanCloud.login('test','test');assert.equal(result.requiresMfa,true);assert.equal(f.ctx.window.ChenNanCloud.hasSession(),false);assert.equal(f.refreshed(),0)});
test('a previously authenticated workspace restores the pending draft when cloud is offline',async()=>{const storage=new Map(),localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};const f=fixture({localStorage});await f.ctx.window.ChenNanCloud.login('test','test');f.ctx.db.records=[{content:'offline recovery'}];f.ctx.save();const online=f.ctx.fetch;f.ctx.fetch=async()=>{throw Error('offline')};assert.equal(await f.ctx.window.ChenNanCloud.resume(),true);assert.equal(f.ctx.db.records[0].content,'offline recovery');f.ctx.fetch=online;await f.ctx.window.ChenNanCloud.logout()});
