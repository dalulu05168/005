/* Current production acceptance: real browser + isolated cloud account. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');

const URL=process.env.E2E_URL||'https://dalulu05168.github.io/growth-story-workspace/';
const STAGE=process.env.E2E_STAGE||'memory';
let creds=null;
function requireCreds(){
  if(creds)return creds;
  creds=JSON.parse(fs.readFileSync(process.env.E2E_CREDENTIALS||'/tmp/chennan-e2e.json'));
  assert.match(creds.username,/^e2e_/,'Disposable E2E account required');
  return creds;
}

const endpoint='https://afelbznpwltuebmqmqbh.supabase.co/functions/v1/workspace-cloud';
const key='sb_publishable_J548-tZcZAxnUF4HD-VPEA_Gepy26Ec';
let token='';

async function deploymentHash(){
  const files=[
    'index.html','intro.css','theme-system.js','auth.js','workspace-core.js','cloud-sync.js',
    'trade-dashboard.js','people-detail.js','trading-simulator.js','document-workspace.js',
    'overview-final.js','france70-chat.js','character-memory.js','security-ui.js','design-system.js','design-system.css'
  ];
  const mismatches=[];
  for(const file of files){
    const r=await fetch(URL.replace(/\/$/,'')+'/'+file+'?hashcheck='+Date.now());
    assert.equal(r.status,200,file+' HTTP '+r.status);
    const live=Buffer.from(await r.arrayBuffer());
    const local=fs.readFileSync(file);
    const liveHash=crypto.createHash('sha256').update(live).digest('hex');
    const repoHash=crypto.createHash('sha256').update(local).digest('hex');
    if(liveHash!==repoHash)mismatches.push({file,liveHash,repoHash});
  }
  assert.deepEqual(mismatches,[]);
}


async function cloud(action,payload={}){
  const r=await fetch(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:key,...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({action,...payload})
  });
  const data=await r.json();
  return {status:r.status,...data};
}
async function waitCloud(predicate){
  for(let i=0;i<40;i++){
    const r=await cloud('load');
    if(r.ok&&predicate(r.payload))return r.payload;
    await new Promise(r=>setTimeout(r,300));
  }
  assert.fail('cloud state did not reach expected state');
}
async function nav(page,id){
  await page.locator('.nav button[data-page="'+id+'"]').click();
  await page.locator('#'+id+'.active').waitFor({state:'visible',timeout:10000});
}
async function login(page){
  const loginCreds=requireCreds();
  await page.goto(URL,{waitUntil:'networkidle'});
  await page.locator('#loginForm').waitFor({state:'visible',timeout:20000});
  await page.locator('#loginForm input[name=user]').fill(loginCreds.username);
  await page.locator('#loginForm input[name=password]').fill(loginCreds.password);
  const response=page.waitForResponse(r=>r.url()===endpoint&&r.request().postData()?.includes('"action":"login"'));
  await page.locator('#loginForm button[type=submit]').click();
  const res=await response;const body=await res.json();
  assert.equal(res.status(),200);assert.equal(body.ok,true);assert.ok(body.token);
  token=body.token;
  await page.locator('#authRoot').waitFor({state:'hidden',timeout:15000});
}

async function intro(page){
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>{
    window.__chennanIntroEvents=[];
    for(const type of ['chennan:intro-preparing','chennan:intro-start','chennan:intro-complete','chennan:login-ready']){
      document.addEventListener(type,event=>{
        window.__chennanIntroEvents.push({type,at:event.detail?.at??performance.now(),source:event.detail?.source??null});
      });
    }
  });

  await page.goto(URL+'?theme=night&intro-e2e='+Date.now(),{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#authRoot',{state:'visible',timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#authRoot')?.dataset.introPhase==='playing',{timeout:7000});

  assert.equal(await page.locator('#loginForm').count(),0,'login form must not appear before cinematic intro completes');

  const early=await page.locator('.cinematic-brand').evaluate(el=>{
    const s=getComputedStyle(el);return {name:s.animationName,opacity:s.opacity,transform:s.transform};
  });
  assert.equal(early.name,'cnBrand');
  await page.waitForTimeout(1100);
  const later=await page.locator('.cinematic-brand').evaluate(el=>({opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform}));
  assert.notEqual(later.opacity,early.opacity,'full artwork must reveal progressively');

  await page.waitForFunction(()=>document.querySelector('#authRoot')?.dataset.introPhase==='complete',{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('#authRoot')?.dataset.introPhase==='login-ready',{timeout:6000});
  await page.waitForSelector('#loginForm',{state:'attached',timeout:2000});
  assert.ok(
    await page.locator('#authStage').evaluate(el=>el.classList.contains('auth-stage-visible')),
    'login stage must be visibly released only after the intro completes'
  );

  const events=await page.evaluate(()=>window.__chennanIntroEvents||[]);
  console.log(JSON.stringify({introEvents:events}));
  const start=events.find(x=>x.type==='chennan:intro-start');
  const complete=events.find(x=>x.type==='chennan:intro-complete');
  const ready=events.find(x=>x.type==='chennan:login-ready');
  assert.equal(complete?.source,'animationend','intro must finish on the cnBrand event, not the fallback timer');
  assert.ok(start&&complete&&ready,'intro lifecycle events must reach start -> complete -> login-ready');
  const duration=complete.at-start.at;
  assert.ok(duration>=2200&&duration<=4200,'cinematic duration out of bounds: '+duration);
  assert.ok(ready.at>complete.at,'login must reveal only after the cinematic sequence completes');

  const resource=await page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(x=>/landscape\.webp|brush\.webp|bitcoin\.webp/.test(x.name))
    .map(x=>({name:x.name,duration:x.duration,transferSize:x.transferSize})));

  assert.ok(resource.some(x=>x.name.includes('landscape.webp')),'landscape image must load before/for intro');

  console.log(JSON.stringify({intro:'PASS',duration,events,resource}));
}

async function prelogin(page){
  await page.goto(URL,{waitUntil:'networkidle'});
  await page.waitForFunction(
    ()=>document.querySelector('#authRoot')?.dataset.introPhase==='login-ready',
    {timeout:20000}
  );
  await page.locator('#loginForm').waitFor({state:'attached',timeout:2000});
  assert.equal(await page.locator('[data-theme-button]').count(),0);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'reference');
  assert.equal(await page.locator('.auth-title').innerText(),'欢迎回来');
  assert.equal(await page.locator('#loginForm input').count(),2);
  assert.equal(await page.locator('.login-language').innerText(),'简体中文');

}
async function loginOnly(page){
  await login(page);
  await nav(page,'people');
  assert.equal(await page.locator('#peopleList tbody tr').count(),70);
}

async function memory(page){
  await login(page);
  await nav(page,'people');
  assert.equal(await page.locator('#peopleList tbody tr').count(),70);

  await page.locator('.edit-person[data-id=FR0021]').click();
  await page.locator('#modalForm [name=opened]').selectOption('1');
  await page.locator('#modalForm [name=joined]').selectOption('1');
  await page.locator('#modalForm [name=vip]').selectOption('1');
  await page.locator('#modalForm .modal-foot .primary').click();
  await page.locator('#modal').waitFor({state:'hidden'});

  const marker='E2E_MEMORY_'+Date.now();
  await nav(page,'novel');
  await page.locator('#dailyDatePicker').fill('2026-09-30');
  await page.locator('#openDate').click();
  await page.locator('#dailyEditor').fill('21：'+marker);
  await page.locator('#saveDaily').click();

  const stored=await waitCloud(d=>
    d.dailyDocs?.['2026-09-30']?.content?.includes(marker)&&
    d.records?.some(r=>r.personId==='FR0021'&&r.type==='发言记录'&&r.content===marker)
  );
  assert.equal(stored.records.filter(r=>r.personId==='FR0021'&&r.type==='发言记录'&&r.content===marker).length,1);

  await page.locator('[data-sp=FR0021]').click();
  assert.match(await page.locator('#memoryTimeline').innerText(),new RegExp(marker));

  await page.reload({waitUntil:'networkidle'});
  await page.locator('#authRoot').waitFor({state:'hidden',timeout:20000});
  await nav(page,'novel');
  await page.locator('[data-sp=FR0021]').click();
  assert.match(await page.locator('#memoryTimeline').innerText(),new RegExp(marker));

  await page.locator('#dailyDatePicker').fill('2026-10-01');
  await page.locator('#openDate').click();
  await page.locator('#dailyEditor').fill('21：我从来没有开过账户');
  assert.match(await page.locator('#logicWarnings').innerText(),/开户状态冲突/);
}

async function navigation(page){
  await login(page);
  for(const id of ['overview','people','groups','records','novel','topics','trades','tradeRecommend','holdingsV2'])await nav(page,id);
  await page.setViewportSize({width:390,height:844});
  for(const id of ['overview','people','groups','records','novel','topics','trades','tradeRecommend','holdingsV2']){
    await nav(page,id);
    const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,side:document.querySelector('.sidebar').getBoundingClientRect().toJSON(),main:document.querySelector('.main').getBoundingClientRect().toJSON()}));
    assert(layout.scroll<=layout.viewport,'horizontal overflow '+id+' '+JSON.stringify(layout));
    assert(Math.abs(layout.side.width-layout.viewport)<=2,'bottom nav width '+id+' '+JSON.stringify(layout.side));
    assert(layout.main.left>=-1&&layout.main.right<=layout.viewport+1,'main outside viewport '+id+' '+JSON.stringify(layout.main));
  }
}

(async()=>{
  if(STAGE==='hash'){
    await deploymentHash();
    console.log(JSON.stringify({acceptance:'PASS',stage:STAGE}));
    return;
  }
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    if(STAGE==='intro')await intro(page);
    else if(STAGE==='prelogin')await prelogin(page);
    else if(STAGE==='login')await loginOnly(page);
    else if(STAGE==='navigation')await navigation(page);
    else await memory(page);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({acceptance:'PASS',stage:STAGE}));
  }finally{await browser.close()}
})().catch(e=>{console.error('STAGE '+STAGE+' FAILED');console.error(e);process.exit(1)});
