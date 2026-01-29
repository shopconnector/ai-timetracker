; AI TimeTracker - Inno Setup Script
; Generuje TimeTracker-Setup-x64.exe

#define MyAppName "AI TimeTracker"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "shopconnector"
#define MyAppURL "https://github.com/shopconnector/ai-timetracker"
#define MyAppExeName "start.bat"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=TimeTracker-Setup-x64
; SetupIconFile=icon.ico  ; Odkomentuj jesli masz ikone
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "Uruchamiaj przy starcie systemu"; GroupDescription: "Opcje:"; Flags: unchecked

[Files]
Source: "..\dist\windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\windows\.env.example"; DestDir: "{app}"; DestName: ".env.local"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Konfiguracja"; Filename: "notepad.exe"; Parameters: """{app}\.env.local"""
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AITimeTracker"; ValueData: """{app}\start-hidden.vbs"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "notepad.exe"; Parameters: """{app}\.env.local"""; Description: "Otworz konfiguracje (.env.local)"; Flags: nowait postinstall skipifsilent unchecked
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[Code]
// Sprawdz czy ActivityWatch jest zainstalowany
function ActivityWatchInstalled(): Boolean;
var
  AWPath: String;
begin
  Result := False;
  AWPath := ExpandConstant('{localappdata}\activitywatch\aw-qt.exe');
  if FileExists(AWPath) then
    Result := True;
  AWPath := ExpandConstant('{localappdata}\Programs\activitywatch\aw-qt.exe');
  if FileExists(AWPath) then
    Result := True;
  AWPath := ExpandConstant('{pf}\ActivityWatch\aw-qt.exe');
  if FileExists(AWPath) then
    Result := True;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpReady then
  begin
    if not ActivityWatchInstalled() then
    begin
      MsgBox('UWAGA: ActivityWatch nie zostal wykryty!' + #13#10 + #13#10 +
             'AI TimeTracker wymaga ActivityWatch do zbierania danych o aktywnosci.' + #13#10 + #13#10 +
             'Pobierz ActivityWatch z: https://activitywatch.net/downloads/' + #13#10 + #13#10 +
             'Mozesz kontynuowac instalacje, ale aplikacja nie bedzie dzialac poprawnie bez ActivityWatch.',
             mbInformation, MB_OK);
    end;
  end;
end;

[UninstallDelete]
Type: filesandordirs; Name: "{app}\.next"
Type: filesandordirs; Name: "{app}\node_modules"
