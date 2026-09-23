import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const exec = promisify(execFile);
const apps = new Set(['com.whatsapp', 'com.whatsapp.w4b']);

export function processMatches(row, instance, sdkRoot) {
  if (!row.ExecutablePath) return false;
  const executable = path.win32.resolve(row.ExecutablePath).toLowerCase();
  const root = path.win32.resolve(sdkRoot).toLowerCase() + '\\';
  if (!executable.startsWith(root) || !/^(emulator|qemu-system-x86_64|qemu-system-aarch64)\.exe$/i.test(path.win32.basename(executable))) return false;
  const cmd = String(row.CommandLine || '');
  const avd = cmd.match(/(?:^|\s)-avd\s+(?:"([^"]+)"|(\S+))/)?.slice(1).find(Boolean) || cmd.match(/(?:^|\s)@([A-Za-z0-9_.-]+)(?=\s|$)/)?.[1];
  const port = cmd.match(/(?:^|\s)-port\s+"?(\d+)"?(?=\s|$)/)?.[1];
  return avd === instance.avdName && Number(port) === instance.port;
}
export function pngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.toString('ascii',12,16) !== 'IHDR') throw new Error('截图不是有效 PNG');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > 16000 || height > 16000) throw new Error('截图尺寸无效');
  return { width, height };
}
export class Android {
  constructor(config, base) { this.config = config; this.base = base; this.adbPath = path.join(config.sdkRoot, 'platform-tools', 'adb.exe'); this.emulator = path.join(config.sdkRoot, 'emulator', 'emulator.exe'); }
  async run(file, args, options = {}) {
    try { return (await exec(file, args, { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...options })).stdout; }
    catch (e) { if (e.name === 'AbortError') throw e; throw new Error(e.killed ? '命令超时，请检查模拟器和 ADB 状态。' : String(e.stderr || e.message).trim().slice(0, 300)); }
  }
  adb(args, options) { return this.run(this.adbPath, args, options); }
  async diagnostics() {
    await access(this.adbPath); await access(this.emulator);
    const avds = String(await this.run(this.emulator, ['-list-avds'])).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let acceleration;
    try { acceleration = String(await this.run(this.emulator, ['-accel-check'])).trim(); } catch (e) { acceleration = e.message; }
    return { avds, acceleration, sdkRoot: this.config.sdkRoot };
  }
  async scrcpyLauncher() {
    const packages=path.join(process.env.LOCALAPPDATA||'', 'Microsoft','WinGet','Packages');
    try {
      const roots=await readdir(packages,{withFileTypes:true});
      for(const root of roots.filter(x=>x.isDirectory()&&x.name.startsWith('Genymobile.scrcpy_'))){
        const parent=path.join(packages,root.name),children=await readdir(parent,{withFileTypes:true});
        for(const child of children.filter(x=>x.isDirectory()&&x.name.startsWith('scrcpy-win'))){
          const file=path.join(parent,child.name,'scrcpy.exe');
          try{await access(file);return file}catch{}
        }
      }
    } catch {}
    return '';
  }
  async mirror(instance, signal) {
    const serial=await this.verified(instance,signal),launcher=await this.scrcpyLauncher();
    if(!launcher)throw new Error('未找到 scrcpy。仍可使用网页内“画面”操作手机。');
    const x=80+((instance.port-5554)/2%3)*440,title=`CloudPhone ${instance.avdName}`;
    // One mirror per device. Repeated clicks must not stack video encoders and make input lag worse.
    const marker=title;
    try {
      const script=`@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'scrcpy.exe' -and $_.CommandLine -like '*${marker.replaceAll("'","''")}*' }).Count`;
      if(Number(String(await this.run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script])).trim())>0)return {opened:true,existing:true};
    } catch {}
    const args=['-s',serial,'--window-title',title,'--no-audio','--stay-awake','--max-size','720','--max-fps','30','--video-bit-rate','4M','--video-buffer','0','--window-x',String(x),'--window-y','80','--window-width','360'];
    const child=spawn(launcher,args,{cwd:path.dirname(launcher),detached:true,windowsHide:false,stdio:'ignore'});
    child.unref();
    await delay(1200,undefined,{signal});
    if(child.exitCode!==null)throw new Error('镜像程序启动失败，请运行环境检查。');
    return {opened:true};
  }
  async tune(instance, signal) {
    const serial=await this.verified(instance,signal);
    // Reduce the guest workload as well as the mirrored stream. This persists for this AVD.
    for(const args of [
      ['shell','wm','size','720x1560'],
      ['shell','wm','density','280'],
      ['shell','settings','put','global','window_animation_scale','0'],
      ['shell','settings','put','global','transition_animation_scale','0'],
      ['shell','settings','put','global','animator_duration_scale','0'],
      ['shell','settings','put','system','screen_off_timeout','2147483647'],
      ['shell','input','keyevent','KEYCODE_WAKEUP']
    ]) await this.adb(['-s',serial,...args],{signal});
    const start=Date.now();
    await this.adb(['-s',serial,'shell','input','keyevent','KEYCODE_HOME'],{signal});
    return {responsive:true,latencyMs:Date.now()-start};
  }
  async processes() {
    const script = "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^(emulator|qemu-system-x86_64|qemu-system-aarch64)\\.exe$' } | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress";
    const raw = String(await this.run('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script]));
    if (!raw.trim()) return [];
    const rows = JSON.parse(raw); return Array.isArray(rows) ? rows : [rows];
  }
  async inventory(signal) {
    const raw = String(await this.adb(['devices'], { signal }));
    const rows = new Map();
    for (const line of raw.split(/\r?\n/)) { const m = line.match(/^(emulator-\d+)\s+(\S+)/); if (m) rows.set(m[1], { serial:m[1], adbState:m[2] }); }
    await Promise.all([...rows.values()].filter(r => r.adbState === 'device').map(async r => {
      try { r.avdName = String(await this.adb(['-s',r.serial,'emu','avd','name'], { signal })).split(/\r?\n/).map(s=>s.trim()).find(s=>s && s!=='OK'); }
      catch(e) { r.error=e.message; }
    }));
    return rows;
  }
  async status(instance, inventory, processes) {
    const serial = `emulator-${instance.port}`;
    const occupant = inventory.get(serial), actual = [...inventory.values()].find(r => r.avdName === instance.avdName);
    const processPresent = processes.some(p=>processMatches(p,instance,this.config.sdkRoot));
    let status='stopped', lastError='';
    if (actual && actual.serial !== serial) { status='error'; lastError=`此 AVD 正在 ${actual.serial} 运行，登记端口为 ${instance.port}；请先关闭外部启动的窗口。`; }
    else if (occupant?.adbState === 'device') {
      if (occupant.avdName !== instance.avdName) { status='error'; lastError='端口被其他 AVD 占用或身份无法核验，禁止控制。'; }
      else { try { status=String(await this.adb(['-s',serial,'shell','getprop','sys.boot_completed'])).trim()==='1'?'running':'starting'; } catch(e) {status='error'; lastError=e.message;} }
    } else if (occupant && processPresent) { status='starting'; lastError=`ADB 状态暂为 ${occupant.adbState}，Android 仍在启动。`; }
    else if (occupant) { status='error'; lastError=`端口存在 ADB ${occupant.adbState} 连接，但无法核验对应模拟器进程。`; }
    else if (processPresent) { status='starting'; lastError='模拟器进程已启动，等待 ADB。'; }
    return {...instance,serial,processPresent,status,lastError};
  }
  async list(instances) {
    const [inventory,processes] = await Promise.all([this.inventory(), this.processes()]);
    return Promise.all(instances.map(i=>this.status(i,inventory,processes)));
  }
  async verified(instance, signal) {
    const serial=`emulator-${instance.port}`;
    const state=String(await this.adb(['-s',serial,'get-state'],{signal})).trim();
    if (state!=='device') throw new Error('设备未连接');
    const name=String(await this.adb(['-s',serial,'emu','avd','name'],{signal})).split(/\r?\n/).map(s=>s.trim()).find(s=>s && s!=='OK');
    if (name!==instance.avdName) throw new Error('设备身份不匹配，拒绝操作。');
    return serial;
  }
  async start(instance, signal) {
    const [inventory,processes]=await Promise.all([this.inventory(signal),this.processes()]);
    const state=await this.status(instance,inventory,processes);
    if(state.status==='error') throw new Error(state.lastError);
    if(state.status==='running') return this.mirror(instance,signal);
    if(!state.processPresent) {
      const launch={emulator:this.emulator,avdName:instance.avdName,port:instance.port,out:path.join(this.base,`emulator-${instance.port}.log`),err:path.join(this.base,`emulator-${instance.port}.err.log`)};
      const payload=Buffer.from(JSON.stringify(launch),'utf8').toString('base64');
      const script=`$ErrorActionPreference='Stop';$c=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;$arguments=@('-avd',[string]$c.avdName,'-port',[string]$c.port,'-no-window','-gpu','host','-accel','on','-memory','2048','-cores','4','-camera-back','none','-camera-front','none','-crash-report-mode','disabled','-no-audio','-no-snapshot-load','-no-snapshot-save','-no-boot-anim');Start-Process -FilePath ([string]$c.emulator) -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput ([string]$c.out) -RedirectStandardError ([string]$c.err)`;
      const encoded=Buffer.from(script,'utf16le').toString('base64');
      await this.run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded]);
    }
    await this.waitBoot(instance,signal);
    await this.tune(instance,signal);
    try{return await this.mirror(instance,signal)}catch(e){return {opened:false,warning:e.message}}
  }
  async waitBoot(instance, signal) {
    const deadline=Date.now()+240000; let last='';
    while(Date.now()<deadline) {
      signal?.throwIfAborted();
      try {
        const serial=await this.verified(instance,signal);
        if(String(await this.adb(['-s',serial,'shell','getprop','sys.boot_completed'],{signal})).trim()==='1') return;
      } catch(e) { if(signal?.aborted) throw e; last=e.message; }
      await delay(2000,undefined,{signal});
    }
    throw new Error(`开机超过四分钟，查看 emulator-${instance.port}.log。${last}`);
  }
  async stop(instance, signal) {
    const rows=await this.inventory(signal);
    if(!rows.has(`emulator-${instance.port}`) && !(await this.processes()).some(p=>processMatches(p,instance,this.config.sdkRoot))) return;
    const serial=await this.verified(instance,signal);
    await this.adb(['-s',serial,'emu','kill'],{signal});
    for(let i=0;i<10;i++){ if(!(await this.inventory(signal)).has(serial) && !(await this.processes()).some(p=>processMatches(p,instance,this.config.sdkRoot))) return; await delay(1000,undefined,{signal}); }
    throw new Error('停止命令已发送，但设备尚未退出，请刷新检查。');
  }
  async reboot(instance, signal) {
    const serial=await this.verified(instance,signal);
    await this.adb(['-s',serial,'reboot'],{signal});
    // Do not accept the old boot_completed flag before Android has actually restarted.
    const deadline=Date.now()+30000; let restarting=false;
    while(Date.now()<deadline) {
      try { restarting=String(await this.adb(['-s',serial,'shell','getprop','sys.boot_completed'],{signal})).trim()!=='1'; } catch(e) { if(signal?.aborted) throw e; restarting=true; }
      if(restarting) break; await delay(500,undefined,{signal});
    }
    if(!restarting) throw new Error('未观察到设备重启，请刷新状态后重试。');
    await this.waitBoot(instance,signal);
    await this.tune(instance,signal);
    try{return await this.mirror(instance,signal)}catch(e){return {opened:false,warning:e.message}}
  }
  async recover(instance) {
    const rows=(await this.processes()).filter(p=>processMatches(p,instance,this.config.sdkRoot));
    if(!rows.length) throw new Error('无法准确核验模拟器进程，未强制结束任何进程。请手工关闭对应模拟器窗口。');
    // Recheck identity in PowerShell immediately before terminating the selected PID.
    const payload=Buffer.from(JSON.stringify({ids:rows.map(r=>r.ProcessId),name:instance.avdName,port:instance.port,root:this.config.sdkRoot})).toString('base64');
    const script=`$ErrorActionPreference='Stop'; $c=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json; foreach($id in $c.ids){$p=Get-CimInstance Win32_Process -Filter "ProcessId=$id"; if(!$p){continue}; $cmd=[string]$p.CommandLine; $m=[regex]::Match($cmd,'(?:^|\\s)-avd\\s+(?:"([^"]+)"|(\\S+))'); $n=if($m.Groups[1].Success){$m.Groups[1].Value}else{$m.Groups[2].Value}; if(!$n){$n=[regex]::Match($cmd,'(?:^|\\s)@([A-Za-z0-9_.-]+)(?=\\s|$)').Groups[1].Value}; $port=[regex]::Match($cmd,'(?:^|\\s)-port\\s+"?(\\d+)"?(?=\\s|$)').Groups[1].Value; if($n -cne $c.name -or [int]$port -ne [int]$c.port -or !([string]$p.ExecutablePath).StartsWith(([string]$c.root).TrimEnd('\\')+'\\',[StringComparison]::OrdinalIgnoreCase)){throw 'Process identity changed; recovery refused'}; Stop-Process -Id $id -Force -ErrorAction Stop}`;
    await this.run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script]);
  }
  async frame(instance) {
    const serial=await this.verified(instance);
    const buffer=await this.adb(['-s',serial,'exec-out','screencap','-p'],{encoding:'buffer',maxBuffer:24*1024*1024});
    return {...pngDimensions(buffer),image:`data:image/png;base64,${buffer.toString('base64')}`};
  }
  async screen(instance, action, body) {
    const serial=await this.verified(instance);
    let args;
    if(action==='key'){ const code={HOME:3,BACK:4,RECENTS:187,ENTER:66}[body.key]; if(!code)throw new Error('无效按键'); args=['keyevent',String(code)]; }
    else if(action==='text'){ if(typeof body.text!=='string'||!body.text||body.text.length>160||!/^[A-Za-z0-9@._+ -]+$/.test(body.text))throw new Error('输入仅支持英文、数字、空格和 @ . _ + -'); args=['text',body.text.replaceAll(' ','%s')]; }
    else { const frame=await this.frame(instance); const point=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<frame.width&&y<frame.height;
      if(action==='tap'&&point(body.x,body.y))args=['tap',String(body.x),String(body.y)];
      else if(action==='swipe'&&point(body.x,body.y)&&point(body.x2,body.y2))args=['swipe',String(body.x),String(body.y),String(body.x2),String(body.y2),'350'];
      else throw new Error('无效的屏幕坐标');
    }
    await this.adb(['-s',serial,'shell','input',...args]);
  }
  async accounts(instance) {
    const serial=await this.verified(instance);
    const text=String(await this.adb(['-s',serial,'shell','pm','list','users']));
    const rows=[];
    for(const match of text.matchAll(/UserInfo\{(\d+):([^:}]+):/g)) {
      const userId=Number(match[1]);
      const packages=String(await this.adb(['-s',serial,'shell','pm','list','packages','--user',String(userId)])).split(/\r?\n/).map(s=>s.trim().replace(/^package:/,''));
      for(const pkg of apps) if(packages.includes(pkg)) rows.push({androidUserId:userId,userName:match[2],packageName:pkg,appType:pkg==='com.whatsapp'?'WhatsApp':'WhatsApp Business',suffix:'',verificationStatus:'unreadable',verifiedAt:new Date().toISOString()});
    }
    const dump=String(await this.adb(['-s',serial,'shell','dumpsys','account'])); let user=-1;
    for(const line of dump.split(/\r?\n/)) {
      const u=line.match(/User UserInfo\{(\d+):/); if(u){user=Number(u[1]);continue;}
      const a=line.match(/Account \{name=([^,]+), type=(com\.whatsapp(?:\.w4b)?)\}/); if(!a)continue;
      const digits=a[1].replace(/\D/g,'');const row=rows.find(r=>r.androidUserId===user&&r.packageName===a[2]);
      if(row&&digits.length>=7){row.suffix=digits.slice(-4);row.verificationStatus='readable';}
    }
    return rows;
  }
  async openApp(instance, body) {
    if(!Number.isInteger(body.userId)||body.userId<0||!apps.has(body.packageName))throw new Error('请选择有效的 Android 用户与应用');
    const serial=await this.verified(instance);
    const packages=String(await this.adb(['-s',serial,'shell','pm','list','packages','--user',String(body.userId)])).split(/\r?\n/).map(s=>s.trim());
    if(!packages.includes(`package:${body.packageName}`))throw new Error('该 Android 用户未安装所选应用');
    await this.adb(['-s',serial,'shell','am','switch-user',String(body.userId)]);
    let switched=false;
    for(let i=0;i<10;i++){if(String(await this.adb(['-s',serial,'shell','am','get-current-user'])).trim()===String(body.userId)){switched=true;break;}await delay(500);}
    if(!switched)throw new Error('Android 用户切换未完成');
    const output=String(await this.adb(['-s',serial,'shell','monkey','-p',body.packageName,'-c','android.intent.category.LAUNCHER','1']));
    if(/No activities found|monkey aborted|Error|Exception/i.test(output))throw new Error('应用启动失败，请检查设备画面');
  }
}
