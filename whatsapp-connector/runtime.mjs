const RECONNECT_MIN_MS=15000,RECONNECT_MAX_MS=120000;
export function validAccountId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)}
export function phoneSuffix(info){
  const number=String(info?.wid?.user||info?.me?.user||'').replace(/\D/g,'');
  return number.slice(-4);
}
export class WhatsAppSessionRuntime{
  constructor({createClient,toPngDataUrl,transport,loadAccounts,saveAccounts,log=()=>{},maxActive=3,clock=()=>Date.now()}){
    this.createClient=createClient;this.toPngDataUrl=toPngDataUrl;this.transport=transport;
    this.loadAccounts=loadAccounts;this.saveAccounts=saveAccounts;this.log=log;
    this.maxActive=Math.min(Math.max(Number(maxActive)||3,1),20);
    this.clock=clock;this.sessions=new Map();this.knownAccounts=new Set();
    this.closed=false;this.requestsBusy=false;this.healthBusy=false;
    this.timer=null;this.healthTimer=null;this.reconnectFailures=new Map();
  }
  async start(){
    const ids=await this.loadAccounts();
    this.knownAccounts=new Set((Array.isArray(ids)?ids:[]).filter(validAccountId));
    this.log('已保存本机会话：'+this.knownAccounts.size+' 个；并发上限 '+this.maxActive);
    // Restore only sessions the operator previously connected on this machine.
    for(const id of this.knownAccounts){
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
        status:s?.status||'OFFLINE',
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
      lastQr:'',qrAt:0,pending:false,restartAfter:0,initializing:true};
    this.sessions.set(id,record);
    let client;
    try{client=await this.createClient(id)}catch(e){
      record.status='OFFLINE';this.sessions.delete(id);
      this.log('创建会话失败 '+id+' '+String(e?.message||e));
      return false;
    }
    record.client=client;
    const live=()=>!this.closed&&this.sessions.get(id)===record;
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
      record.status='NEEDS_QR';record.lastQr='';
      this.log('授权需要重新验证：'+id);
    });
    client.on('disconnected',reason=>{
      if(!live()||record.client!==client)return;
      const loggedOut=String(reason||'').toUpperCase().includes('LOGOUT');
      record.status=loggedOut?'NEEDS_QR':'OFFLINE';
      record.lastQr='';record.client=null;record.pending=false;
      const fail=(this.reconnectFailures.get(id)||0)+1;
      this.reconnectFailures.set(id,fail);
      record.restartAfter=loggedOut?Infinity:this.clock()+Math.min(RECONNECT_MAX_MS,RECONNECT_MIN_MS*2**Math.min(fail-1,3));
      void client.destroy().catch(()=>{});
      this.log('连接已中断：'+id+'；'+(loggedOut?'需要重新授权':'准备自动重连'));
      void this.heartbeat();
    });
    void Promise.resolve().then(()=>client.initialize()).catch(async e=>{
      if(!live())return;
      record.status='OFFLINE';record.lastQr='';record.client=null;
      const fail=(this.reconnectFailures.get(id)||0)+1;
      this.reconnectFailures.set(id,fail);
      record.restartAfter=this.clock()+Math.min(RECONNECT_MAX_MS,RECONNECT_MIN_MS*2**Math.min(fail-1,3));
      this.log('启动或恢复失败：'+id+'；'+String(e?.message||e));
      try{await client.destroy()}catch{}
    });
    return true;
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
      // Ordinary disconnection of an existing session causes a reconnect attempt,
      // but explicit LOGOUT waits for the operator to request pairing again.
      for(const [id,rec] of this.sessions){
        if(!rec.client&&rec.restartAfter!==Infinity&&rec.restartAfter<=this.clock()){
          this.sessions.delete(id);await this.openSession(id);
        }
      }
    }finally{this.requestsBusy=false}
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
          if(state!=='CONNECTED'){rec.status='OFFLINE';this.log('连接状态异常：'+rec.id)}
        }catch{rec.status='OFFLINE'}
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
    this.reconnectFailures.clear();
    await Promise.allSettled(all.map(async rec=>{try{await rec.client?.destroy()}catch{}}));
  }
}
