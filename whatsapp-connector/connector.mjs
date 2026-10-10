import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import readline from 'node:readline/promises';
import { WhatsAppSessionRuntime } from './runtime.mjs';

const CLOUD_ORIGIN='https://nuvexa-ops-bridge.onrender.com';
const root=path.resolve(process.env.LOCALAPPDATA||path.join(os.homedir(),'.nuvexa'),'NuvexaPro','WhatsAppConnector');
const cfgPath=path.join(root,'config.json');
const accountsPath=path.join(root,'authorized-accounts.json');
const authPath=path.join(root,'sessions');
const now=()=>new Date().toLocaleTimeString('zh-CN',{hour12:false});
const log=msg=>console.log('['+now()+'] '+msg);
const secureWrite=async(file,json)=>{
  const tmp=file+'.tmp';
  await fs.writeFile(tmp,JSON.stringify(json,null,2)+'\n',{encoding:'utf8',mode:0o600});
  await fs.rename(tmp,file);
};
async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){
    if(e.code==='ENOENT')return fallback;
    throw Error('无法读取本地配置 '+path.basename(file)+': '+e.message)
  }
}
function backendUrl(value){
  const url=new URL(String(value||CLOUD_ORIGIN));
  if(url.origin!==CLOUD_ORIGIN && !(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))){
    throw Error('仅允许 Nuvexa Pro 云服务或本地测试地址');
  }
  return url.origin;
}
async function request(base,route,{token='',method='GET',body}={}){
  const headers={'accept':'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(token)headers['x-nuvexa-connector-token']=token;
  let response;
  try{response=await fetch(base+route,{method,headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(16000)
  })}catch(e){throw Error('网络连接失败：'+e.message)}
  let data={};
  try{data=await response.json()}catch{}
  if(!response.ok){
    const e=Error(String(data.error||data.message||'REQUEST_FAILED')+' (HTTP '+response.status+')');
    e.status=response.status;throw e;
  }
  return data;
}
async function main(){
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(authPath,{recursive:true});
  const config=await readJson(cfgPath,{});
  const origin=backendUrl(process.env.NUVEXA_API_URL||config.origin||CLOUD_ORIGIN);
  let token=String(config.token||'');
  if(token){
    try{
      await request(origin,'/v1/worker/accounts/requests',{token});
      log('已恢复本机设备连接授权。');
    }catch(e){
      if(e.status===401)token='';
      else throw e;
    }
  }
  if(!token){
    log('首次连接或连接码已过期。');
    log('在后台「账号管理」点击「连接 Windows 扫码程序」生成10分钟有效连接码。');
    const input=readline.createInterface({input:process.stdin,output:process.stdout});
    const code=String(process.env.NUVEXA_PAIR_CODE||await input.question('请输入后台显示的连接码（不会写入日志）：')).trim().replace(/[\s-]/g,'').toUpperCase();
    input.close();
    if(!/^[A-F0-9]{24}$/.test(code))throw Error('连接码格式不正确，需24位字母数字');
    const response=await request(origin,'/v1/worker/enrollment/claim',{method:'POST',body:{code}});
    if(!/^nw_[a-f0-9]{64}$/.test(response.token))throw Error('云端没有返回有效设备授权');
    token=response.token;
    await secureWrite(cfgPath,{origin,token,pairingCreatedAt:new Date().toISOString()});
    log('设备连接成功；密钥仅保存在当前 Windows 用户的私有本地目录。');
  }
  const ww=await import('whatsapp-web.js'),w=ww.default||ww;
  const qrPkg=await import('qrcode'),qr=qrPkg.default||qrPkg;
  const Client=w.Client,LocalAuth=w.LocalAuth;
  if(!Client||!LocalAuth||typeof qr.toDataURL!=='function')throw Error('WhatsApp 登录依赖未能加载');
  const baseArgs=['--disable-gpu','--no-first-run'];
  const executablePath=process.env.NUVEXA_CHROME_PATH||undefined;
  const runtime=new WhatsAppSessionRuntime({
    createClient:async accountId=>{
      return new Client({
        authStrategy:new LocalAuth({clientId:accountId,dataPath:authPath}),
        qrMaxRetries:0,
        puppeteer:{
          headless:true,
          ...(executablePath?{executablePath}:{}),
          args:baseArgs
        }
      });
    },
    toPngDataUrl:raw=>qr.toDataURL(raw,{type:'image/png',margin:2,width:456}),
    transport:{
      get:route=>request(origin,route,{token}),
      post:(route,body)=>request(origin,route,{token,method:'POST',body})
    },
    loadAccounts:()=>readJson(accountsPath,[]),
    saveAccounts:accounts=>secureWrite(accountsPath,accounts),
    log,
    maxActive:Number(process.env.NUVEXA_MAX_ACTIVE||3)
  });
  log('账号会话目录：'+authPath);
  log('保持此窗口运行；打开 Nuvexa 后台逐个点击「扫码登录」即可。');
  log('启动后只恢复此前已授权的本地账号，未授权账号不会虚报在线。');
  await runtime.start();
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;log('安全停止中...');await runtime.stop();process.exit(0)};
  process.once('SIGINT',()=>{void stop()});process.once('SIGTERM',()=>{void stop()});
}
main().catch(e=>{console.error('启动失败：'+String(e?.message||e));process.exitCode=1});
