$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$adb=Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'

Write-Host '正在关闭旧的云手机、镜像和管理服务...'
if(Test-Path $adb){
  foreach($serial in @('emulator-5554','emulator-5556')){try{& $adb -s $serial emu kill 2>$null|Out-Null}catch{}}
}
Start-Sleep -Seconds 2
Get-Process scrcpy,emulator,qemu-system-x86_64 -ErrorAction SilentlyContinue|Stop-Process -Force -ErrorAction SilentlyContinue
try{
  $health=Invoke-RestMethod 'http://127.0.0.1:3077/health' -TimeoutSec 2
  if($health.app -eq 'cloudphone-local' -and $health.pid){
    $p=Get-Process -Id ([int]$health.pid) -ErrorAction SilentlyContinue
    if($p -and $p.ProcessName -eq 'node'){Stop-Process -Id $p.Id -Force}
  }
}catch{}
Remove-Item (Join-Path $env:USERPROFILE '.android\emu-last-feature-flags.protobuf.lock') -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

& (Join-Path $PSScriptRoot 'Prepare-CloudPhone.ps1')
$cfg=Get-Content (Join-Path $env:LOCALAPPDATA 'CloudPhone\local-config.json') -Raw|ConvertFrom-Json
$rows=@(Get-Content $cfg.statePath -Raw|ConvertFrom-Json)
$emulator=Join-Path $cfg.sdkRoot 'emulator\emulator.exe'
$adb=Join-Path $cfg.sdkRoot 'platform-tools\adb.exe'
$logRoot=Join-Path $env:LOCALAPPDATA 'CloudPhone'
foreach($row in $rows){
  $args=@('-avd',[string]$row.avdName,'-port',[string]$row.port,'-no-window','-gpu','host','-accel','on','-memory','2048','-cores','4','-camera-back','none','-camera-front','none','-crash-report-mode','disabled','-no-audio','-no-snapshot-load','-no-snapshot-save','-no-boot-anim')
  Start-Process $emulator -ArgumentList $args -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "emulator-$($row.port).log") -RedirectStandardError (Join-Path $logRoot "emulator-$($row.port).err.log")
}
Write-Host '正在等待两台 Android 完成启动，通常需要 30 到 90 秒...'
$deadline=(Get-Date).AddMinutes(4)
do{
  $ready=0
  foreach($row in $rows){
    $serial="emulator-$($row.port)"
    try{if((& $adb -s $serial shell getprop sys.boot_completed 2>$null) -eq '1'){$ready++}}catch{}
  }
  if($ready -eq $rows.Count){break}
  Start-Sleep -Seconds 2
}while((Get-Date)-lt $deadline)
if($ready -ne $rows.Count){throw "Android 开机超时，请查看 $logRoot 下的 emulator 日志。"}

$scrcpy=Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\Genymobile.scrcpy_*\scrcpy-win*\scrcpy.exe') -ErrorAction SilentlyContinue|Select-Object -First 1 -ExpandProperty FullName
$index=0
foreach($row in $rows){
  $serial="emulator-$($row.port)"
  & $adb -s $serial shell wm size 720x1560|Out-Null
  & $adb -s $serial shell wm density 280|Out-Null
  foreach($key in 'window_animation_scale','transition_animation_scale','animator_duration_scale'){& $adb -s $serial shell settings put global $key 0|Out-Null}
  & $adb -s $serial shell settings put system screen_off_timeout 2147483647|Out-Null
  & $adb -s $serial shell input keyevent KEYCODE_WAKEUP|Out-Null
  & $adb -s $serial shell input keyevent KEYCODE_HOME|Out-Null
  if($scrcpy){
    $x=60+($index*380);$title="CloudPhone $($row.avdName)"
    Start-Process $scrcpy -ArgumentList @('-s',$serial,'--window-title',('"'+$title+'"'),'--no-audio','--stay-awake','--max-size','720','--max-fps','30','--video-bit-rate','4M','--video-buffer','0','--window-x',[string]$x,'--window-y','60','--window-width','360')
  }
  $index++
}
Write-Host '两台云手机已启动并完成低延迟配置。'
& (Join-Path $PSScriptRoot 'Start-CloudPhone.ps1')
