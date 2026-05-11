#define AppName "BeStrong HQ"
#define AppVersion GetEnv("BESTRONG_INSTALLER_VERSION")
#if AppVersion == ""
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{DB599B77-08E2-4A63-8D5F-611D90C1BE2B}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\BeStrongHQ
DefaultGroupName=BeStrong HQ
PrivilegesRequired=lowest
OutputBaseFilename=BeStrongSetup-{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=BeStrong HQ

[Files]
Source: "..\bin\bestrong.ps1"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\bin\bestrong.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion

[Icons]
Name: "{group}\Open BeStrong"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" open"; WorkingDir: "{app}"
Name: "{group}\Start BeStrong"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" start"; WorkingDir: "{app}"
Name: "{group}\Stop BeStrong"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" stop"; WorkingDir: "{app}"
Name: "{group}\Update BeStrong"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" update"; WorkingDir: "{app}"
Name: "{group}\Troubleshoot BeStrong"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -NoExit -File ""{app}\bin\bestrong.ps1"" doctor"; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" setup"; Flags: runhidden
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\bestrong.ps1"" open"; Description: "Start BeStrong HQ"; Flags: postinstall nowait skipifsilent
