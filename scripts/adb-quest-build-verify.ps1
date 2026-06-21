#!/usr/bin/env pwsh
# adb-quest-build-verify.ps1 — on-demand, on-device build-verify for compile_to_quest.
#
# The HOST-side compile gate is scripts/holo-ci/check-quest-build-verify.mts (gradlew assembleDebug,
# proven green). THIS script closes the loop on a real Quest 3 (serial 2G0YC5ZG03033W): install the
# debug APK, launch it, and assert the Horizon-OS runtime markers in logcat (passthrough, VR_APP,
# scanner panel) that no host build can prove.
#
# SAFE BY DEFAULT. Without -Deploy it is CHECK-ONLY (lists the device + confirms the APK) and never
# touches the headset. -Deploy installs + launches on the device — run it ONLY when the headset is
# IDLE (it competes with / interrupts the founder's VR session). Quest is the founder's primary worn
# surface; this is the on-demand role from config/sovereign-devices/quest3.json (adb-build-verify).
#
#   pwsh scripts/adb-quest-build-verify.ps1            # check-only: device + APK ready?
#   pwsh scripts/adb-quest-build-verify.ps1 -Deploy    # install + launch + logcat-assert (headset idle!)
param(
  [switch] $Deploy,
  [string] $Serial = '2G0YC5ZG03033W',
  [string] $ApkPath = "$PSScriptRoot/../apps/quest-universal-qr-scanner/android-mr/app/build/outputs/apk/debug/app-debug.apk",
  [int] $LogcatSeconds = 20
)
$ErrorActionPreference = 'Stop'

function Resolve-Tool([string]$name, [string[]]$candidates) {
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path } }
  $onPath = Get-Command $name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  return $null
}

$adb = Resolve-Tool 'adb' @('C:\tmp\platform-tools\adb.exe', 'C:\Android\platform-tools\adb.exe')
if (-not $adb) { Write-Error 'adb not found (looked in C:\tmp\platform-tools, C:\Android\platform-tools, PATH).'; exit 1 }

# Device presence (non-intrusive).
$devices = & $adb devices 2>&1
$connected = $devices | Select-String -SimpleMatch "$Serial`tdevice"
if (-not $connected) {
  Write-Host "[quest-bv] Quest $Serial NOT connected (adb devices):" -ForegroundColor Yellow
  $devices | ForEach-Object { Write-Host "    $_" }
  Write-Host "    Connect via USB (or 'adb connect' over LAN) with Developer Mode + USB debugging on." -ForegroundColor Yellow
  exit 1
}
$apkOk = Test-Path -LiteralPath $ApkPath
$apkSize = if ($apkOk) { '{0:N1} MB' -f ((Get-Item $ApkPath).Length / 1MB) } else { 'MISSING' }
Write-Host "[quest-bv] device $Serial connected; APK: $apkSize" -ForegroundColor Green
if (-not $apkOk) {
  Write-Host "    APK not built. Run: cd apps/quest-universal-qr-scanner/android-mr; ./gradlew assembleDebug" -ForegroundColor Yellow
  exit 1
}

if (-not $Deploy) {
  Write-Host "[quest-bv] CHECK-ONLY (safe). Device + APK are ready." -ForegroundColor Cyan
  Write-Host "    Re-run with -Deploy WHEN THE HEADSET IS IDLE to install + launch + verify on-device." -ForegroundColor Cyan
  exit 0
}

# -Deploy: this WILL launch an app on the headset. Identify package + launch activity from the APK.
$aapt = Resolve-Tool 'aapt' @('C:\Android\build-tools\36.0.0\aapt.exe', 'C:\Android\build-tools\35.0.0\aapt.exe', 'C:\Android\build-tools\34.0.0\aapt.exe')
$pkg = $null; $act = $null
if ($aapt) {
  $badging = & $aapt dump badging $ApkPath 2>$null
  $pkg = ([regex]"package: name='([^']+)'").Match(($badging -join "`n")).Groups[1].Value
  $act = ([regex]"launchable-activity: name='([^']+)'").Match(($badging -join "`n")).Groups[1].Value
}
Write-Host "[quest-bv] DEPLOYING to $Serial (headset session will be interrupted) ..." -ForegroundColor Magenta
& $adb -s $Serial install -r $ApkPath
& $adb -s $Serial logcat -c
if ($pkg -and $act) {
  & $adb -s $Serial shell am start -n "$pkg/$act"
  Write-Host "[quest-bv] launched $pkg/$act" -ForegroundColor Green
} elseif ($pkg) {
  & $adb -s $Serial shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host "[quest-bv] launched $pkg (monkey)" -ForegroundColor Green
} else {
  Write-Host "[quest-bv] could not resolve package from APK (aapt missing); install done, launch skipped." -ForegroundColor Yellow
}

Start-Sleep -Seconds $LogcatSeconds
$log = & $adb -s $Serial logcat -d 2>$null
# Horizon-OS runtime markers that prove the app actually ran on-device (no host build can show these).
$markers = @{
  'passthrough-ON'   = 'PassthroughApiManager: PT is: ON|Passthrough.*ON'
  'VR app pathway'   = 'VR_APP|VR_PATHWAY'
  'scanner content'  = 'ScannerContent|ScannerPanel'
  'spatial SDK'      = 'AetherManager|com.meta.spatial'
  'camera2'          = 'PassthroughCamera|HEADSET_CAMERA|cameraId'
}
Write-Host "`n[quest-bv] logcat markers (${LogcatSeconds}s window):" -ForegroundColor Cyan
$hits = 0
foreach ($m in $markers.GetEnumerator()) {
  $found = $log | Select-String -Pattern $m.Value -Quiet
  if ($found) { $hits++; Write-Host ("    [x] {0}" -f $m.Key) -ForegroundColor Green }
  else        { Write-Host ("    [ ] {0}" -f $m.Key) -ForegroundColor DarkGray }
}
Write-Host "`n[quest-bv] on-device verify: $hits/$($markers.Count) markers present." -ForegroundColor $(if ($hits -ge 2) { 'Green' } else { 'Yellow' })
Write-Host "    NOTE: a launch event is NOT proof of a controlled scan (F.062 / W.783 integrity lesson) — markers prove the app initialized on-device, not that a QR was decoded." -ForegroundColor DarkGray
exit $(if ($hits -ge 2) { 0 } else { 1 })
