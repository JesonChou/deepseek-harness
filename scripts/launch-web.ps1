#Requires -Version 5.1
<#
.SYNOPSIS
Starts the DeepSeek Harness Web UI and opens it in an app window.
.DESCRIPTION
Desktop entry for the DeepSeek Harness Web UI. When nothing listens on the port yet, the
script starts the CLI in a hidden console window, waits until the server accepts
connections, and opens the Web UI in an application window with no tabs and no address
bar: the checkout's Electron shell (apps/desktop) when it is built and installed, Edge's
--app mode as the next fallback, Chrome's --app mode after that, and the default browser
only when nothing else exists. When the port already serves the harness, only the window
step runs, so a second double-click reopens the UI; the Electron shell focuses its
existing window instead of opening another one.
The start command prefers the checkout's built CLI (node apps\cli\lib\bin.js web --port
<port>), which needs no network and no build beyond the committed workflow; a checkout
without the built CLI falls back to the published package ("npx --yes @deepseek-ai/dsh web
--port <port>") run from the user profile directory. The fallback must not run from the
repository: npm 11's npx reads the working-directory tree through Arborist and mistakes the
apps\cli workspace member (published as @deepseek-ai/dsh) for an installed package, then
spawns a dsh shim that is not on PATH and exits with "'dsh' is not recognized".
.PARAMETER Port
HTTP port to serve and poll. Defaults to 3080, the Web UI's default port.
.PARAMETER NoBrowser
Check and start the server but do not open the UI window.
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
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LocalCli = Join-Path $RepoRoot 'apps\cli\lib\bin.js'

if (Test-Path -LiteralPath $LocalCli) {
  $StartCommand = 'node "' + $LocalCli + '" web --port ' + $Port
  $StartWorkingDirectory = $RepoRoot
}
else {
  $StartCommand = "npx --yes @deepseek-ai/dsh web --port $Port"
  $StartWorkingDirectory = [Environment]::GetFolderPath('UserProfile')
}

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

function Open-WebUiWindow {
  param([int]$LocalPort)
  $Url = "http://127.0.0.1:$LocalPort"
  # Preferred: the checkout's Electron shell, when it is built and installed.
  $DesktopMain = Join-Path $RepoRoot 'apps\desktop\lib\main.js'
  $ElectronExe = Join-Path $RepoRoot 'apps\desktop\node_modules\electron\dist\electron.exe'
  if ((Test-Path -LiteralPath $DesktopMain) -and (Test-Path -LiteralPath $ElectronExe)) {
    Write-Msg 'opening the app window via the Electron shell'
    $env:DSH_WEB_URL = $Url
    Start-Process -FilePath $ElectronExe -ArgumentList ('"' + $DesktopMain + '"')
    Remove-Item Env:DSH_WEB_URL
    return
  }
  # Fallback: browser app mode (no tabs, no address bar)...
  $AppCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($Candidate in $AppCandidates) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate)) {
      Write-Msg "opening app window via $Candidate"
      Start-Process -FilePath $Candidate -ArgumentList "--app=$Url"
      return
    }
  }
  # ...and the default browser only when neither exists.
  Write-Msg 'no app-mode browser found; opening the default browser'
  Start-Process $Url
}

if (Test-PortOpen -LocalPort $Port) {
  Write-Msg "port $Port already serves the Web UI"
  if (-not $NoBrowser) { Open-WebUiWindow -LocalPort $Port }
  exit 0
}

if ($DryRun) {
  Write-Msg "would run: $StartCommand (working directory: $StartWorkingDirectory)"
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js was not found on PATH. Install Node.js 22.19+ and try again.'
}
if (-not (Test-Path -LiteralPath $LocalCli) -and -not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Fail 'npx was not found on PATH. Reinstall Node.js and try again.'
}

Write-Msg "starting: $StartCommand"
$server = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', "title DeepSeek Harness Web (port $Port) && $StartCommand" -WorkingDirectory $StartWorkingDirectory -WindowStyle Hidden -PassThru

$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  if (Test-PortOpen -LocalPort $Port) { break }
  if ($server.HasExited) {
    Fail ('the server exited before the port opened; run "' + $StartCommand + '" in a console to see its error')
  }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-PortOpen -LocalPort $Port)) {
  Fail 'the server did not open port ' + $Port + ' within 120 seconds; run scripts\stop-web.ps1 if a previous instance owns the port'
}

Write-Msg "ready at $WebUrl"
if (-not $NoBrowser) { Open-WebUiWindow -LocalPort $Port }
exit 0
