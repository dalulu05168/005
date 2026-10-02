/* 辰南云端数据桥：服务端账号验证 + Supabase 工作区同步。 */
(function(){
'use strict';

const CLOUD_URL='https://afelbznpwltuebmqmqbh.supabase.co/functions/v1/workspace-cloud';
const PUBLISHABLE_KEY='sb_publishable_J548-tZcZAxnUF4HD-VPEA_Gepy26Ec';
const SESSION_KEY='chennan-cloud-session-v1';
const ACCOUNT_KEY='chennan-cloud-account-v1';
let cloudVersion=0;
let hydrated=false;
let saveTimer=null;
let saving=null;
let queued=false;
let editGeneration=0, savedGeneration=0;
let retryTimer=null, retryAttempt=0;
const JOURNAL_PREFIX='chennan-pending-v2:';
function journalKey(){const name=account().username;return name?JOURNAL_PREFIX+name:null}
function cacheKey(){const key=journalKey();return key?key+':cache':null}
function readJournal(){try{const key=journalKey();return key&&JSON.parse(localStorage.getItem?.(key)||'null')}catch(_){return null}}
function writeJournal(){const key=journalKey();if(!key||!hydrated)return;try{localStorage.setItem(key,JSON.stringify({version:cloudVersion,payload:db,updatedAt:new Date().toISOString()}))}catch(error){document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:'LOCAL_STORAGE_FAILED'}}));throw error}}
function retryLater(error){if(error?.status===401||error?.code==='VERSION_CONFLICT')return;clearTimeout(retryTimer);retryTimer=setTimeout(()=>flush().catch(()=>{}),Math.min(30000,1000*2**Math.min(retryAttempt++,5)));retryTimer?.unref?.()}

const REQUEST_TIMEOUT_MS=15000;

function getToken(){return sessionStorage.getItem(SESSION_KEY)||''}
function setToken(token){if(token)sessionStorage.setItem(SESSION_KEY,token);else sessionStorage.removeItem(SESSION_KEY)}
function headers(withAuth=true){
  const h={'Content-Type':'application/json','apikey':PUBLISHABLE_KEY};
  const token=getToken();if(withAuth&&token)h.Authorization='Bearer '+token;
  return h;
}
async function requestJson(url,options,action){
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const error=new Error(action==='login'?'登录连接超时，请检查网络后重试':'云端连接超时，请重试；本地修改仍保留');
      error.code='CLOUD_TIMEOUT';reject(error);controller.abort();
    },REQUEST_TIMEOUT_MS);
  });
  const request=(async()=>{
    const res=await fetch(url,{...options,signal:controller.signal});
    let data;
    try{data=await res.json()}catch(error){
      if(controller.signal.aborted)throw error;
      const invalid=new Error('云端响应格式错误，请稍后重试');invalid.code='INVALID_RESPONSE';throw invalid;
    }
    return {res,data};
  })();
  try{return await Promise.race([request,timeout])}catch(error){
    if(error.code)throw error;
    const network=new Error('无法连接云端，请检查网络后重试');network.code='NETWORK_ERROR';throw network;
  }finally{clearTimeout(timer)}
}
async function call(action,payload={},withAuth=true){
  const {res,data}=await requestJson(CLOUD_URL,{method:'POST',headers:headers(withAuth),body:JSON.stringify({action,...payload})},action);
  if(!res.ok||!data?.ok){const e=new Error(data?.error||('云端请求失败 HTTP '+res.status));e.status=res.status;e.code=data?.code;e.data=data;throw e}
  return data;
}
function normalizePayload(raw){
  const out=raw&&typeof raw==='object'?raw:{};
  out.people=Array.isArray(out.people)?out.people.map(normalizePerson):[];
  out.records=Array.isArray(out.records)?out.records:[];
  out.docs=Array.isArray(out.docs)?out.docs:[];
  out.dailyDocs=out.dailyDocs&&typeof out.dailyDocs==='object'&&!Array.isArray(out.dailyDocs)?out.dailyDocs:{};
  out.customGroups=Array.isArray(out.customGroups)?out.customGroups:[];
  out.meta=out.meta&&typeof out.meta==='object'?out.meta:{};
  out.portfolio=out.portfolio&&typeof out.portfolio==='object'?out.portfolio:{};
  out.tradeSim=out.tradeSim&&typeof out.tradeSim==='object'?out.tradeSim:{};
  return out;
}
async function ensureDefaultPeople(){
  if(db.people?.length)return;
  const {res,data:src}=await requestJson(DATA_URL,{cache:'no-store'},'dataset');
  if(!res.ok)throw new Error('人物资料加载失败，请稍后重试');
  const list=Array.isArray(src)?src:(Array.isArray(src.people)?src.people:[]);
  if(list.length){db.people=list.map(normalizePerson);db.meta.defaultDatasetVersion=DEFAULT_DATASET_VERSION;db.meta.defaultDatasetName=src.dataset_name||'法国人物70位'}
}
async function hydrate(){
  const pending=readJournal();
  let result;
  try{result=await call('load')}catch(error){
    if(error.status===401)throw error;
    let cached;try{cached=JSON.parse(localStorage.getItem?.(cacheKey())||'null')}catch(_){}
    const offline=pending||cached;
    if(!getToken()||!offline?.payload)throw error;
    db=normalizePayload(offline.payload);cloudVersion=Number(offline.version||0);hydrated=true;editGeneration=pending?1:0;savedGeneration=0;
    render();window.ChenNanDocumentWorkspace?.refresh?.();
    document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:'OFFLINE_RECOVERY'}}));
    retryLater(error);return {offline:true};
  }
  cloudVersion=Number(result.version||0);
  if(result.payload&&typeof result.payload==='object'){
    db=normalizePayload(result.payload);
  }else{
    await ensureDefaultPeople();
  }
  hydrated=true;editGeneration=0;savedGeneration=0;
  if(pending?.payload){
    if(Number(pending.version)===cloudVersion){db=normalizePayload(pending.payload);editGeneration=1;}
    else {localStorage.setItem(journalKey()+':conflict',JSON.stringify(pending));document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:'RECOVERY_CONFLICT'}}));}
  }
  localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
  if(cacheKey())localStorage.setItem(cacheKey(),JSON.stringify({version:cloudVersion,payload:db}));
  render();
  window.ChenNanDocumentWorkspace?.refresh?.();
  if(!result.payload){editGeneration++;await flush(true);}
  document.dispatchEvent(new CustomEvent('chennan:cloud-ready',{detail:{version:cloudVersion,updatedAt:result.updatedAt||null,pending:editGeneration!==savedGeneration}}));
  if(editGeneration!==savedGeneration)scheduleSave(0);
  if(localStorage.getItem?.(journalKey()+':conflict'))document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:'RECOVERY_CONFLICT'}}));
  return result;
}
// Await in-flight writes before flushing newer edits. Never report a failed save as synced.
async function flush(force=false){
  clearTimeout(saveTimer);
  if(!getToken()||!hydrated)return;
  if(saving){queued=true;await saving;if(queued){queued=false;return flush(force)}return}
  if(editGeneration===savedGeneration)return;
  const generation=editGeneration;
  const snapshot=JSON.parse(JSON.stringify(db));
  saving=(async()=>{
    try{
      const result=await call('save',{payload:snapshot,expectedVersion:cloudVersion});
      cloudVersion=Number(result.version);savedGeneration=generation;
      retryAttempt=0;clearTimeout(retryTimer);
      try{if(cacheKey())localStorage.setItem(cacheKey(),JSON.stringify({version:cloudVersion,payload:snapshot}));if(editGeneration===generation){const key=journalKey();if(key)localStorage.removeItem(key)}else writeJournal()}catch(error){console.warn('Local recovery cache unavailable')}
      sessionStorage.setItem('chennan-cloud-version',String(cloudVersion));
      document.dispatchEvent(new CustomEvent('chennan:cloud-saved',{detail:{version:cloudVersion,updatedAt:result.updatedAt}}));
    }catch(err){
      console.error('Cloud save failed',err);
      retryLater(err);
      document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:err.status===401?'AUTH_EXPIRED':err.code||'SAVE_FAILED'}}));
      if(typeof toast==='function')toast(err.code==='VERSION_CONFLICT'?'云端有其他修改，本地内容尚未同步，请先导出备份再刷新':'云端保存失败，本地缓存仍保留，请重试');
      throw err;
    }
  })();
  try{await saving}finally{saving=null}
  if(queued){queued=false;return flush(force)}
}

function scheduleSave(delay=450){
  if(!getToken()||!hydrated)return;
  document.dispatchEvent(new CustomEvent('chennan:cloud-saving'));
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush(false).catch(()=>{}),delay);
}
async function login(username,password){
  const data=await call('login',{username,password},false);
  if(data?.requiresMfa||!data?.token){
    setToken('');sessionStorage.removeItem(ACCOUNT_KEY);
    return data;
  }
  setToken(data.token);sessionStorage.setItem(ACCOUNT_KEY,JSON.stringify(data.account||{}));
  await hydrate();return data;
}
async function resume(){
  if(!getToken())return false;
  try{await hydrate();return true}catch(err){if(err.status===401){setToken('');sessionStorage.removeItem(ACCOUNT_KEY)}return false}
}
async function logout(){
  if(getToken()){
    window.ChenNanDocumentWorkspace?.saveDraft?.();
    await flush(true);
    await call('logout');
  }
  clearTimeout(saveTimer);clearTimeout(retryTimer);setToken('');
  sessionStorage.removeItem(ACCOUNT_KEY);sessionStorage.removeItem('chennan-cloud-version');hydrated=false;
  localStorage.removeItem(STORAGE_KEY);
}

function account(){try{return JSON.parse(sessionStorage.getItem(ACCOUNT_KEY)||'{}')}catch(_){return{}}}

const localSave=save;
save=function(){let failed=false;try{localSave()}catch(error){failed=true}editGeneration++;try{writeJournal()}catch(error){failed=true}scheduleSave();if(failed)document.dispatchEvent(new CustomEvent('chennan:cloud-error',{detail:{code:'LOCAL_STORAGE_FAILED'}}))};
window.addEventListener?.('online',()=>{retryAttempt=0;flush().catch(()=>{})});
window.addEventListener?.('pagehide',()=>{window.ChenNanDocumentWorkspace?.saveDraft?.();if(editGeneration!==savedGeneration)writeJournal()});
document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden'){window.ChenNanDocumentWorkspace?.saveDraft?.();flush().catch(()=>{})}});

window.ChenNanCloud={login,resume,logout,hydrate,flush,hasSession:()=>!!getToken(),account,pending:()=>readJournal(),exportPending:()=>{let pending;try{pending=JSON.parse(localStorage.getItem?.(journalKey()+':conflict')||'null')||readJournal()}catch(_){pending=readJournal()}if(!pending&&hydrated)pending={version:cloudVersion,payload:db};if(!pending)return false;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(pending,null,2)],{type:'application/json'}));a.download='chennan-unsynced-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return true},get version(){return cloudVersion},get hydrated(){return hydrated}};
})();
