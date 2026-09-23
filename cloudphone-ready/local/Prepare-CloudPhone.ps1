$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'CloudPhone'
$sdkCandidates = @($env:ANDROID_SDK_ROOT,$env:ANDROID_HOME,(Join-Path $env:LOCALAPPDATA 'Android\Sdk')) | Where-Object { $_ } | Select-Object -Unique
$sdk = @($sdkCandidates | Where-Object { (Test-Path (Join-Path $_ 'platform-tools\adb.exe')) -and (Test-Path (Join-Path $_ 'emulator\emulator.exe')) } | Select-Object -First 1)
if (-not $sdk.Count) { throw '未找到 Android SDK。请先用 Android Studio 安装 Android Emulator 和 Platform-Tools。' }
$emulator = Join-Path $sdk[0] 'emulator\emulator.exe'
$names = @(& $emulator -list-avds 2>$null | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -match '^[A-Za-z0-9_.-]+$' } | Select-Object -Unique)
if (-not $names.Count) { throw '没有发现 Android 虚拟设备。请先在 Android Studio 的 Device Manager 创建至少一台 AVD。' }
New-Item -ItemType Directory -Path $base -Force | Out-Null
$statePath = Join-Path $base 'instances.json'; $configPath = Join-Path $base 'local-config.json'
if (Test-Path $statePath) {
  try {
    $parsedRows = Get-Content $statePath -Raw | ConvertFrom-Json
    $rows = @()
    foreach ($parsedRow in $parsedRows) { $rows += $parsedRow }
  } catch { throw "设备注册表损坏，未改写：$statePath" }
  foreach ($row in $rows) { if ($names -notcontains [string]$row.avdName) { throw "已登记的 AVD '$($row.avdName)' 当前不存在。为保护设备映射，程序未自动改写注册表。" } }
  $usedPorts=@($rows|ForEach-Object{[int]$_.port});$newNames=@($names|Where-Object{$rows.avdName -notcontains $_})
  if($newNames.Count){Copy-Item $statePath "$statePath.$(Get-Date -Format yyyyMMddHHmmss).bak";foreach($name in $newNames){$port=5554;while($usedPorts -contains $port){$port+=2};if($port -gt 5682){throw '可分配的模拟器端口已经用完。'};$sha=[Security.Cryptography.SHA256]::Create();try{$id=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($name))).Replace('-','').Substring(0,16).ToLowerInvariant()}finally{$sha.Dispose()};$rows+=@{deviceId=$id;avdName=$name;port=$port};$usedPorts+=$port};ConvertTo-Json @($rows) -Depth 4|Set-Content $statePath -Encoding utf8;Write-Host "已追加 $($newNames.Count) 台新 AVD，原映射保持不变。"}
} else {
  $rows=@();$port=5554
  foreach($name in $names){$sha=[Security.Cryptography.SHA256]::Create();try{$id=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($name))).Replace('-','').Substring(0,16).ToLowerInvariant()}finally{$sha.Dispose()};$rows+=@{deviceId=$id;avdName=$name;port=$port};$port+=2}
  ConvertTo-Json @($rows) -Depth 4 | Set-Content $statePath -Encoding utf8
}
if(Test-Path $configPath){try{$cfg=Get-Content $configPath -Raw|ConvertFrom-Json}catch{throw "配置文件损坏，未改写：$configPath"}}
else{$bytes=New-Object byte[] 6;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose();$invite=([BitConverter]::ToString($bytes).Replace('-','').Substring(0,8)).ToUpperInvariant();$cfg=[pscustomobject]@{sdkRoot=$sdk[0];statePath=$statePath;inviteCode=$invite}}
$cfg.sdkRoot=$sdk[0];$cfg.statePath=$statePath
if(-not $cfg.inviteCode){$cfg|Add-Member -NotePropertyName inviteCode -NotePropertyValue '521314'}
if(Test-Path $configPath){Copy-Item $configPath "$configPath.bak" -Force}
$cfg|ConvertTo-Json|Set-Content $configPath -Encoding utf8
# Apply a consistent two-device performance profile. Back up each AVD config once per run.
foreach($name in $names){
  $avdConfig=Join-Path $env:USERPROFILE ".android\avd\$name.avd\config.ini"
  if(-not (Test-Path $avdConfig)){continue}
  Copy-Item $avdConfig "$avdConfig.cloudphone.bak" -Force
  $lines=@(Get-Content $avdConfig)
  $settings=[ordered]@{
    'hw.gpu.enabled'='yes';'hw.gpu.mode'='host';'hw.cpu.ncore'='4';'hw.ramSize'='2048';
    'hw.camera.back'='none';'hw.camera.front'='none';'showDeviceFrame'='no'
  }
  foreach($key in $settings.Keys){
    $found=$false
    for($i=0;$i -lt $lines.Count;$i++){if($lines[$i] -match ('^'+[regex]::Escape($key)+'=')){$lines[$i]="$key=$($settings[$key])";$found=$true;break}}
    if(-not $found){$lines+="$key=$($settings[$key])"}
  }
  Set-Content -LiteralPath $avdConfig -Value $lines -Encoding utf8
}
Write-Host "准备完成：$($rows.Count) 台 AVD；SDK：$($sdk[0])"
Write-Host "首次注册邀请码：$($cfg.inviteCode)（仅注册需要，请妥善保存）"
