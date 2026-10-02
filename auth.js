/* Authentication boots independently of the business render pipeline. */
(function(){
'use strict';

const byId=id=>document.getElementById(id);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const INTRO_FALLBACK_MS=7600;
const CLOUD_RUNTIME_WAIT_MS=3000;

async function waitForCloudRuntime(){
  const deadline=performance.now()+CLOUD_RUNTIME_WAIT_MS;
  while(!window.ChenNanCloud&&performance.now()<deadline){
    await wait(25);
  }
  return window.ChenNanCloud||null;
}

function emitIntro(type,detail={}){
  document.dispatchEvent(new CustomEvent(type,{
    detail:{...detail,at:performance.now()}
  }));
}

// 品牌字只负责清晰显示名称；毛笔动画使用独立视觉元素，避免笔画和文字重复叠加。
function brushLogo(extraClass=''){
  return '<span class="brand-calligraphy '+extraClass+'" role="img" aria-label="辰南撰写">辰南撰写</span>';
}
window.ChenNanBrandMarkup=brushLogo;

function cinematicIntro(){
  return '<div class="auth-cinematic" id="authCinematic" aria-hidden="true"><div class="cinematic-brand"><canvas class="scene-lake"></canvas><img class="scene-brush" src="./assets/login/brush.webp" alt=""><div class="scene-coin"><img src="./assets/login/bitcoin.webp" alt=""><img class="coin-back" src="./assets/login/bitcoin.webp" alt=""></div></div></div>';
}

function nextPaint(){
  return new Promise(resolve=>{
    requestAnimationFrame(()=>requestAnimationFrame(resolve));
  });
}

function imageReady(src){
  return new Promise(resolve=>{
    if(!src){resolve();return}
    const img=new Image();
    let settled=false;
    const done=()=>{if(settled)return;settled=true;resolve()};
    img.onload=done;
    img.onerror=done;
    img.src=src;
    if(img.decode)img.decode().then(done,done);
  });
}

function backgroundUrls(element){
  const css=getComputedStyle(element).backgroundImage||'';
  return [...css.matchAll(/url\((?:["'])?([^"')]+)(?:["'])?\)/g)].map(match=>match[1]);
}

async function prepareIntroAssets(root){
  const jobs=[
    Promise.all([imageReady('./assets/login/landscape.webp'),imageReady('./assets/login/brush.webp'),imageReady('./assets/login/bitcoin.webp')]),
    ...backgroundUrls(root).map(imageReady)
  ];
  if(document.fonts?.ready)jobs.push(document.fonts.ready.catch(()=>{}));
  await Promise.race([
    Promise.allSettled(jobs),
    wait(1800)
  ]);
}

function waitForAnimation(element,animationName,timeoutMs,skip){
  return new Promise(resolve=>{
    let settled=false;
    const finish=source=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      element?.removeEventListener('animationend',onEnd);
      resolve(source);
    };
    const onEnd=event=>{
      if(event.target===element&&event.animationName===animationName)finish('animationend');
    };
    const timer=setTimeout(()=>finish('fallback'),timeoutMs);
    element?.addEventListener('animationend',onEnd);
    skip?.then(()=>finish('user-skip'));
  });
}

function storedSessionExists(){
  try{return Boolean(sessionStorage.getItem('chennan-cloud-session-v1'))}
  catch{return false}
}

async function runIntro(root){
  window.ChenNanScene?.mount(root);
  const skipButton=root.querySelector('#skipIntro');
  let skipped=false;
  const skip=new Promise(resolve=>{
    if(skipButton)skipButton.onclick=()=>{skipped=true;resolve('user-skip')};
  });
  // 已登录会话只做快速恢复，避免每次刷新都强制播放完整电影开场。
  if(storedSessionExists()){
    skipButton?.remove();
    root.dataset.introFast='true';
    root.dataset.introPhase='resume';
    root.classList.add('auth-intro-finish');
    emitIntro('chennan:intro-skip',{reason:'session-resume'});

    const cloud=await waitForCloudRuntime();
    if(!cloud){
      console.warn('CHENNAN_CLOUD_RUNTIME_TIMEOUT');
    }
    await showAuthCard();
    return;
  }

  root.dataset.introPhase='preparing';
  emitIntro('chennan:intro-preparing');

  await Promise.race([prepareIntroAssets(root),skip]);
  await nextPaint();

  if(!skipped){
    root.dataset.introPhase='playing';
    root.classList.add('auth-intro-active');
    emitIntro('chennan:intro-start');
  }

  const reduced=matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const source=skipped?'user-skip':reduced
    ? (await wait(40),'reduced-motion')
    : await waitForAnimation(root.querySelector('.cinematic-brand'),'cnBrand',INTRO_FALLBACK_MS,skip);

  skipButton?.remove();
  if(reduced||skipped)root.dataset.introFast='true';
  root.classList.remove('auth-intro-active');
  root.classList.add('auth-intro-finish');
  root.dataset.introPhase='complete';
  emitIntro('chennan:intro-complete',{source});

  await wait(reduced||skipped?0:260);
  await showAuthCard();
}

function injectAuth(){
  const app=document.querySelector('.app');
  if(app)app.classList.add('app-lock');

  const root=document.createElement('div');
  root.id='authRoot';
  root.className='auth-root auth-intro-running';
  root.dataset.introPhase='created';
  root.innerHTML=cinematicIntro()+'<div id="authStage" class="auth-stage auth-stage-pending"></div>';
  const skip=document.createElement('button');
  skip.id='skipIntro';skip.type='button';skip.className='intro-skip';skip.textContent='跳过动画';
  root.appendChild(skip);
  document.body.appendChild(root);

  runIntro(root).catch(error=>{
    console.error('CHENNAN_INTRO_FAILED',error);
    root.classList.remove('auth-intro-active');
    root.classList.add('auth-intro-finish');
    root.dataset.introPhase='fallback';
    root.querySelector('#skipIntro')?.remove();
    showAuthCard();
  });
}

let authCardShown=false;
async function showAuthCard(){
  if(authCardShown)return;
  authCardShown=true;

  const stage=byId('authStage');
  if(!stage)return;
  const root=byId('authRoot');

  const cloud=window.ChenNanCloud||await waitForCloudRuntime();

  if(cloud?.hasSession?.()){
    stage.innerHTML='<div class="auth-card auth-card-resume"><div class="auth-logo">'+brushLogo('brand-brush-small')+'</div><h1 class="auth-title">正在连接云端</h1><p class="auth-sub">正在同步工作区…</p><div class="auth-error" id="authError"></div></div>';
    stage.classList.remove('auth-stage-pending');
    stage.classList.add('auth-stage-visible');
    if(await cloud.resume()){unlockApp();return}

    stage.classList.remove('auth-stage-visible');
    stage.classList.add('auth-stage-pending');
  }

  stage.innerHTML='<div class="login-shell">'
    +'<h1 class="login-accessible-brand">辰南撰写 · 笔尖上的比特币</h1>'
    +'<div class="login-language"><img src="./icons/globe.svg" alt="">简体中文</div>'
    +'<div class="auth-card">'
      +'<h2 class="auth-title">欢迎回来</h2>'
      +'<p class="auth-sub">从角色出发，继续构建你的故事世界</p>'
      +'<form id="loginForm">'
        +'<div class="auth-field"><label for="loginUser">账号</label><div class="auth-input-wrap"><img class="auth-input-icon" src="./icons/user.svg" alt=""><input id="loginUser" name="user" autocomplete="username" placeholder="请输入账号" aria-describedby="authError" required></div></div>'
        +'<div class="auth-field"><label for="loginPassword">密码</label><div class="auth-input-wrap"><img class="auth-input-icon" src="./icons/lock-key.svg" alt=""><input id="loginPassword" type="password" name="password" autocomplete="current-password" placeholder="请输入密码" aria-describedby="authError" required><button type="button" class="auth-password-toggle" aria-label="显示密码" aria-pressed="false"><img src="./icons/eye.svg" alt=""></button></div></div>'
        +'<button type="submit" class="auth-btn">进入工作台 <img src="./icons/arrow-right.svg" alt=""></button>'
        +'<div class="auth-error" id="authError" role="alert"></div>'
      +'</form>'
      +'<div class="auth-assist"><label><input type="checkbox" id="rememberAccount">记住账号</label><button type="button" id="passwordHelp" aria-expanded="false" aria-controls="authHelp">忘记密码？</button></div>'
      +'<p id="authHelp" hidden>请联系管理员重置密码。账号密码由服务器验证。</p>'
    +'</div>'
    +'<div class="login-features" aria-label="工作台功能">'
      +'<div><img src="./icons/users-four.svg" alt=""><span>多角色管理</span></div>'
      +'<div><img src="./icons/chats.svg" alt=""><span>群组运营</span></div>'
      +'<div><img src="./icons/chart-line-up.svg" alt=""><span>交易计划</span></div>'
      +'<div><img src="./icons/chart-pie-slice.svg" alt=""><span>数据分析</span></div>'
    +'</div>'
  +'</div>';

  try{const remembered=localStorage.getItem('chennan-login-account');if(remembered){byId('loginUser').value=remembered;byId('rememberAccount').checked=true}}catch{}
  stage.querySelector('.auth-password-toggle').onclick=function(){
    const visible=byId('loginPassword').type==='password';byId('loginPassword').type=visible?'text':'password';
    this.setAttribute('aria-pressed',String(visible));this.setAttribute('aria-label',visible?'隐藏密码':'显示密码');
    this.querySelector('img').src=visible?'./icons/eye-slash.svg':'./icons/eye.svg';
  };
  byId('passwordHelp').onclick=function(){const open=byId('authHelp').hidden;byId('authHelp').hidden=!open;this.setAttribute('aria-expanded',String(open))};
  byId('rememberAccount').onchange=function(){if(!this.checked){try{localStorage.removeItem('chennan-login-account')}catch{}}};

  root?.classList.add('auth-form-ready');
  setTimeout(()=>{
    stage.classList.remove('auth-stage-pending');
    stage.classList.add('auth-stage-visible');
    root.dataset.introPhase='login-ready';
    emitIntro('chennan:login-ready');
  },root.dataset.introFast==='true'?0:120);
  if(!cloud)byId('authError').textContent='登录服务未加载，请刷新页面重试';

  byId('loginForm').onsubmit=async function(e){
    e.preventDefault();
    const f=new FormData(e.target),err=byId('authError'),btn=e.target.querySelector('button[type="submit"]');
    err.textContent='正在验证并同步云端数据…';
    btn.disabled=true;
    e.target.setAttribute('aria-busy','true');
    try{if(byId('rememberAccount').checked)localStorage.setItem('chennan-login-account',String(f.get('user')||'').trim());else localStorage.removeItem('chennan-login-account')}catch{}
    try{
      const runtime=window.ChenNanCloud||await waitForCloudRuntime();
      if(!runtime)throw new Error('登录服务未加载，请刷新页面重试');
      const result=await runtime.login(String(f.get('user')||'').trim(),String(f.get('password')||''));
      root?.classList.add('auth-success');
      setTimeout(unlockApp,720);
    }catch(ex){
      err.textContent=ex?.message||'登录失败';
      btn.disabled=false;
    }finally{
      e.target.setAttribute('aria-busy','false');
    }
  };
}

function unlockApp(){
  const root=byId('authRoot');
  if(root)root.classList.add('hidden');
  const app=document.querySelector('.app');
  if(app){
    app.classList.remove('app-lock');
    app.classList.add('app-ready');
  }
}

injectAuth();
})();
