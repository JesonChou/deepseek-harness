' DeepSeek Harness Web desktop entry: runs scripts\launch-web.ps1 without a console window.
Option Explicit
Dim shell, fso, launcher, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
launcher = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "launch-web.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & launcher & Chr(34)
shell.Run command, 0, False
