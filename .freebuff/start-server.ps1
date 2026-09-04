$ErrorActionPreference = 'Stop'
$root = 'C:\Users\chand\Documents\AI_Finance-Controller'
$log = Join-Path $root '.freebuff\preview-cd8d7e08-79ba-43b2-94fd-8aef3db4668e.log'
$err = "$log.err"
$env:PORT = '3001'
$p = Start-Process -FilePath 'node.exe' -ArgumentList 'backend/index.js' -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
Write-Output $p.Id
