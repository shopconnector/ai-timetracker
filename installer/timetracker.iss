; TimeTracker Windows Installer
; Inno Setup Script
; https://jrsoftware.org/isinfo.php

#define MyAppName "AI TimeTracker"
#define MyAppVersion "0.4.4"
#define MyAppPublisher "ShopConnector"
#define MyAppURL "https://github.com/shopconnector/ai-timetracker"
#define MyAppExeName "TimeTracker.bat"

[Setup]
; App identity
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases

; Installation
DefaultDirName={localappdata}\TimeTracker
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Output
OutputDir=output
OutputBaseFilename=TimeTracker-Setup-x64
; SetupIconFile=icon.ico  ; TODO: Add custom icon
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; UI
WizardStyle=modern
WizardSizePercent=110

; Uninstaller
UninstallDisplayIcon={app}\TimeTracker.bat
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

[Messages]
english.WelcomeLabel2=This will install [name/ver] on your computer.%n%nAI TimeTracker helps you automatically track your work time using ActivityWatch and log it to Tempo/Jira.%n%nRequirements:%n• ActivityWatch (download from activitywatch.net)%n• Jira/Tempo API tokens%n%nNote: Windows Defender may show a warning because this installer is not code-signed. Click "More info" then "Run anyway" to proceed.
polish.WelcomeLabel2=Kreator zainstaluje [name/ver] na Twoim komputerze.%n%nAI TimeTracker pomaga automatycznie śledzić czas pracy używając ActivityWatch i logować go do Tempo/Jira.%n%nWymagania:%n• ActivityWatch (pobierz z activitywatch.net)%n• Tokeny API Jira/Tempo%n%nUwaga: Windows Defender moze pokazac ostrzezenie, poniewaz instalator nie jest podpisany cyfrowo. Kliknij "Wiecej informacji", a nastepnie "Uruchom mimo to".

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "Start with Windows (silent, no console window)"; GroupDescription: "Startup:"; Flags: checked

[Files]
; Node.js runtime
Source: "..\dist\windows\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs

; Application
Source: "..\dist\windows\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs

; Data directory
Source: "..\dist\windows\data\*"; DestDir: "{app}\data"; Flags: ignoreversion recursesubdirs onlyifdoesntexist

; Launchers
Source: "..\dist\windows\TimeTracker.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\windows\TimeTracker.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\windows\TimeTrackerSilent.vbs"; DestDir: "{app}"; Flags: ignoreversion

; Service installer for standalone bundle
Source: "..\scripts\windows\install-service-standalone.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Configuration"; Filename: "notepad.exe"; Parameters: """{app}\data\.env.local"""; WorkingDir: "{app}"
Name: "{group}\Install as Service"; Filename: "{app}\install-service-standalone.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Autostart entries (if selected)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AITimeTracker"; ValueData: """wscript.exe"" ""{app}\TimeTrackerSilent.vbs"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ActivityWatch"; ValueData: """{localappdata}\activitywatch\aw-qt.exe"""; Flags: uninsdeletevalue createvalueifdoesntexist; Tasks: autostart

[Run]
; Show readme / open app after install
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up data directory on uninstall (optional - commented out to preserve settings)
; Type: filesandordirs; Name: "{app}\data"

[Code]
// Check for ActivityWatch before installation
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  
  // Check if ActivityWatch API is accessible
  // We just show a warning, don't block installation
end;

procedure CurPageChanged(CurPageID: Integer);
var
  AwStatus: String;
begin
  if CurPageID = wpFinished then
  begin
    // Could add final checks here
  end;
end;

// Custom function to check ActivityWatch
function CheckActivityWatch(): Boolean;
begin
  Result := False;
  // This would require WinHTTP or similar - keeping it simple for now
end;
