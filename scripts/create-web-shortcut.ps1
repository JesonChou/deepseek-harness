#Requires -Version 5.1
<#
.SYNOPSIS
Creates the DeepSeek Harness Web desktop shortcut.
.DESCRIPTION
Creates a desktop shortcut that runs scripts\launch-web.vbs, the console-free double-click
entry. Run once from the repository; afterwards, double-click the shortcut to start the Web
UI and open the browser.
.PARAMETER Name
Shortcut file name without extension. Defaults to "DeepSeek Harness Web".
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\create-web-shortcut.ps1
#>
param(
  [string]$Name = 'DeepSeek Harness Web'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$launcherVbs = Join-Path $PSScriptRoot 'launch-web.vbs'
$launcherIco = Join-Path $PSScriptRoot 'launch-web.ico'
foreach ($file in @($launcherVbs, $launcherIco)) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "missing launcher file: $file"
  }
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop "$Name.lnk"))
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcherVbs + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.IconLocation = "$launcherIco,0"
$shortcut.Description = 'Start the DeepSeek Harness Web UI and open the browser'
$shortcut.Save()

Write-Output "created desktop shortcut: $(Join-Path $desktop "$Name.lnk")"
Write-Output 'double-click it to start the Web UI; run scripts\stop-web.ps1 to stop it'
