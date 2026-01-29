' Uruchamia TimeTracker bez widocznego okna konsoli
' Uzywane do autostartu

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\start.bat" & Chr(34), 0, False
