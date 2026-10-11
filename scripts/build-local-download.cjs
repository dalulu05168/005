// Publish a downloadable Windows installer on the existing FREE Render static preview.
// No account secrets, login sessions, credentials, or real messages are bundled.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const output=path.resolve(__dirname,'../dist/cloud/NuvexaPro_Local_Setup.zip');
const cmd=String.raw`@echo off
setlocal
cd /d "%~dp0"
title Nuvexa Pro - Windows Local WhatsApp Service
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo [FAILED] Please check the error above. Existing WhatsApp sessions were not removed.
) else (
  echo.
  echo [DONE] Open the Nuvexa account management page and click Scan Login.
)
pause
`;
const install=String.raw`$ErrorActionPreference='Stop'
$Backend='https://nuvexa-ops-bridge.onrender.com'
$Commit='7658ccf65a16c646eb549dbe2fa444890523eef3'
$Root=Join-Path $env:LOCALAPPDATA 'NuvexaPro'
$App=Join-Path $Root 'WhatsAppConnectorApp'
$Private=Join-Path $Root 'WhatsAppConnector'
$Logs=Join-Path $Private 'logs'
$Config=Join-Path $Private 'config.json'
$ShortcutPath=Join-Path ([Environment]::GetFolderPath('Startup')) 'NuvexaPro-WhatsApp-Local.lnk'
function Step([string]$s) { Write-Host "[Nuvexa] $s" }
function Fail([string]$s) { throw $s }
function HasRunningConnector {
  try {
    foreach ($p in (Get-CimInstance Win32_Process -Filter "Name = 'node.exe'")) {
      if ($p.CommandLine -match 'connector\.mjs') {return $true}
    }
  } catch { Step 'Process check unavailable; checking sessions carefully' }
  return $false
}
function ValidToken {
  if (-not (Test-Path $Config)) {return $false}
  $c=Get-Content $Config -Raw | ConvertFrom-Json
  if ([string]$c.token -notmatch '^nw_[a-f0-9]{64}$') {return $false}
  try {
    $null=Invoke-RestMethod -Uri "$Backend/v1/worker/accounts/requests" -Headers @{'x-nuvexa-connector-token'=[string]$c.token} -TimeoutSec 20
    return $true
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {return $false}
    Fail 'Existing authorization cannot be checked. Keeping the original token and stopping.'
  }
}
try {
  if (-not $env:LOCALAPPDATA) {Fail 'Windows LOCALAPPDATA is missing.'}
  $node=Get-Command node.exe -ErrorAction SilentlyContinue
  $npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm) {Fail 'Install Node.js LTS 20+ from https://nodejs.org/ first.'}
  $ver=(& $node.Source --version).Trim()
  if ($ver -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 20) {Fail 'Node.js v20 or newer is required.'}
  New-Item -ItemType Directory -Path $Root,$App,$Private,$Logs -Force | Out-Null
  if (HasRunningConnector) {Fail 'Existing connector is running. Close it before updating; sessions are unchanged.'}
  Step 'Downloading pinned connector source files from GitHub...'
  $source="https://raw.githubusercontent.com/dalulu05168/005/$Commit/whatsapp-connector"
  foreach ($file in @('package.json','connector.mjs','runtime.mjs','seat-controller.mjs','README.md')) {
    Invoke-WebRequest -Uri "$source/$file" -OutFile (Join-Path $App $file) -UseBasicParsing -TimeoutSec 60
  }
  $p=Get-Content (Join-Path $App 'package.json') -Raw | ConvertFrom-Json
  if ($p.name -ne 'nuvexa-whatsapp-local-connector') {Fail 'Downloaded source verification failed.'}
  Step 'Installing Node.js dependencies and Chromium (first run can take time)...'
  Push-Location $App
  try {
    & $npm.Source install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {Fail "npm install failed: $LASTEXITCODE"}
  } finally {Pop-Location}
  if (-not (ValidToken)) {
    Step 'One-time authorization required for a new PC or expired device token.'
    Step "Open $Backend/admin#accounts"
    Step 'In the current admin UI choose Connect Windows QR connector, or open Local Service Maintenance in the updated UI.'
    $code=(Read-Host 'Enter one-time 24-character pairing code').Trim().Replace('-','').Replace(' ','').ToUpperInvariant()
    if ($code -notmatch '^[A-F0-9]{24}$') {Fail 'Invalid pairing code. Nothing was changed.'}
    $json=@{code=$code} | ConvertTo-Json -Compress
    $response=Invoke-RestMethod -Method Post -Uri "$Backend/v1/worker/enrollment/claim" -Body $json -ContentType 'application/json' -TimeoutSec 30
    if ([string]$response.token -notmatch '^nw_[a-f0-9]{64}$') {Fail 'Server did not return a valid device credential.'}
    $data=@{origin=$Backend;token=[string]$response.token;pairingCreatedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Depth 4
    $tmp="$Config.tmp"
    [IO.File]::WriteAllText($tmp,$data,(New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $Config -Force
    Step 'One-time device authorization completed. Do not share local config or session files.'
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'service.ps1') -Destination (Join-Path $App 'service.ps1') -Force
  $sh=New-Object -ComObject WScript.Shell
  $sc=$sh.CreateShortcut($ShortcutPath)
  $sc.TargetPath=(Join-Path $PSHOME 'powershell.exe')
  $sc.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $App 'service.ps1')+'"'
  $sc.WorkingDirectory=$App
  $sc.WindowStyle=7
  $sc.Description='Nuvexa Pro local WhatsApp Web connector'
  $sc.Save()
  Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+(Join-Path $App 'service.ps1')+'"')) -WindowStyle Hidden
  Start-Sleep -Seconds 4
  if (-not (HasRunningConnector)) {Fail "Background connector did not start. Check $Logs\service.log"}
  Step 'Background service running. On each future Windows sign-in it starts automatically.'
  Step "Account management: $Backend/admin#accounts"
  Step 'Click Scan Login on one authorized account; use WhatsApp linked devices on your phone.'
  exit 0
} catch {
  Write-Host "[FAILED] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
`;
const service=String.raw`$ErrorActionPreference='Stop'
$Root=Join-Path $env:LOCALAPPDATA 'NuvexaPro'
$App=Join-Path $Root 'WhatsAppConnectorApp'
$Logs=Join-Path (Join-Path $Root 'WhatsAppConnector') 'logs'
$Config=Join-Path (Join-Path $Root 'WhatsAppConnector') 'config.json'
New-Item -ItemType Directory -Path $Logs -Force | Out-Null
$Log=Join-Path $Logs 'service.log'
$Mutex=New-Object System.Threading.Mutex($false,'Local\NuvexaPro_WhatsAppConnector_Service')
$Held=$false
try {
 $Held=$Mutex.WaitOne(0)
 if (-not $Held) {exit 0}
 if (-not (Test-Path $Config)) {Add-Content $Log "$(Get-Date -Format o) No device pairing; not starting.";exit 2}
 $node=Get-Command node.exe -ErrorAction SilentlyContinue
 if (-not $node) {Add-Content $Log "$(Get-Date -Format o) node.exe unavailable.";exit 3}
 while ($true) {
  Add-Content $Log "$(Get-Date -Format o) Connector starting."
  Push-Location $App
  try {& $node.Source (Join-Path $App 'connector.mjs') *>> $Log}
  catch {Add-Content $Log "$(Get-Date -Format o) $($_.Exception.Message)"}
  finally {Pop-Location}
  Start-Sleep -Seconds 30
 }
} finally {
 if ($Held) {$Mutex.ReleaseMutex()}
 $Mutex.Dispose()
}
`;
const status=String.raw`@echo off
setlocal
title Nuvexa Pro Local Service Status
echo Local WhatsApp session directory:
echo %LOCALAPPDATA%\NuvexaPro\WhatsAppConnector\sessions
echo.
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name = ''node.exe''' | Where-Object { $_.CommandLine -match 'connector\.mjs' } | Select-Object ProcessId,CommandLine | Format-Table -Wrap"
echo.
echo Recent logs:
powershell.exe -NoProfile -Command "$log=Join-Path $env:LOCALAPPDATA 'NuvexaPro\WhatsAppConnector\logs\service.log';if(Test-Path $log){Get-Content $log -Tail 30}else{Write-Host 'No log available'}"
pause
`;
const guide=String.raw`NUVEXA PRO LOCAL WHATSAPP LOGIN / WINDOWS 10 OR 11

1. Install official Node.js LTS 20+ from https://nodejs.org/ if absent.
2. Extract ALL files from this ZIP. Double-click Install-Nuvexa.cmd.
3. One-time secure device pairing is required only if this Windows user has no
   valid prior connector authorization. Get the pairing code from Nuvexa admin.
   Never send the pairing code, password or session folder to ChatGPT.
4. The local worker launches hidden at Windows sign-in. Daily use: open
   https://nuvexa-ops-bridge.onrender.com/admin#accounts
   and click Scan Login for an authorized test account.
5. Do not delete:
   %LOCALAPPDATA%\NuvexaPro\WhatsAppConnector\sessions
   This stores per-account WhatsApp Web LocalAuth profiles.
6. Check-Status.cmd prints diagnostics. Closing the PC or signing out takes the
   service offline; sessions remain saved for later recovery.
7. This package enables actual QR, session persistence and heartbeat only. It
   does not include a real WhatsApp message sending worker.

This uses unofficial whatsapp-web.js, not Meta's official API.
No paid cloud resources and no secrets bundled in this ZIP.
`;
const files=[
 ['Install-Nuvexa.cmd',cmd],
 ['install.ps1',install],
 ['service.ps1',service],
 ['Check-Status.cmd',status],
 ['README.txt',guide]
];
function crc32(buf){
 let c=0xffffffff;
 for(const b of buf){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xEDB88320:(c>>>1)}
 return (c^0xffffffff)>>>0;
}
const chunks=[],center=[];
let offset=0;
for(const [name,data] of files){
 const fn=Buffer.from(name,'utf8'),body=Buffer.from(data,'utf8'),crc=crc32(body);
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);
 local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);
 local.writeUInt32LE(body.length,22);local.writeUInt16LE(fn.length,26);
 chunks.push(local,fn,body);
 const cent=Buffer.alloc(46);
 cent.writeUInt32LE(0x02014b50,0);cent.writeUInt16LE(20,4);
 cent.writeUInt16LE(20,6);cent.writeUInt16LE(0x0800,8);
 cent.writeUInt32LE(crc,16);cent.writeUInt32LE(body.length,20);
 cent.writeUInt32LE(body.length,24);cent.writeUInt16LE(fn.length,28);
 cent.writeUInt32LE(offset,42);center.push(cent,fn);
 offset+=local.length+fn.length+body.length;
}
const cd=Buffer.concat(center),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);
end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);
end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...chunks,cd,end]);
fs.writeFileSync(output,zip);
console.log('Windows installer published',path.basename(output),zip.length,crypto.createHash('sha256').update(zip).digest('hex'));
