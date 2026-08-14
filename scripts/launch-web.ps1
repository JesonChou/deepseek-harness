#Requires -Version 5.1
<#
.SYNOPSIS
Starts the DeepSeek Harness Web UI and opens the default browser.
.DESCRIPTION
Desktop entry for the DeepSeek Harness Web UI. When nothing listens on the port yet, the
script starts the published package ("npx --yes @deepseek-ai/dsh web --port <port>") in a
minimized console window, waits until the server accepts connections, and opens the default
browser at the printed address. When the port already serves the harness, only the browser
step runs, so a second double-click reopens the UI.
.PARAMETER Port
HTTP port to serve and poll. Defaults to 3080, the Web UI's default port.
.PARAMETER NoBrowser
Check and start the server but do not open a browser.
.PARAMETER NonInteractive
Report failures on the error stream instead of showing popup dialogs. Used by tests and automation.
.PARAMETER DryRun
Print the command that would start the server and exit without starting anything.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-web.ps1
#>
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3080,
  [switch]$NoBrowser,
  [switch]$NonInteractive,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WebUrl = "http://127.0.0.1:$Port"
$StartCommand = "npx --yes @deepseek-ai/dsh web --port $Port"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Msg {
  param([string]$Text)
  Write-Output "[launch-web] $Text"
}

function Fail {
  param([string]$Text)
  if ($NonInteractive) {
    [Console]::Error.WriteLine("[launch-web] $Text")
  }
  else {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup("DeepSeek Harness Web`r`n`r`n$Text", 0, 'DeepSeek Harness Web', 48)
  }
  exit 2
}

function Test-PortOpen {
  param([int]$LocalPort)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect('127.0.0.1', $LocalPort, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(300, $false)) { return $false }
    $client.EndConnect($result)
    return $true
  }
  catch {
    return $false
  }
  finally {
    $client.Close()
  }
}

if (Test-PortOpen -LocalPort $Port) {
  Write-Msg "port $Port already serves the Web UI"
  if (-not $NoBrowser) { Start-Process $WebUrl }
  exit 0
}

if ($DryRun) {
  Write-Msg "would run: $StartCommand (working directory: $RepoRoot)"
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js was not found on PATH. Install Node.js 22.19+ and try again.'
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Fail 'npx was not found on PATH. Reinstall Node.js and try again.'
}

Write-Msg "starting: $StartCommand"
$server = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "title DeepSeek Harness Web (port $Port) && $StartCommand" -WorkingDirectory $RepoRoot -WindowStyle Minimized -PassThru

$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  if (Test-PortOpen -LocalPort $Port) { break }
  if ($server.HasExited) {
    Fail ('the server exited before the port opened; run "' + $StartCommand + '" in a console to see its error')
  }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-PortOpen -LocalPort $Port)) {
  Fail "the server did not open port $Port within 120 seconds; see the minimized console window for progress"
}

Write-Msg "ready at $WebUrl"
if (-not $NoBrowser) { Start-Process $WebUrl }
exit 0
