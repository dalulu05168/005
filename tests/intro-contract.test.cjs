const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('cinematic intro has a critical pre-auth stylesheet and external scene assets',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const introPos=html.indexOf('intro.css');
  const authPos=html.indexOf('auth.js');
  assert.ok(introPos>=0&&authPos>=0&&introPos<authPos,'intro.css must load before auth.js');
  assert.ok(html.indexOf('theme-system.js')<html.indexOf('<body>'),'theme selection must happen before the auth DOM is created');

  const auth=fs.readFileSync('auth.js','utf8');
  assert.match(auth,/animationend/,'intro completion must be driven by the real animation end');
  assert.match(auth,/auth-intro-active/,'intro must have an explicit start gate');
  assert.match(auth,/prepareIntroAssets/,'critical visual assets must be prepared before starting');
  assert.match(auth,/waitForCloudRuntime/,'session resume must wait for cloud-sync runtime instead of racing script load order');
  assert.match(auth,/data\.introPhase|dataset\.introPhase/,'intro must expose a testable lifecycle state');

  const ui=fs.readFileSync('design-system.js','utf8');
  assert.ok(!ui.includes('data:image/webp;base64'),'large scene images must not be embedded in the workspace design runtime');
  assert.ok(!html.includes('theme-ui.js')&&!html.includes('ui-shell.js')&&!html.includes('workspace-glass.css'),'legacy workspace UI layers must stay removed');

  for(const file of ['intro.css','assets/login/landscape.webp','assets/login/brush.webp','assets/login/bitcoin.webp','login-scene.js']){
    assert.ok(fs.existsSync(file),'missing intro asset '+file);
    assert.ok(fs.statSync(file).size>0,'empty intro asset '+file);
  }
});
