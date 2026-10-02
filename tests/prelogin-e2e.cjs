const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {rejectedLogin}=require('./public-login.cjs');
const {verifyRelease}=require('../scripts/verify-release.cjs');
const {workspaceVisuals}=require('./workspace-visuals.cjs');
const {sceneVisuals}=require('./scene-ui-e2e.cjs');
const root=path.resolve('dist/pages');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);res.end();return;
  }
  res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');
  res.end(fs.readFileSync(file));
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  let browser;
  try{
    const release=await verifyRelease(url);assert(release.files>=18);
    assert(!fs.existsSync(path.join(root,'supabase')),'server source must not be published');
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1440,height:900},reducedMotion:'reduce'});
    let mode='reject',loginRequests=0;
    await context.route('**/functions/v1/workspace-cloud',async route=>{
      assert.equal(route.request().postDataJSON().action,'login','tests must never access business data');
      loginRequests++;
      if(mode==='hang')return;
      await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({ok:false,error:'账号或密码错误'})});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?theme=warm');
    await page.locator('#loginForm').waitFor({state:'visible',timeout:7000});
    assert.equal(await page.locator('#authRoot').getAttribute('data-intro-phase'),'login-ready');
    await rejectedLogin(page);assert.equal(loginRequests,1);
    console.log('PASS rejected login submits exactly once and keeps the workspace locked');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'reference');
    assert.equal(await page.locator('[data-theme-button]').count(),0);
    await page.getByRole('button',{name:'显示密码',exact:true}).click();
    assert.equal(await page.locator('#loginPassword').getAttribute('type'),'text');
    await page.getByRole('button',{name:'隐藏密码',exact:true}).click();
    assert.equal(await page.locator('#loginPassword').getAttribute('type'),'password');
    await page.locator('#rememberAccount').check();await rejectedLogin(page);
    const remembered=await page.locator('#loginUser').inputValue();
    assert.equal(await page.evaluate(()=>localStorage.getItem('chennan-login-account')),remembered);
    await page.goto(url+'?theme=blue');await page.locator('#loginForm').waitFor({state:'visible'});
    assert.equal(await page.locator('html').getAttribute('data-theme'),'reference');
    assert.equal(await page.locator('#loginUser').inputValue(),remembered);
    assert.equal(await page.locator('#rememberAccount').isChecked(),true);
    await page.locator('#rememberAccount').uncheck();
    assert.equal(await page.evaluate(()=>localStorage.getItem('chennan-login-account')),null);
    await page.locator('#passwordHelp').click();assert.equal(await page.locator('#authHelp').isVisible(),true);
    console.log('PASS fixed approved workspace theme, black-gold login scene, password visibility, account-only memory and password help');
    for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1920,1080]]){
      await page.setViewportSize({width,height});
      const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
      assert(size.scroll<=size.width+1,'desktop login overflow '+width);
      await page.locator('#loginForm button[type=submit]').scrollIntoViewIfNeeded();
    }
    console.log('PASS desktop login at four sizes');
    mode='hang';
    await page.locator('#loginForm [name=user]').fill('__timeout_check__');
    await page.locator('#loginForm [name=password]').fill('invalid-credential');
    await page.locator('#loginForm button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#authError')?.textContent.includes('超时'),null,{timeout:19000});
    assert.equal(await page.locator('#loginForm button[type=submit]').isEnabled(),true);
    assert.equal(loginRequests,3,'requests must not be retried automatically');
    console.log('PASS stalled login times out and allows an explicit retry');
    mode='reject';await rejectedLogin(page);assert.equal(loginRequests,4);
    assert.deepEqual(errors,[]);
    await context.close();

    const normal=await browser.newContext({serviceWorkers:"block",reducedMotion:'no-preference'});
    const motion=await normal.newPage();
    await motion.addInitScript(()=>{
      window.introResults=[];
      document.addEventListener('chennan:intro-complete',e=>window.introResults.push(e.detail.source));
    });
    await motion.goto(url);
    await motion.getByRole('button',{name:'跳过动画',exact:true}).click();
    await motion.locator('#loginForm').waitFor({state:'visible',timeout:4000});
    assert.deepEqual(await motion.evaluate(()=>window.introResults),['user-skip']);
    assert.equal(await motion.locator('#skipIntro').count(),0);
    console.log('PASS skip animation releases login exactly once');
    fs.mkdirSync('evidence',{recursive:true});
    await motion.screenshot({path:'evidence/repaired-login.png'});
    await normal.close();

    const unavailable=await browser.newContext({serviceWorkers:"block",reducedMotion:'reduce'});
    await unavailable.route('**/cloud-sync.js*',route=>route.abort());
    const missing=await unavailable.newPage();await missing.goto(url);
    await missing.locator('#loginForm').waitFor({state:'visible',timeout:8000});
    assert.match(await missing.locator('#authError').innerText(),/登录服务未加载/);
    console.log('PASS missing cloud runtime shows an actionable login error');
    await unavailable.close();
    await workspaceVisuals(browser,url);
    await sceneVisuals(browser,url);
    const safari=await webkit.launch({headless:true});
    try{await workspaceVisuals(safari,url);await sceneVisuals(safari,url)}finally{await safari.close()}
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
run().catch(e=>{console.error(e);process.exitCode=1});
