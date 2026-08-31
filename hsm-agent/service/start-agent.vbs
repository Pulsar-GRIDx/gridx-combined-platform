' Launches run-agent.cmd with no console window.
' Task Scheduler would otherwise leave a command prompt on the desktop for as
' long as the agent runs, which on a shared factory PC invites someone closing it.
Set sh = CreateObject("WScript.Shell")
sh.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\run-agent.cmd""", 0, False
