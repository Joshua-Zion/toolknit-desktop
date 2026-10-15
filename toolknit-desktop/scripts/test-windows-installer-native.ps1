param([string]$Compiler = "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe")
$ErrorActionPreference = 'Stop'
$desktopRoot = Split-Path $PSScriptRoot -Parent
$generatedRoot = Join-Path $desktopRoot 'src-tauri\target\release\nsis\x64'
$source = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $generatedRoot 'installer.nsi')
if (-not $source.Contains('Function DetectWebView2')) { throw 'Build the repaired NSIS package before running native verification.' }
$testId = [guid]::NewGuid().ToString('N')
$product = "ToolKnit-Installer-QA-$testId"
$manufacturer = 'ToolKnit-Installer-QA'
$runtimeGuid = '{' + [guid]::NewGuid().ToString().ToUpperInvariant() + '}'
$taskRoot = Join-Path $desktopRoot "tmp\installer-native-$testId"
$installRoot = Join-Path $taskRoot 'installed app'
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$product"
$productKey = "HKCU:\Software\$manufacturer\$product"
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runtimeSubkey = "Software\Microsoft\EdgeUpdate\Clients\$runtimeGuid"
$results = [System.Collections.Generic.List[object]]::new()
New-Item -Path $taskRoot -ItemType Directory | Out-Null
foreach ($name in @('utils.nsh', 'FileAssociation.nsh', 'English.nsh', 'SimpChinese.nsh')) {
  Copy-Item -LiteralPath (Join-Path $generatedRoot $name) -Destination (Join-Path $taskRoot $name)
}
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
function FileHash([string]$path) {
  $stream = [IO.File]::OpenRead($path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)) }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}
function Set-Define([string]$text, [string]$name, [string]$value) {
  $pattern = '(?m)^!define ' + [regex]::Escape($name) + ' ".*"\r?$'
  Assert ([regex]::IsMatch($text, $pattern)) "Missing define: $name"
  return [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) "!define $name `"$value`"" })
}
function Compile([string]$script) {
  $log = "$script.log"
  & $Compiler /V2 /INPUTCHARSET UTF8 $script *> $log
  Assert ($LASTEXITCODE -eq 0) "NSIS compile failed: $log"
}
function RuntimeVersion([string]$version, [Microsoft.Win32.RegistryView]$view = 'Registry32') {
  $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser', $view)
  try {
    if ($null -eq $version -or $version -eq '') { $root.DeleteSubKeyTree($runtimeSubkey, $false) }
    else {
      $key = $root.CreateSubKey($runtimeSubkey)
      try { $key.SetValue('pv', $version) } finally { $key.Dispose() }
    }
  } finally { $root.Dispose() }
}
function Run([string]$exe, [string]$arguments) {
  $process = Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) {
    Stop-Process -Id $process.Id
    throw "Isolated installer timeout: $exe"
  }
  $process.Refresh()
  return $process.ExitCode
}
function Uninstall([string]$expectedStartup = '') {
  if (Test-Path -LiteralPath $uninstallKey) {
    $path = (Get-ItemProperty -LiteralPath $uninstallKey).InstallLocation.Trim('"')
    Assert ($path -eq $installRoot) 'Refusing to uninstall outside isolated directory'
    $code = Run (Join-Path $path 'uninstall.exe') "/S /CurrentUser _?=$path"
    Assert ($code -eq 0) "Uninstall failed: $code"
    Assert (-not (Test-Path -LiteralPath (Join-Path $path 'toolknit-desktop.exe'))) 'App survived uninstall'
    Assert (-not (Test-Path -LiteralPath $uninstallKey)) 'Uninstall registry survived'
    $startupProperty = (Get-ItemProperty -LiteralPath $runKey).PSObject.Properties[$product]
    $startup = if ($startupProperty) { $startupProperty.Value } else { '' }
    Assert ("$startup" -eq $expectedStartup) 'Uninstaller violated startup path ownership'
  }
}
function Case([string]$name, [string]$mode, [int]$expectedCode, [bool]$expectedApp, [bool]$expectedCalled, [string]$extra = '', [string]$installer = $simulation) {
  $env:TOOLKNIT_INSTALLER_QA_MODE = $mode
  Remove-Item -LiteralPath (Join-Path $taskRoot 'bootstrapper-called') -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $taskRoot 'app-launch-attempted') -ErrorAction SilentlyContinue
  $code = Run $installer "/S /CurrentUser /NS $extra /D=$installRoot"
  $appExists = Test-Path -LiteralPath (Join-Path $installRoot 'toolknit-desktop.exe')
  $called = Test-Path -LiteralPath (Join-Path $taskRoot 'bootstrapper-called')
  $results.Add([pscustomobject]@{ case = $name; exitCode = $code; appPresent = $appExists; bootstrapperCalled = $called })
  Assert ($code -eq $expectedCode) "$name exit code $code, expected $expectedCode"
  Assert ($appExists -eq $expectedApp) "$name app presence mismatch"
  Assert ($called -eq $expectedCalled) "$name bootstrapper invocation mismatch"
  Assert (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'app-launch-attempted'))) "$name unexpectedly launched the app"
  if ($expectedApp) {
    $registered = (Get-ItemProperty -LiteralPath $uninstallKey).InstallLocation.Trim('"')
    Assert ($registered -eq $installRoot) "Explicit /D directory was ignored: $registered"
    Assert (Test-Path -LiteralPath (Join-Path $installRoot 'resources\qpdf\qpdf.exe')) 'Missing bundled runtime resource'
    Assert ((FileHash (Join-Path $installRoot 'toolknit-desktop.exe')) -eq (FileHash (Join-Path $desktopRoot 'src-tauri\target\release\toolknit-desktop.exe'))) 'Installed production payload hash mismatch'
  }
  Write-Output "PASS $name"
}

# The stub only touches a random test GUID and reports deterministic installer outcomes.
$stub = @"
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "$taskRoot\bootstrapper.exe"
Section
  FileOpen `$0 "$taskRoot\bootstrapper-called" w
  FileClose `$0
  ReadEnvStr `$0 "TOOLKNIT_INSTALLER_QA_MODE"
  StrCmp `$0 "success" success
  StrCmp `$0 "reboot" reboot
  StrCmp `$0 "reboot-registered" reboot_registered
  StrCmp `$0 "failure" failure
  SetErrorLevel 0
  Quit
  success:
    SetRegView 32
    WriteRegStr HKCU "$runtimeSubkey" "pv" "155.0.4283.45"
    SetErrorLevel 0
    Quit
  reboot:
    SetErrorLevel 3010
    Quit
  reboot_registered:
    SetRegView 32
    WriteRegStr HKCU "$runtimeSubkey" "pv" "155.0.4283.45"
    SetErrorLevel 3010
    Quit
  failure:
    SetErrorLevel 1603
    Quit
SectionEnd
"@
$stubPath = Join-Path $taskRoot 'bootstrapper.nsi'
[IO.File]::WriteAllText($stubPath, $stub)
Compile $stubPath
$source = Set-Define $source 'PRODUCTNAME' $product
$source = Set-Define $source 'MANUFACTURER' $manufacturer
$source = Set-Define $source 'BUNDLEID' "com.toolknit.installer.qa.$testId"
$source = Set-Define $source 'TOOLKNIT_AUTOSTART_VALUE_NAME' $product
# Keep the multi-user initialization path; only the test manifest omits elevation.
$multiUser = Get-Content -Raw -LiteralPath (Join-Path (Split-Path $Compiler -Parent) 'Include\MultiUser.nsh')
$multiUserPath = Join-Path $taskRoot 'MultiUser-QA.nsh'
[IO.File]::WriteAllText($multiUserPath, $multiUser.Replace('RequestExecutionLevel highest', 'RequestExecutionLevel user'))
$source = $source.Replace('!include MultiUser.nsh', "!include `"$multiUserPath`"")
$source = $source.Replace('SetCompressor /SOLID "lzma"', 'SetCompressor zlib')
# Observe launch attempts without opening a second real application instance.
$launchProbe = 'FileOpen $0 "' + $taskRoot + '\app-launch-attempted" w' + "`r`n  FileClose " + '$0'
$source = [regex]::Replace($source, '(?m)^\s*nsis_tauri_utils::RunAsUser [^\r\n]+', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $launchProbe })
function Installer([string]$name, [bool]$simulate, [bool]$badExecutable = $false) {
  $text = Set-Define $source 'OUTFILE' (Join-Path $taskRoot "$name.exe")
  if ($simulate) {
    $text = Set-Define $text 'WEBVIEW2APPGUID' $runtimeGuid
    $text = Set-Define $text 'WEBVIEW2BOOTSTRAPPERPATH' (Join-Path $taskRoot $(if ($badExecutable) { 'invalid.exe' } else { 'bootstrapper.exe' }))
  }
  $script = Join-Path $taskRoot "$name.nsi"
  [IO.File]::WriteAllText($script, $text, [Text.UTF8Encoding]::new($false))
  Compile $script
  return (Join-Path $taskRoot "$name.exe")
}
$priorMode = $env:TOOLKNIT_INSTALLER_QA_MODE
try {
  $real = Installer 'real-runtime' $false
  $simulation = Installer 'simulated-runtime' $true
  [IO.File]::WriteAllText((Join-Path $taskRoot 'invalid.exe'), 'Invalid executable for launch-failure verification')
  $bad = Installer 'invalid-bootstrapper' $true $true
  Case 'existing-real-runtime' '' 0 $true $false '' $real
  $ownedCommand = '"' + $installRoot + '\toolknit-desktop.exe" --autostart'
  New-ItemProperty -LiteralPath $runKey -Name $product -Value $ownedCommand -Force | Out-Null
  Uninstall

  Case 'missing-runtime-install-success' 'success' 0 $true $true
  RuntimeVersion ''
  Case 'missing-runtime-update-repair' 'success' 0 $true $true '/UPDATE'
  New-ItemProperty -LiteralPath $runKey -Name $product -Value '"C:\Other ToolKnit\toolknit-desktop.exe" --autostart' -Force | Out-Null
  Uninstall '"C:\Other ToolKnit\toolknit-desktop.exe" --autostart'
  Remove-ItemProperty -LiteralPath $runKey -Name $product

  Case 'valid-runtime-skip-bootstrapper' '' 0 $true $false
  Uninstall
  foreach ($version in @('0.0.0.0', 'broken', '155..1.1', '1.2.3.x', '0.0.0.00')) {
    RuntimeVersion $version
    Case "reject-$version" '' 1603 $false $true
  }
  RuntimeVersion ''
  Case 'zero-exit-without-runtime' '' 1603 $false $true
  Case 'explicit-bootstrapper-failure' 'failure' 1603 $false $true
  Case 'bootstrapper-launch-failure' '' 1603 $false $false '' $bad
  Case 'reboot-required-without-runtime' 'reboot' 3010 $true $true '/R'
  Uninstall
  Case 'reboot-required-with-registered-runtime' 'reboot-registered' 3010 $true $true '/R'
  Uninstall
  if ([Environment]::Is64BitOperatingSystem) {
    RuntimeVersion '0.0.0.0'
    RuntimeVersion '155.0.4283.45' 'Registry64'
    Case 'valid-runtime-64-view-registration' '' 0 $true $false
    Uninstall
  }
} catch {
  Write-Output "FAIL: $_"
  throw
} finally {
  $env:TOOLKNIT_INSTALLER_QA_MODE = $priorMode
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRoot 'results.json') -Encoding utf8
  Uninstall
  RuntimeVersion ''
  if ([Environment]::Is64BitOperatingSystem) { RuntimeVersion '' 'Registry64' }
  Remove-ItemProperty -LiteralPath $runKey -Name $product -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $productKey) { Remove-Item -LiteralPath $productKey -Recurse }
  # A fixed, already validated path; never enumerate user installations for cleanup.
  if (Test-Path -LiteralPath $installRoot) {
    Assert ((Resolve-Path -LiteralPath $installRoot).Path -eq $installRoot) 'Unexpected cleanup directory'
    Remove-Item -LiteralPath $installRoot -Recurse
  }
  Write-Output "Evidence: $taskRoot"
}
