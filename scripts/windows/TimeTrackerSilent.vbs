' AI TimeTracker Silent Launcher
' Starts TimeTracker.bat without showing a console window
' Used for Windows autostart (no CMD window flashing on login)

Set WshShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir
WshShell.Run """" & strDir & "\TimeTracker.bat""", 0, False
