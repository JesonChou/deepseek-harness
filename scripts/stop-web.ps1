#Requires -Version 5.1
<#
.SYNOPSIS
Stops the DeepSeek Harness Web server listening on a port.
.DESCRIPTION
Finds the process listening on the port and stops it after confirming it is a node process
whose command line names dsh or the checkout's built CLI (apps\cli\lib\bin.js). Refuses
other port owners. This is the only way to stop the server: the launcher starts it in a
hidden window.
.PARAMETER Port
HTTP port to free. Defaults to 3080.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-web.ps1
#>
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3080
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$listenerLines = @(netstat -ano -p TCP | Where-Object { $_ -match 'LISTENING' -and $_ -match ":$Port\s" })
if ($listenerLines.Count -eq 0) {
  Write-Output "[stop-web] nothing is listening on port $Port"
  exit 0
}

$processIds = @($listenerLines | ForEach-Object { [int]([regex]::Match($_, '\s(\d+)\s*$').Groups[1].Value) } | Sort-Object -Unique)
$stopped = 0
foreach ($processId in $processIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'dsh|bin\.js') {
    Write-Warning "[stop-web] port $Port owner (PID $processId, $($process.Name)) is not a dsh server; leaving it alone"
    continue
  }
  Stop-Process -Id $processId -Force
  $stopped++
  Write-Output "[stop-web] stopped dsh web server (PID $processId)"
}

if ($stopped -eq 0) { exit 1 }
exit 0
