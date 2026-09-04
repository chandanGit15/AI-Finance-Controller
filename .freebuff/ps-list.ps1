Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($cmd.Length -gt 150) { $cmd = $cmd.Substring(0, 150) }
  Write-Output ("PID " + $_.ProcessId + " :: " + $cmd)
}
