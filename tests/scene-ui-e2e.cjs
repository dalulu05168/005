const assert=require('node:assert/strict');const fs=require('node:fs');
async function sceneVisuals(browser,url){
 assert.equal(new URL(url).hostname,'127.0.0.1');
 for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1440,height:900},reducedMotion});
  const people=JSON.parse(fs.readFileSync('data/people.json')).people;
  await context.route('**/functions/v1/workspace-cloud',route=>{const r=route.request().postDataJSON();assert(['login','load'].includes(r.action));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.action==='login'?{ok:true,token:'local-scene-session',account:{username:'e2e_local_scene'}}:{ok:true,version:1,payload:{people,records:[],docs:[],dailyDocs:{},customGroups:[],meta:{},portfolio:{},tradeSim:{}}})})});
  try{
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>document.querySelector('#authRoot')?.dataset.introPhase==='login-ready');await p.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
   await p.waitForFunction(()=>['webgl','canvas2d'].includes(document.querySelector('#authRoot').dataset.sceneRenderer));
   // Sample a complete 18-second cycle: opaque brush pixels must stay outside the coin's conservative circular envelope.
   const separated=await p.evaluate(()=>{
    const brush=document.querySelector('.scene-brush'),coin=document.querySelector('.scene-coin'),root=document.querySelector('.cinematic-brand');
    const animations=[...brush.getAnimations(),...coin.getAnimations()],times=animations.map(a=>a.currentTime),states=animations.map(a=>a.playState);
    const canvas=document.createElement('canvas');canvas.width=root.clientWidth;canvas.height=root.clientHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    let clear=true;
    for(let t=0;t<=18000&&clear;t+=1000){
     animations.forEach(a=>{a.pause();a.currentTime=t});const style=getComputedStyle(brush),matrix=new DOMMatrix(style.transform==='none'?undefined:style.transform),origin=style.transformOrigin.split(' ').map(Number.parseFloat);
     ctx.resetTransform();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.translate(brush.offsetLeft+origin[0],brush.offsetTop+origin[1]);ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);ctx.translate(-origin[0],-origin[1]);ctx.drawImage(brush,0,0,brush.clientWidth,brush.clientHeight);
     const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,cx=coin.offsetLeft+coin.clientWidth/2,cy=coin.offsetTop+coin.clientHeight/2-5,radius=coin.clientWidth*.53;
     for(let y=0;y<canvas.height&&clear;y+=3)for(let x=0;x<canvas.width;x+=3)if(pixels[(y*canvas.width+x)*4+3]>100&&(x-cx)**2+(y-cy)**2<radius**2){clear=false;break}
    }
    animations.forEach((a,i)=>{a.currentTime=times[i];if(states[i]==='running')a.play()});return clear;
   });assert.equal(separated,true,'brush must stay outside the bitcoin throughout the full motion cycle');
   const getTransforms=()=>p.evaluate(()=>['.scene-brush','.scene-coin'].map(s=>getComputedStyle(document.querySelector(s)).transform));
   const lakeFrame=async()=>{
    if(await p.locator('#authRoot').getAttribute('data-scene-renderer')==='canvas2d')return Buffer.from((await p.locator('.scene-lake').evaluate(c=>c.toDataURL('image/png'))).split(',')[1],'base64');
    const r=await p.locator('.scene-lake').boundingBox();return p.screenshot({clip:{x:r.x,y:r.y+r.height*.76,width:r.width,height:r.height*.1}});
   };
   // Capture only actual lake pixels: a Canvas bitmap for 2D, or a water-only region below the coin and above the feature strip for WebGL.
   const first=await getTransforms(),lakeA=await lakeFrame();await p.waitForTimeout(1000);const next=await getTransforms(),lakeB=await lakeFrame();
   if(reducedMotion==='no-preference'){assert.notDeepEqual(next,first,'brush and bitcoin must continue moving at login');assert.notEqual(Buffer.compare(lakeA,lakeB),0,'lake pixels must change independently of object layers')}
   else{
    assert.deepEqual(next,first);
    const difference=await p.evaluate(async([a,b])=>{
     const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='data:image/png;base64,'+src});const images=await Promise.all([load(a),load(b)]),canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height;const ctx=canvas.getContext('2d',{willReadFrequently:true});const pixels=images.map(im=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data});let maximum=0,changed=0;for(let i=0;i<pixels[0].length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(pixels[0][i+c]-pixels[1][i+c]));maximum=Math.max(maximum,d);if(d)changed++}return{maximum,changed,total:canvas.width*canvas.height};
    },[lakeA.toString('base64'),lakeB.toString('base64')]);
    // WebKit can dither a few composited edge pixels by up to two 8-bit levels even with frozen transforms and time.
    assert(difference.maximum<=2&&difference.changed<=difference.total*.001,'reduced motion must freeze scene pixels: '+JSON.stringify(difference));
   }
   await p.locator('#loginUser').fill('e2e_local_scene');await p.locator('#loginPassword').fill('fixture');await p.locator('#loginForm button[type=submit]').click();await p.locator('#authRoot').waitFor({state:'hidden'});assert.equal(await p.locator('#authRoot').getAttribute('data-scene-state'),'disposed');
   await p.locator('.app.app-ready').waitFor({state:'visible'});await p.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
   await p.locator('.cn-brand-image:visible,.cn-header-logo:visible').first().waitFor({state:'visible'});
   assert.equal(await p.locator('.cn-brand-image:visible,.cn-header-logo:visible').count(),1,'one visible brand logo');assert.equal(await p.locator('.brand-copy small:visible,.header-brand span:visible').count(),0,'no duplicate brand title or subtitle');
   await p.locator('.nav [data-page=people]').click();assert.equal(await p.locator('.people-data-table tbody tr:first-child td:first-child').innerText(),'C.01');assert.equal(await p.locator('.people-data-table .person-portrait').count(),70);
   await p.locator('[data-open-person="FR0001"]').click();await p.locator('#personDetailPage.active').waitFor({state:'visible'});assert.match(await p.locator('#personDetailContent .sub').innerText(),/^C\.01/);
   const colors=await p.locator('.detail-line b').first().evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e.parentElement).backgroundColor}));assert.equal(colors.color,'rgb(237, 242, 248)');assert.equal(colors.bg,'rgb(16, 23, 34)');
   await p.locator('.nav [data-page=novel]').click();await p.locator('#speechRanking [data-sp="FR0001"]').click();assert.match(await p.locator('#memoryPerson').innerText(),/Claire Dubois/);assert.match(await p.locator('#speechRanking').innerText(),/C\.01/);
   assert.deepEqual(errors,[]);console.log('PASS independent lake, brush, coin, scene disposal, avatars, profile and writing ('+reducedMotion+')');
  }finally{await context.close()}
 }
}
module.exports={sceneVisuals};
