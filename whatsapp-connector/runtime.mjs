import {planSeatMoves} from './seat-controller.mjs';
const RECONNECT_MIN_MS=15000,RECONNECT_MAX_MS=120000;
export function validAccountId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)}
export function phoneSuffix(info){
  const number=String(info?.wid?.user||info?.me?.user||'').replace(/\D/g,'');
  return number.slice(-4);
}
export class WhatsAppSessionRuntime{
  constructor({createClient,toPngDataUrl,transport,loadAccounts,saveAccounts,log=()=>{},maxActive=3,seatMode=false,clock=()=>Date.now()}){
    this.createClient=createClient;this.toPngDataUrl=toPngDataUrl;this.transport=transport;
    this.loadAccounts=loadAccounts;this.saveAccounts=saveAccounts;this.log=log;
    this.seatMode=seatMode===true;
    this.maxActive=Math.min(Math.max(Number(maxActive)||3,1),this.seatMode?7:20);
    this.clock=clock;this.sessions=new Map();this.knownAccounts=new Set();
    this.closed=false;this.requestsBusy=false;this.healthBusy=false;
    this.timer=null;this.healthTimer=null;this.reconnectFailures=new Map();
    this.sleeping=new Set();this.seatBusy=false;this.lastSeatPlanError='';
  }
  async start(){
    const ids=await this.loadAccounts();
    this.knownAccounts=new Set((Array.isArray(ids)?ids:[]).filter(validAccountId));
    this.log('已保存本机会话：'+this.knownAccounts.size+' 个；并发上限 '+this.maxActive);
    // In rolling mode do NOT automatically boot the first seven remembered
    // accounts. Await the authenticated server's explicit seat plan instead.
    if(this.seatMode)for(const id of this.knownAccounts)this.sleeping.add(id);
    if(!this.seatMode)for(const id of this.knownAccounts){
      if(this.sessions.size>=this.maxActive)break;
      await this.openSession(id);
    }
    await this.pollRequests();
    await this.heartbeat();
    this.timer=setInterval(()=>{void this.pollRequests().catch(e=>this.log('轮询异常 '+e.message))},4000);
    this.healthTimer=setInterval(()=>{void this.heartbeat().catch(e=>this.log('心跳异常 '+e.message))},20000);
  }
  snapshot(){
    const list=[];
    for(const id of this.knownAccounts){
      const s=this.sessions.get(id);
      list.push({
        accountId:id,
        status:s?.status||(this.sleeping.has(id)?'SLEEPING':'OFFLINE'),
        ...(s?.phoneLast4?{phoneLast4:s.phoneLast4}:{}),
        ...(s?.status==='ONLINE'?{sessionId:'local:'+id}:{})
      });
    }
    return list;
  }
  async openSession(id){
    if(this.closed||!validAccountId(id))return false;
    const current=this.sessions.get(id);
    if(current?.client)return true;
    if(this.sessions.size>=this.maxActive){this.log('已达到并发上限，暂缓启动 '+id);return false}
    const record={id,client:null,status:'OFFLINE',phoneLast4:current?.phoneLast4||'',
      lastQr:'',qrAt:0,pending:false,restartAfter:0,initializing:true,startedAt:this.clock(),releasing:false};
    this.sessions.set(id,record);this.sleeping.delete(id);
    let client;
    try{client=await this.createClient(id)}catch(e){
      record.status='OFFLINE';this.sessions.delete(id);
      this.log('创建会话失败 '+id+' '+String(e?.message||e));
      return false;
    }
    record.client=client;
    const live=()=>!this.closed&&!record.releasing&&this.sessions.get(id)===record;
    client.on('qr',qr=>{
      if(!live())return;
      record.status='NEEDS_QR';record.lastQr=qr;record.qrAt=this.clock();
      // QR is intentionally NOT written to disk or console.
      if(record.pending)void this.publishQr(record);
      this.log('已从 WhatsApp 收到真实扫码挑战：'+id);
    });
    client.on('authenticated',()=>{if(!live())return;record.status='VERIFYING';record.lastQr='';});
    client.on('ready',()=>{
      if(!live())return;
      record.initializing=false;
      this.reconnectFailures.delete(id);
      record.status='ONLINE';record.phoneLast4=phoneSuffix(client.info);
      record.lastQr='';record.pending=false;record.restartAfter=0;
      this.log('已就绪：'+id+' 尾号 '+(record.phoneLast4||'未知'));
      void this.heartbeat();
    });
    client.on('auth_failure',()=>{
      if(!live())return;
      record.status='NEEDS_QR';record.lastQr='';record.initializing=false;
      this.log('授权需要重新验证：'+id);
    });
    client.on('disconnected',reason=>{
      if(!live()||record.client!==client)return;
      const loggedOut=String(reason||'').toUpperCase().includes('LOGOUT');
      record.status=loggedOut?'NEEDS_QR':'OFFLINE';
      record.lastQr='';record.client=null;record.pending=false;record.initializing=false;
      const fail=(this.reconnectFailures.get(id)||0)+1;
      this.reconnectFailures.set(id,fail);
      record.restartAfter=loggedOut?Infinity:this.clock()+Math.min(RECONNECT_MAX_MS,RECONNECT_MIN_MS*2**Math.min(fail-1,3));
      void client.destroy().catch(()=>{});
      this.log('连接已中断：'+id+'；'+(loggedOut?'需要重新授权':'准备自动重连'));
      void this.heartbeat();
    });
    void Promise.resolve().then(()=>client.initialize()).catch(async e=>{
      if(!live())return;
      record.status='OFFLINE';record.lastQr='';record.client=null;record.initializing=false;
      const fail=(this.reconnectFailures.get(id)||0)+1;
      this.reconnectFailures.set(id,fail);
      record.restartAfter=this.clock()+Math.min(RECONNECT_MAX_MS,RECONNECT_MIN_MS*2**Math.min(fail-1,3));
      this.log('启动或恢复失败：'+id+'；'+String(e?.message||e));
      try{await client.destroy()}catch{}
    });
    return true;
  }
  // A released seat retains LocalAuth files and the enrollment whitelist.
  // destroy() closes Chromium; logout() would revoke credentials and is forbidden.
  async releaseSession(id,{protectedIds=[]}={}){
    if(!validAccountId(id))return false;
    if(protectedIds.includes(id))return false;
    const rec=this.sessions.get(id);
    if(!rec){if(this.knownAccounts.has(id))this.sleeping.add(id);return true}
    // Incomplete initialization and pending manual QR pairing are not safe to evict.
    if(rec.pending||rec.status==='VERIFYING')return false;
    // If Chromium hangs during initial setup, never kill immediately;
    // after a bounded timeout the seat can safely be reclaimed.
    if(rec.initializing&&this.clock()-rec.startedAt<120000)return false;
    rec.releasing=true;
    try{if(rec.client)await rec.client.destroy()}catch(e){
      rec.releasing=false;
      this.log('座位释放失败 '+id+' '+String(e?.message||e));
      return false;
    }
    if(this.sessions.get(id)!==rec)return false;
    this.sessions.delete(id);this.reconnectFailures.delete(id);
    this.sleeping.add(id);
    this.log('已释放座位（保留授权会话）：'+id);
    return true;
  }
  async syncSeatPlan(plan){
    if(!this.seatMode||!plan||plan.enabled!==true)return {status:'DISABLED'};
    if(this.seatBusy)return {status:'BUSY'};
    this.seatBusy=true;
    try{
      const ids=Array.isArray(plan.desired)?plan.desired:[];
      // The connector may only resume profiles that were previously enrolled
      // on this device. A remote plan cannot silently authorize an unknown ID.
      const desired=ids.filter(id=>this.knownAccounts.has(id));
      const unpaired=ids.filter(id=>validAccountId(id)&&!this.knownAccounts.has(id));
      const protectedIds=Array.isArray(plan.protectedAccountIds)?plan.protectedAccountIds:[];
      const moves=planSeatMoves({active:[...this.sessions.keys()],desired,
        protectedIds,maxActive:this.maxActive});
      const released=[];
      for(const id of moves.release){
        if(await this.releaseSession(id,{protectedIds}))released.push(id);
      }
      const active=new Set(this.sessions.keys());
      const started=[];
      for(const id of desired){
        if(active.size>=this.maxActive)break;
        if(active.has(id))continue;
        if(await this.openSession(id)){active.add(id);started.push(id)}
      }
      return {status:unpaired.length?'NEEDS_AUTHORIZATION':'APPLIED',
        released,started,unpaired,active:[...this.sessions.keys()]};
    }finally{this.seatBusy=false}
  }
  async pollSeatPlan(){
    if(!this.seatMode||this.closed)return;
    try{
      const result=await this.transport.get('/v1/worker/seat-plan');
      if(result?.enabled===true)await this.syncSeatPlan(result);
      this.lastSeatPlanError='';
    }catch(e){
      const reason=String(e?.message||e).slice(0,120);
      if(reason!==this.lastSeatPlanError)this.log('座位计划暂不可用：'+reason);
      this.lastSeatPlanError=reason;
    }
  }
  async publishQr(record){
    if(this.closed||!record.pending||!record.lastQr)return;
    const raw=record.lastQr;const id=record.id;
    try{
      const dataUrl=await this.toPngDataUrl(raw);
      if(this.closed||record.lastQr!==raw||!record.pending)return;
      await this.transport.post('/v1/worker/accounts/qr',{accountId:id,qrDataUrl:dataUrl});
      this.log('真实 WhatsApp 二维码已传输到后台：'+id);
    }catch(e){
      const status=e?.status;
      if(status===404)record.pending=false;
      else this.log('二维码暂未送达：'+id+' '+String(e.message||e));
    }
  }
  async pollRequests(){
    if(this.closed||this.requestsBusy)return;
    this.requestsBusy=true;
    try{
      const r=await this.transport.get('/v1/worker/accounts/requests');
      const items=Array.isArray(r?.items)?r.items:[];
      for(const job of items){
        const id=String(job.accountId||'');
        if(!validAccountId(id))continue;
        if(!this.knownAccounts.has(id)){
          this.knownAccounts.add(id);
          await this.saveAccounts([...this.knownAccounts]);
        }
        let record=this.sessions.get(id);
        if(!record){
          const opened=await this.openSession(id);
          if(!opened)continue;
          record=this.sessions.get(id);
        }
        record.pending=true;
        if(record.lastQr)await this.publishQr(record);
        if(!record.client&&(record.restartAfter===Infinity||this.clock()>=record.restartAfter)){
          // A fresh operator QR request explicitly re-opens a logged-out session.
          this.sessions.delete(id);await this.openSession(id);
        }
      }
      // Backend controls the rolling roster; legacy mode retains old behavior.
      if(this.seatMode)await this.pollSeatPlan();
      // Ordinary disconnection of an existing session causes a reconnect attempt,
      // but explicit LOGOUT waits for the operator to request pairing again.
      for(const [id,rec] of this.sessions){
        if(!rec.client&&rec.restartAfter!==Infinity&&rec.restartAfter<=this.clock()){
          this.sessions.delete(id);await this.openSession(id);
        }
      }
    }finally{this.requestsBusy=false}
  }
  async detachUnhealthy(record,reason){
    if(this.closed||!record.client)return;
    const client=record.client;record.client=null;
    record.status='OFFLINE';record.lastQr='';record.pending=false;
    const fail=(this.reconnectFailures.get(record.id)||0)+1;
    this.reconnectFailures.set(record.id,fail);
    record.restartAfter=this.clock()+Math.min(RECONNECT_MAX_MS,RECONNECT_MIN_MS*2**Math.min(fail-1,3));
    this.log('状态检查失败，准备恢复连接：'+record.id+' '+reason);
    try{await client.destroy()}catch{}
  }
  async heartbeat(){
    if(this.closed||this.healthBusy)return;
    this.healthBusy=true;
    try{
      for(const rec of this.sessions.values()){
        if(rec.status!=='ONLINE'||!rec.client)continue;
        try{
          let timeout;
          const state=await Promise.race([
            Promise.resolve().then(()=>rec.client.getState()),
            new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('STATE_TIMEOUT')),8000);timeout.unref?.()})
          ]).finally(()=>clearTimeout(timeout));
          if(state!=='CONNECTED')await this.detachUnhealthy(rec,'STATE_'+String(state).slice(0,40));
        }catch(e){await this.detachUnhealthy(rec,String(e?.message||e).slice(0,40))}
      }
      const accounts=this.snapshot();
      await this.transport.post('/v1/worker/accounts/heartbeat',{
        workerId:'nuvexa-windows-local',accounts
      });
    }finally{this.healthBusy=false}
  }
  async stop(){
    this.closed=true;
    if(this.timer)clearInterval(this.timer);
    if(this.healthTimer)clearInterval(this.healthTimer);
    const all=[...this.sessions.values()];
    this.sessions.clear();
    this.reconnectFailures.clear();this.sleeping.clear();
    await Promise.allSettled(all.map(async rec=>{try{await rec.client?.destroy()}catch{}}));
  }
}
