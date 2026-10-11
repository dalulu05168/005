// Publish a downloadable Windows installer on the existing FREE Render static preview.
// No account secrets, login sessions, credentials, or real messages are bundled.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const output=path.resolve(__dirname,'../dist/cloud/NuvexaPro_Local_Setup_NoC.zip');
const cmd=String.raw`@echo off
setlocal
cd /d "%~dp0"
title Nuvexa Pro - No C Drive Local Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
 echo.
 echo [FAILED] No installation should have been downloaded onto drive C:
 echo Check the error message. Existing WhatsApp sessions are not deleted.
) else (
 echo.
 echo [DONE] Local worker installation finished.
)
pause
`;
const install=String.raw`$ErrorActionPreference='Stop'
$Backend='https://nuvexa-ops-bridge.onrender.com'
$Commit='7658ccf65a16c646eb549dbe2fa444890523eef3'
$RunKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
function Step([string]$s){Write-Host "[Nuvexa] $s"}
function Fail([string]$s){throw $s}
function PickNonCPath {
  $letters=@()
  try {
    $letters=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Where-Object { $_.DeviceID -notmatch '^C:' } | ForEach-Object {$_.DeviceID.Substring(0,1).ToUpperInvariant()})
  }catch {
    $letters=@(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' } | ForEach-Object {$_.Name.ToUpperInvariant()})
  }
  if(-not $letters.Count){Fail 'No available non-C drive found. Attach/enable drive D: or E: before installing.'}
  $pref=if($letters -contains 'D'){'D'}else{$letters[0]}
  $default=$pref+':\NuvexaPro'
  Step ('Available non-C drives: '+($letters -join ', '))
  $choice=Read-Host "Install ROOT path (must not be C:) [default $default]"
  $folder=if([string]::IsNullOrWhiteSpace($choice)){$default}else{$choice.Trim().Trim('"')}
  if($folder -notmatch '^[A-Za-z]:\\'){Fail 'Only absolute paths on a non-C local drive are supported.'}
  $full=[IO.Path]::GetFullPath($folder).TrimEnd('\')
  $letter=$full.Substring(0,1).ToUpperInvariant()
  if($letter -eq 'C'){Fail 'Drive C: is forbidden. Choose D:, E:, F: or another drive.'}
  if(-not (Test-Path ($letter+':\'))){Fail ('Drive '+$letter+': is unavailable.')}
  if($full.Length -lt 5){Fail 'Choose a directory, not the disk root.'}
  return $full
}
function ConfigureNonCEnvironment([string]$root){
  $env:LOCALAPPDATA=Join-Path $root 'Runtime'
  $env:TEMP=Join-Path $root 'Temp'
  $env:TMP=$env:TEMP
  $env:XDG_CACHE_HOME=Join-Path $root 'Cache'
  $env:PUPPETEER_CACHE_DIR=Join-Path $root 'Cache\Puppeteer'
  $env:npm_config_cache=Join-Path $root 'Cache\npm'
  foreach($p in @($env:LOCALAPPDATA,$env:TEMP,$env:TMP,$env:XDG_CACHE_HOME,$env:PUPPETEER_CACHE_DIR,$env:npm_config_cache)){
    New-Item -ItemType Directory -Path $p -Force | Out-Null
  }
}
function FindOrDownloadNode([string]$root){
  $existing=Get-Command node.exe -ErrorAction SilentlyContinue
  $npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
  if($existing -and $npm) {
    $ver=(& $existing.Source --version).Trim()
    if($ver -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20){
      Step ('Using existing Node.js '+$ver+' (no new download to drive C:)')
      return @($existing.Source,$npm.Source)
    }
  }
  $version='22.16.0'
  $arch=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'arm64'}elseif([Environment]::Is64BitOperatingSystem){'x64'}else{Fail '64-bit Windows is required.'}
  $filename="node-v$version-win-$arch.zip"
  $nodeDir=Join-Path $root 'Node'
  $exe=Join-Path $nodeDir 'node.exe'
  $npmCmd=Join-Path $nodeDir 'npm.cmd'
  if((Test-Path $exe) -and (Test-Path $npmCmd)) {
    $env:PATH=$nodeDir+';'+$env:PATH
    return @($exe,$npmCmd)
  }
  Step 'Downloading official portable Node.js to selected non-C drive...'
  $base="https://nodejs.org/dist/v$version"
  $checks=(Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 50).Content
  $match=[regex]::Match([string]$checks,'(?im)^([a-f0-9]{64})\s+'+[regex]::Escape($filename)+'\s*$')
  if(-not $match.Success){Fail 'Official Node.js checksum was not found; download aborted.'}
  $zip=Join-Path $env:TEMP $filename
  $unpack=Join-Path $env:TEMP 'node-portable-unpack'
  Invoke-WebRequest -Uri "$base/$filename" -UseBasicParsing -OutFile $zip -TimeoutSec 180
  $actual=(Get-FileHash -Path $zip -Algorithm SHA256).Hash
  if($actual -ine $match.Groups[1].Value){Fail 'Official Node.js checksum mismatch. Refusing to install.'}
  Expand-Archive -LiteralPath $zip -DestinationPath $unpack -Force
  $inner=Join-Path $unpack ("node-v$version-win-$arch")
  if(-not (Test-Path (Join-Path $inner 'npm.cmd'))){Fail 'Portable Node.js extraction failed.'}
  Move-Item -Path $inner -Destination $nodeDir
  Remove-Item -LiteralPath $zip -Force
  Remove-Item -LiteralPath $unpack -Recurse -Force
  $env:PATH=$nodeDir+';'+$env:PATH
  return @($exe,$npmCmd)
}
function HasRunningConnector {
 try {
  foreach($p in (Get-CimInstance Win32_Process -Filter "Name = 'node.exe'")){
   if($p.CommandLine -match 'connector\.mjs'){return $true}
  }
 }catch{Fail 'Cannot verify existing running connector. Cancelled for safety.'}
 return $false
}
function ValidToken([string]$config){
 if(-not(Test-Path $config)){return $false}
 $c=Get-Content $config -Raw | ConvertFrom-Json
 if([string]$c.token -notmatch '^nw_[a-f0-9]{64}$'){return $false}
 try {
   $null=Invoke-RestMethod -Uri "$Backend/v1/worker/accounts/requests" -Headers @{'x-nuvexa-connector-token'=[string]$c.token} -TimeoutSec 20
   return $true
 }catch {
   if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401){return $false}
   Fail 'Cannot verify existing token; original device credentials were left unchanged.'
 }
}
try {
 $Root=PickNonCPath
 $App=Join-Path $Root 'App'
 ConfigureNonCEnvironment $Root
 $Private=Join-Path $env:LOCALAPPDATA 'NuvexaPro\WhatsAppConnector'
 $Config=Join-Path $Private 'config.json'
 $Logs=Join-Path $Private 'logs'
 New-Item -ItemType Directory -Path $App,$Private,$Logs -Force | Out-Null
 if(HasRunningConnector){Fail 'Existing WhatsApp connector is running. Stop it before installing. No sessions changed.'}
 $tools=FindOrDownloadNode $Root
 $nodeExe=$tools[0];$npmCmd=$tools[1]
 Step ('Chosen folder: '+$Root)
 Step 'Downloading pinned application files ONLY to selected drive...'
 $src="https://raw.githubusercontent.com/dalulu05168/005/$Commit/whatsapp-connector"
 foreach($file in @('package.json','connector.mjs','runtime.mjs','seat-controller.mjs','README.md')){
   Invoke-WebRequest -Uri "$src/$file" -UseBasicParsing -OutFile (Join-Path $App $file) -TimeoutSec 60
 }
 $manifest=Get-Content (Join-Path $App 'package.json') -Raw | ConvertFrom-Json
 if($manifest.name -ne 'nuvexa-whatsapp-local-connector'){Fail 'Unexpected source downloaded.'}
 Step 'Installing Chromium and dependencies to selected drive (can take several minutes)...'
 Push-Location $App
 try{
   & $npmCmd install --no-audit --no-fund
   if($LASTEXITCODE -ne 0){Fail ('npm install failed: '+$LASTEXITCODE)}
 }finally{Pop-Location}
 if(-not (ValidToken $Config)){
   Step 'Device must be securely authorized ONCE for this location.'
   Step "Go to $Backend/admin#accounts"
   Step 'Use Local Service Maintenance -> Generate One-Time Device Authorization Code.'
   $code=(Read-Host 'One-time 24-character code').Trim().Replace('-','').Replace(' ','').ToUpperInvariant()
   if($code -notmatch '^[A-F0-9]{24}$'){Fail 'Invalid code. No device token was overwritten.'}
   $reply=Invoke-RestMethod -Uri "$Backend/v1/worker/enrollment/claim" -Method Post -Body (@{code=$code}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 30
   if([string]$reply.token -notmatch '^nw_[a-f0-9]{64}$'){Fail 'Backend rejected device pairing.'}
   $payload=@{origin=$Backend;token=[string]$reply.token;pairingCreatedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 4
   $tmp=$Config+'.tmp'
   [IO.File]::WriteAllText($tmp,$payload,(New-Object System.Text.UTF8Encoding($false)))
   Move-Item -LiteralPath $tmp -Destination $Config -Force
   Step 'One-time pairing saved on non-C drive.'
 }
 foreach($file in @('service.ps1','status.ps1','Check-Status.cmd')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $App $file) -Force}
 $PS=(Join-Path $PSHOME 'powershell.exe')
 $serviceFile=Join-Path $App 'service.ps1'
 $args='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$serviceFile+'"'
 New-Item -Path $RunKey -Force | Out-Null
 New-ItemProperty -Path $RunKey -Name 'NuvexaWhatsAppLocal' -PropertyType String -Value ('"'+$PS+'" '+$args) -Force | Out-Null
 Start-Process -FilePath $PS -ArgumentList $args -WindowStyle Hidden
 Start-Sleep -Seconds 5
 if(-not (HasRunningConnector)){Fail ('Background worker failed; inspect '+(Join-Path $Logs 'service.log'))}
 Step 'Local worker started. Windows sign-in will automatically restart it.'
 Step ('User sessions stored at '+(Join-Path $Private 'sessions'))
 Step "Open $Backend/admin#accounts to click Scan Login."
 exit 0
}catch{
 Write-Host ('[FAILED] '+$_.Exception.Message) -ForegroundColor Red
 exit 1
}
`;
const service=String.raw`$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$App=$PSScriptRoot
$env:LOCALAPPDATA=Join-Path $Root 'Runtime'
$env:TEMP=Join-Path $Root 'Temp'
$env:TMP=$env:TEMP
$env:XDG_CACHE_HOME=Join-Path $Root 'Cache'
$env:PUPPETEER_CACHE_DIR=Join-Path $Root 'Cache\Puppeteer'
$env:npm_config_cache=Join-Path $Root 'Cache\npm'
$Private=Join-Path $env:LOCALAPPDATA 'NuvexaPro\WhatsAppConnector'
$Logs=Join-Path $Private 'logs'
New-Item -ItemType Directory -Path $Logs,$env:TEMP,$env:PUPPETEER_CACHE_DIR -Force | Out-Null
$Log=Join-Path $Logs 'service.log'
$mutex=New-Object System.Threading.Mutex($false,'Local\NuvexaPro_WhatsAppConnector_Service')
$held=$false
try {
 $held=$mutex.WaitOne(0)
 if(-not $held){exit 0}
 if(-not (Test-Path (Join-Path $Private 'config.json'))){Add-Content $Log "$(Get-Date -Format o) No authorization on selected drive.";exit 2}
 $node=Get-Command node.exe -ErrorAction SilentlyContinue
 $portable=Join-Path (Join-Path $Root 'Node') 'node.exe'
 if(Test-Path $portable){$nodePath=$portable}else{if(-not $node){Add-Content $Log 'Node.js missing.';exit 3};$nodePath=$node.Source}
 while($true){
   Add-Content $Log "$(Get-Date -Format o) Starting connector."
   Push-Location $App
   try {& $nodePath (Join-Path $App 'connector.mjs') *>> $Log}
   catch {Add-Content $Log "$(Get-Date -Format o) $($_.Exception.Message)"}
   finally {Pop-Location}
   Start-Sleep -Seconds 30
 }
}finally{
 if($held){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
`;
const status=String.raw`@echo off
setlocal
cd /d "%~dp0"
title Nuvexa Pro Local Connection Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0status.ps1"
pause
`;
const guide=String.raw`NUVEXA PRO - LOCAL WINDOWS SETUP - NO C DRIVE DOWNLOADS

BEFORE YOU DOWNLOAD:
Chrome > Settings > Downloads > Location > Change to D:\Downloads (or E:).
Enable "Ask where to save each file before downloading".
This setting determines where the browser places the ZIP, not the installer.

INSTALLATION:
1. Save and extract the ZIP on D: or another non-C drive.
2. Double-click Install-Nuvexa.cmd.
3. The installer asks for an absolute non-C installation path. Default is
   D:\NuvexaPro if D: exists; otherwise it selects another available disk.
   It rejects C: even if the user types a C: destination.
4. Existing Node.js 20+ may be used wherever already installed. If absent,
   the script downloads a portable Node.js 22 ZIP to the selected drive only.
   It verifies SHA-256 against official nodejs.org checksums.
5. App, npm node_modules, npm cache, Puppeteer Chromium cache, TEMP/TMP, logs,
   WhatsApp LocalAuth profile and device pairing token all live under the
   selected root directory. Example:
   D:\NuvexaPro\App
   D:\NuvexaPro\Cache
   D:\NuvexaPro\Temp
   D:\NuvexaPro\Runtime\NuvexaPro\WhatsAppConnector\sessions
6. A one-time secure device code is required for a NEW installation. Do not
   share it, local auth credentials or the sessions folder with anyone.
7. The background worker starts automatically when that Windows user signs in
   via the Windows HKCU Run registry entry. Daily use is through your admin
   UI Scan Login button. No CMD required on subsequent days.
8. To inspect service health, use Check-Status.cmd in the installed App folder.
9. Existing sessions previously stored on C: are NOT erased or migrated
   automatically. Contact the assistant for controlled migration if needed.

IMPORTANT:
Windows itself may write ordinary OS metadata, logs or browser/system cache to
its system drive. The installer directs its OWN downloads, app files, temp,
cache and sessions to the selected non-C drive; it does not change system-wide
Windows disk usage or the browser Download settings.

This uses unofficial WhatsApp Web automation, not Meta's official API.
Local login only, no real WhatsApp message-send worker.
No paid hosting.
`;
const statusPs=String.raw`$Root=Split-Path -Parent $PSScriptRoot
$Profile=Join-Path $Root 'Runtime\NuvexaPro\WhatsAppConnector'
Write-Host ('Install folder: '+$Root)
Write-Host ('WhatsApp session folder: '+(Join-Path $Profile 'sessions'))
Write-Host 'Running Node connector:'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {$_.CommandLine -match 'connector\.mjs'} | Select-Object ProcessId,CommandLine | Format-Table -AutoSize
$log=Join-Path $Profile 'logs\service.log'
if(Test-Path $log){Get-Content $log -Tail 30}else{Write-Host 'No local worker log found.'}
`;
const files=[
 ['Install-Nuvexa.cmd',cmd],
 ['install.ps1',install],
 ['service.ps1',service],
 ['Check-Status.cmd',status],
 ['status.ps1',statusPs],
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
