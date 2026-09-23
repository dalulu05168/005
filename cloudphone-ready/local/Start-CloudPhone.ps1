$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'CloudPhone';$url='http://127.0.0.1:3077';$expected='2.2.0'
function Get-Health { try { return Invoke-RestMethod "$url/health" -TimeoutSec 2 } catch { return $null } }
$health=Get-Health
if($health -and $health.version -ne $expected){
  if($health.app -ne 'cloudphone-local'){throw "端口 3077 已被其他程序占用。"}
  $oldPid=0
  if($health.pid){$oldPid=[int]$health.pid}
  if(-not $oldPid){
    $line=netstat -ano -p tcp|Select-String '^\s*TCP\s+127\.0\.0\.1:3077\s+\S+\s+LISTENING\s+(\d+)\s*$'|Select-Object -First 1
    if($line -and $line.Matches.Count){$oldPid=[int]$line.Matches[0].Groups[1].Value}
  }
  if(-not $oldPid){throw "检测到旧版 CloudPhone，但无法确认其进程。请在任务管理器结束对应 node.exe 后重试。"}
  $process=Get-Process -Id $oldPid -ErrorAction SilentlyContinue
  if(-not $process -or $process.ProcessName -ne 'node'){throw "旧版服务的进程身份不符合预期，已拒绝自动结束。"}
  Stop-Process -Id $oldPid -Force
  Start-Sleep -Milliseconds 700
  $health=$null
}
if(-not $health){
  $node=(Get-Command node.exe -ErrorAction Stop).Source
  $server=Join-Path $PSScriptRoot 'server.mjs'
  $serverArgument='"' + $server + '"'
  Start-Process -FilePath $node -ArgumentList $serverArgument -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $base 'local-ui.out.log') -RedirectStandardError (Join-Path $base 'local-ui.err.log')
  for($i=0;$i -lt 20;$i++){Start-Sleep -Milliseconds 500;$health=Get-Health;if($health){break}}
}
if(-not $health){throw "CloudPhone 启动失败，请查看 $base\local-ui.err.log"}
$edge=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'))|Where-Object{$_ -and (Test-Path $_)}|Select-Object -First 1
if($edge){Start-Process $edge -ArgumentList @('--app='+$url,'--start-maximized')}else{Start-Process $url}
