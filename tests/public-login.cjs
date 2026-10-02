// Read-only production smoke: submit an invalid account, never unlock or seed business data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
async function rejectedLogin(page){
  const form=page.locator('#loginForm');
  await form.waitFor({state:'visible',timeout:25000});
  await form.locator('[name=user]').fill('__invalid_smoke_'+crypto.randomUUID());
  await form.locator('[name=password]').fill(crypto.randomUUID());
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&
    r.url().endsWith('/functions/v1/workspace-cloud')&&r.request().postDataJSON()?.action==='login',
    {timeout:20000});
  await form.locator('button[type=submit]').click();
  const res=await response;
  assert.equal(res.status(),401,'invalid credentials must be rejected');
  const data=await res.json();assert.equal(data.ok,false);
  await page.waitForFunction(()=>{
    const error=document.querySelector('#authError')?.textContent.trim();
    return error&&!error.includes('正在验证')&&!document.querySelector('#loginForm button[type=submit]')?.disabled;
  },null,{timeout:5000});
  assert.match(await page.locator('#authError').innerText(),/账号|账户|密码|凭据/);
  assert.equal(await page.locator('.app').evaluate(el=>el.classList.contains('app-lock')),true);
  assert.equal(await page.locator('#authRoot').isVisible(),true);
}
async function main(){
  const url=process.env.E2E_URL;if(!url)throw new Error('E2E_URL is required');
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await rejectedLogin(page);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({publicLogin:'PASS',url,invalidCredentials:401,workspaceLocked:true}));
  }finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={rejectedLogin};
