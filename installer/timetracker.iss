; TimeTracker Windows Installer
; Inno Setup Script
; https://jrsoftware.org/isinfo.php

#define MyAppName "AI TimeTracker"
#define MyAppVersion "0.10.7"
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

; Upgrade behavior
CloseApplications=force
CloseApplicationsFilter=node.exe,aw-qt.exe
RestartApplications=no
AppMutex=AITimeTracker_SingleInstance_A1B2C3D4
SetupMutex=AITimeTrackerSetup
UsePreviousAppDir=yes

; PE metadata for SmartScreen reputation
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=ShopConnector
VersionInfoDescription=AI TimeTracker - Automatic Work Time Logger
VersionInfoCopyright=Copyright (C) 2024-2026 ShopConnector
VersionInfoProductName=AI TimeTracker
VersionInfoProductVersion={#MyAppVersion}

; Installation
DefaultDirName={localappdata}\TimeTracker
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Output
OutputDir=output
OutputBaseFilename=TimeTracker-Setup-{#MyAppVersion}-x64
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
english.WelcomeLabel2=This will install [name/ver] on your computer.%n%nAI TimeTracker helps you automatically track your work time using ActivityWatch and log it to Tempo/Jira.%n%nActivityWatch is included and will be installed automatically.%n%nRequirements:%n• Jira/Tempo API tokens
polish.WelcomeLabel2=Kreator zainstaluje [name/ver] na Twoim komputerze.%n%nAI TimeTracker pomaga automatycznie śledzić czas pracy używając ActivityWatch i logować go do Tempo/Jira.%n%nActivityWatch jest dołączony i zostanie zainstalowany automatycznie.%n%nWymagania:%n• Tokeny API Jira/Tempo

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "Start with Windows (silent, no console window)"; GroupDescription: "Startup:"

[Files]
; Node.js runtime
Source: "..\dist\windows\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs

; ActivityWatch (bundled)
Source: "..\dist\windows\activitywatch\*"; DestDir: "{app}\activitywatch"; Flags: ignoreversion recursesubdirs

; Application
Source: "..\dist\windows\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs

; Data directory — only copy .env.example, NEVER overwrite .env.local (user credentials)
Source: "..\dist\windows\data\.env.example"; DestDir: "{app}\data"; Flags: ignoreversion

; Env loader + server wrapper
Source: "..\dist\windows\start-server.js"; DestDir: "{app}"; Flags: ignoreversion

; Launchers
Source: "..\dist\windows\TimeTracker.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\windows\TimeTracker.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\windows\TimeTrackerSilent.vbs"; DestDir: "{app}"; Flags: ignoreversion

; Service installer for standalone bundle
Source: "..\scripts\windows\install-service-standalone.bat"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Clean old application files before installing new ones (upgrade hygiene)
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\activitywatch"
Type: files; Name: "{app}\start-server.js"
Type: files; Name: "{app}\TimeTracker.bat"
Type: files; Name: "{app}\TimeTracker.ps1"
Type: files; Name: "{app}\TimeTrackerSilent.vbs"
Type: files; Name: "{app}\install-service-standalone.bat"
; IMPORTANT: {app}\data is NEVER deleted — contains user credentials (.env.local)

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\ActivityWatch"; Filename: "{app}\activitywatch\aw-qt.exe"; WorkingDir: "{app}\activitywatch"
Name: "{group}\Configuration"; Filename: "notepad.exe"; Parameters: """{app}\data\.env.local"""; WorkingDir: "{app}"
Name: "{group}\Install as Service"; Filename: "{app}\install-service-standalone.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Autostart entries (if selected)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AITimeTracker"; ValueData: """wscript.exe"" ""{app}\TimeTrackerSilent.vbs"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ActivityWatch"; ValueData: """{app}\activitywatch\aw-qt.exe"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Show readme / open app after install
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up application files on uninstall (data/ is preserved by default)
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\activitywatch"
Type: files; Name: "{app}\start-server.js"
Type: files; Name: "{app}\TimeTracker.bat"
Type: files; Name: "{app}\TimeTracker.ps1"
Type: files; Name: "{app}\TimeTrackerSilent.vbs"
Type: files; Name: "{app}\install-service-standalone.bat"
Type: files; Name: "{app}\update.flag"

[Code]
// ============================================================================
// Semver comparison: returns -1, 0, or 1
// ============================================================================
function CompareVersion(V1, V2: String): Integer;
var
  P1, P2: Integer;
  Num1, Num2: Integer;
  Part1, Part2, Rest1, Rest2: String;
begin
  Result := 0;
  Rest1 := V1;
  Rest2 := V2;

  while (Rest1 <> '') or (Rest2 <> '') do
  begin
    // Extract next numeric part from V1
    P1 := Pos('.', Rest1);
    if P1 > 0 then begin
      Part1 := Copy(Rest1, 1, P1 - 1);
      Rest1 := Copy(Rest1, P1 + 1, Length(Rest1));
    end else begin
      Part1 := Rest1;
      Rest1 := '';
    end;

    // Extract next numeric part from V2
    P2 := Pos('.', Rest2);
    if P2 > 0 then begin
      Part2 := Copy(Rest2, 1, P2 - 1);
      Rest2 := Copy(Rest2, P2 + 1, Length(Rest2));
    end else begin
      Part2 := Rest2;
      Rest2 := '';
    end;

    Num1 := StrToIntDef(Part1, 0);
    Num2 := StrToIntDef(Part2, 0);

    if Num1 < Num2 then begin
      Result := -1;
      Exit;
    end;
    if Num1 > Num2 then begin
      Result := 1;
      Exit;
    end;
  end;
end;

// ============================================================================
// Read installed version from Windows registry (Inno Setup's uninstall key)
// ============================================================================
function GetInstalledVersion(): String;
var
  Version: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}_is1',
      'DisplayVersion', Version) then
    Result := Version;
end;

// ============================================================================
// InitializeSetup — detect upgrade/reinstall/downgrade
// ============================================================================
function InitializeSetup(): Boolean;
var
  InstalledVer: String;
  Cmp: Integer;
begin
  Result := True;
  InstalledVer := GetInstalledVersion();

  if InstalledVer = '' then
  begin
    // Fresh install — continue normally
    Exit;
  end;

  Cmp := CompareVersion('{#MyAppVersion}', InstalledVer);

  if Cmp > 0 then
  begin
    // Upgrade — silent, no questions
    Log('Upgrade detected: ' + InstalledVer + ' -> {#MyAppVersion}');
  end
  else if Cmp = 0 then
  begin
    // Same version — ask about reinstall
    if MsgBox('AI TimeTracker ' + InstalledVer + ' is already installed.' + #13#10 +
              'Do you want to repair/reinstall?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
    Log('Reinstall: ' + InstalledVer);
  end
  else
  begin
    // Downgrade — warn
    if MsgBox('A newer version (' + InstalledVer + ') is already installed.' + #13#10 +
              'You are installing an older version ({#MyAppVersion}).' + #13#10#13#10 +
              'Downgrading may cause issues. Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
    Log('Downgrade: ' + InstalledVer + ' -> {#MyAppVersion}');
  end;
end;

// ============================================================================
// StopTimeTrackerProcesses — targeted kill (NOT all node.exe!)
// ============================================================================
procedure StopTimeTrackerProcesses();
var
  ResultCode: Integer;
  WinHttp: Variant;
  ShutdownUrl: String;
begin
  // Step 1: Try graceful HTTP shutdown (gives server time to create update.flag)
  ShutdownUrl := 'http://localhost:5666/timetracker/api/update?action=shutdown';
  try
    WinHttp := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    WinHttp.SetTimeouts(2000, 2000, 2000, 2000);
    WinHttp.Open('POST', ShutdownUrl, False);
    WinHttp.Send('');
    Log('Graceful shutdown request sent, waiting...');
    Sleep(3000);
  except
    Log('Graceful shutdown failed (server may not be running)');
  end;

  // Step 2: Kill only node.exe processes running start-server.js (via WMIC command line match)
  Exec('cmd.exe', '/c wmic process where "name=''node.exe'' and commandline like ''%start-server.js%''" call terminate 2>nul',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Log('WMIC targeted kill result: ' + IntToStr(ResultCode));

  // Step 2.5: Fallback — if port :5666 still LISTENING after targeted kill,
  // assume another node.exe holds it (service host, VBS-launched, etc.)
  // and kill ALL node.exe. Only fires when targeted kill missed something.
  Sleep(1500);
  Exec('cmd.exe', '/c netstat -ano | findstr ":5666 " | findstr LISTENING >nul && (taskkill /F /IM node.exe & echo KILLED_FALLBACK) || echo PORT_FREE',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Log('Port :5666 fallback check result: ' + IntToStr(ResultCode));

  // Step 3: Kill ActivityWatch
  Exec('taskkill', '/F /IM aw-qt.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill', '/F /IM aw-server.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill', '/F /IM aw-watcher-window.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill', '/F /IM aw-watcher-afk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Sleep(2000);
end;

// ============================================================================
// MergeEnvExample — add new keys from .env.example to .env.local
//                   without overwriting existing user values
// ============================================================================
procedure MergeEnvExample();
var
  AppDir, EnvLocal, EnvExample: String;
  ExampleLines, LocalLines: TArrayOfString;
  I, J, EqPos: Integer;
  Key, Line: String;
  KeyExists: Boolean;
  MergedContent: String;
  NewKeysCount: Integer;
begin
  AppDir := ExpandConstant('{app}');
  EnvLocal := AppDir + '\data\.env.local';
  EnvExample := AppDir + '\data\.env.example';

  // If no .env.local exists yet, copy from example
  if not FileExists(EnvLocal) then
  begin
    if FileExists(EnvExample) then
      FileCopy(EnvExample, EnvLocal, False);
    Log('No .env.local found — copied from .env.example');
    Exit;
  end;

  // If no .env.example, nothing to merge
  if not FileExists(EnvExample) then
    Exit;

  // Load both files
  if not LoadStringsFromFile(EnvExample, ExampleLines) then Exit;
  if not LoadStringsFromFile(EnvLocal, LocalLines) then Exit;

  // Read existing .env.local content
  MergedContent := '';
  for I := 0 to GetArrayLength(LocalLines) - 1 do
  begin
    if MergedContent <> '' then
      MergedContent := MergedContent + #13#10;
    MergedContent := MergedContent + LocalLines[I];
  end;

  // Find keys in .env.example that are not in .env.local
  NewKeysCount := 0;
  for I := 0 to GetArrayLength(ExampleLines) - 1 do
  begin
    Line := Trim(ExampleLines[I]);
    // Skip empty lines and comments
    if (Line = '') or (Copy(Line, 1, 1) = '#') then
      Continue;

    EqPos := Pos('=', Line);
    if EqPos <= 1 then
      Continue;

    Key := Trim(Copy(Line, 1, EqPos - 1));

    // Check if this key already exists in .env.local
    KeyExists := False;
    for J := 0 to GetArrayLength(LocalLines) - 1 do
    begin
      if Pos(Key + '=', Trim(LocalLines[J])) = 1 then
      begin
        KeyExists := True;
        Break;
      end;
    end;

    // If key is new, append it
    if not KeyExists then
    begin
      // Add section comment from .env.example (look backwards for # lines)
      if NewKeysCount = 0 then
        MergedContent := MergedContent + #13#10 + #13#10 + '# --- New keys added by installer ---';
      MergedContent := MergedContent + #13#10 + Line;
      NewKeysCount := NewKeysCount + 1;
      Log('Merged new env key: ' + Key);
    end;
  end;

  // Write back if we added anything
  if NewKeysCount > 0 then
  begin
    SaveStringToFile(EnvLocal, MergedContent, False);
    Log('Merged ' + IntToStr(NewKeysCount) + ' new keys into .env.local');
  end else
    Log('No new env keys to merge');
end;

// ============================================================================
// CurStepChanged — stop processes before install, merge env after
// ============================================================================
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    StopTimeTrackerProcesses();
  end;

  if CurStep = ssPostInstall then
  begin
    MergeEnvExample();
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    // Could add final checks here
  end;
end;
