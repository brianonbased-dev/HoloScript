[CmdletBinding()]
param(
  [string]$DeviceSerial,
  [string]$PackageName = "net.holoscript.qrscanner",
  [string]$OutputPath = ".scratch/holoqr-quest-capture.png",
  [string]$ReceiptPath,
  [string]$AdbPath,
  [string]$ScrcpyPath,
  [int]$WarmupMs = 1500,
  [switch]$BootstrapScrcpy,
  [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScrcpyVersion = "v4.1"
$ScrcpyArchiveName = "scrcpy-win64-v4.1.zip"
$ScrcpyDirectoryName = "scrcpy-win64-v4.1"
$ScrcpyUrl = "https://github.com/Genymobile/scrcpy/releases/download/v4.1/scrcpy-win64-v4.1.zip"
$ScrcpySha256 = "5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db"

function Resolve-AbsolutePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
}

function Invoke-NativeText {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $lines = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($lines | Out-String).Trim()
  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "Command failed ($exitCode): $FilePath $($Arguments -join ' ')`n$text"
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Text = $text
  }
}

function Get-QuestAppDisplayId {
  param(
    [Parameter(Mandatory = $true)][string]$DisplayDump,
    [Parameter(Mandatory = $true)][string]$OwnerPackage
  )

  $escapedPackage = [regex]::Escape($OwnerPackage)
  $blocks = [regex]::Matches(
    $DisplayDump,
    '(?ms)^\s*Display id (?<id>\d+): DisplayInfo\{(?<body>.*?)(?=^\s*Display id |\z)'
  )
  foreach ($block in $blocks) {
    $body = $block.Groups["body"].Value
    $ownsDisplay =
      $body -match "owner\s+$escapedPackage\b" -or
      $body -match "virtual:$escapedPackage,"
    $isVrSurface = $body -match '^"vr"' -or $body -match 'uniqueId\s+"virtual:[^"]+,vr,'
    if ($ownsDisplay -and $isVrSurface) {
      return [int]$block.Groups["id"].Value
    }
  }
  throw "No live VR display owned by $OwnerPackage was found. Launch the app before capturing."
}

function Resolve-ScrcpyExecutable {
  param(
    [string]$RequestedPath,
    [switch]$AllowBootstrap
  )

  if ($RequestedPath) {
    $requested = Resolve-AbsolutePath $RequestedPath
    if (-not (Test-Path -LiteralPath $requested -PathType Leaf)) {
      throw "scrcpy was not found at $requested"
    }
    return $requested
  }

  $command = Get-Command "scrcpy.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is unavailable; pass -ScrcpyPath explicitly."
  }
  $toolRoot = Join-Path $env:LOCALAPPDATA "HoloScript\tools\scrcpy"
  $versionRoot = Join-Path $toolRoot $ScrcpyDirectoryName
  $cachedExecutable = Join-Path $versionRoot "scrcpy.exe"
  if (Test-Path -LiteralPath $cachedExecutable -PathType Leaf) {
    return $cachedExecutable
  }
  if (-not $AllowBootstrap) {
    throw "scrcpy is missing. Re-run with -BootstrapScrcpy to fetch the pinned official build."
  }

  New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
  $archivePath = Join-Path $toolRoot $ScrcpyArchiveName
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    Invoke-WebRequest -UseBasicParsing -Uri $ScrcpyUrl -OutFile $archivePath
  }
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  if ($actualHash -ne $ScrcpySha256) {
    throw "Pinned scrcpy archive digest mismatch: expected $ScrcpySha256, got $actualHash"
  }
  if (-not (Test-Path -LiteralPath $cachedExecutable -PathType Leaf)) {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolRoot
  }
  if (-not (Test-Path -LiteralPath $cachedExecutable -PathType Leaf)) {
    throw "scrcpy extraction completed without producing $cachedExecutable"
  }
  return $cachedExecutable
}

function Resolve-AdbExecutable {
  param(
    [string]$RequestedPath,
    [string]$ResolvedScrcpyPath
  )

  if ($RequestedPath) {
    $requested = Resolve-AbsolutePath $RequestedPath
    if (-not (Test-Path -LiteralPath $requested -PathType Leaf)) {
      throw "adb was not found at $requested"
    }
    return $requested
  }

  $command = Get-Command "adb.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  if ($env:LOCALAPPDATA) {
    $questAdb = Join-Path $env:LOCALAPPDATA "platform-tools-quest\platform-tools\adb.exe"
    if (Test-Path -LiteralPath $questAdb -PathType Leaf) {
      return $questAdb
    }
  }

  $bundledAdb = Join-Path (Split-Path -Parent $ResolvedScrcpyPath) "adb.exe"
  if (Test-Path -LiteralPath $bundledAdb -PathType Leaf) {
    return $bundledAdb
  }
  throw "adb is missing. Pass -AdbPath or install Android platform-tools."
}

function Resolve-DeviceSerial {
  param(
    [string]$RequestedSerial,
    [Parameter(Mandatory = $true)][string]$ResolvedAdbPath
  )

  if ($RequestedSerial) {
    $state = Invoke-NativeText $ResolvedAdbPath @("-s", $RequestedSerial, "get-state")
    if ($state.Text -ne "device") {
      throw "Quest $RequestedSerial is not ready (state: $($state.Text))."
    }
    return $RequestedSerial
  }

  $devices = Invoke-NativeText $ResolvedAdbPath @("devices")
  $ready = @(
    $devices.Text -split "`r?`n" |
      Where-Object { $_ -match '^(?<serial>\S+)\s+device$' } |
      ForEach-Object { $Matches["serial"] }
  )
  if ($ready.Count -ne 1) {
    throw "Expected exactly one authorized ADB device; found $($ready.Count). Pass -DeviceSerial."
  }
  return $ready[0]
}

function Initialize-CaptureInterop {
  if (-not ("HoloQrCaptureNative" -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class HoloQrCaptureNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct Point {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out Rect rect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref Point point);
}
'@
  }
  Add-Type -AssemblyName System.Drawing
  [HoloQrCaptureNative]::SetProcessDPIAware() | Out-Null
}

function Save-WindowClientCapture {
  param(
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  Initialize-CaptureInterop
  $Process.Refresh()
  $handle = [IntPtr]$Process.MainWindowHandle
  if ($handle -eq [IntPtr]::Zero) {
    throw "scrcpy did not expose a capture window."
  }

  $rect = New-Object HoloQrCaptureNative+Rect
  if (-not [HoloQrCaptureNative]::GetClientRect($handle, [ref]$rect)) {
    throw "Could not read the scrcpy client rectangle."
  }
  $origin = New-Object HoloQrCaptureNative+Point
  if (-not [HoloQrCaptureNative]::ClientToScreen($handle, [ref]$origin)) {
    throw "Could not map the scrcpy client rectangle to the desktop."
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 512 -or $height -lt 512) {
    throw "Capture surface is unexpectedly small: ${width}x${height}"
  }

  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $size = New-Object System.Drawing.Size($width, $height)
    $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $size)

    $sampleColors = New-Object "System.Collections.Generic.HashSet[int]"
    for ($row = 1; $row -le 9; $row++) {
      for ($column = 1; $column -le 9; $column++) {
        $x = [Math]::Min($width - 1, [Math]::Floor($column * $width / 10))
        $y = [Math]::Min($height - 1, [Math]::Floor($row * $height / 10))
        [void]$sampleColors.Add($bitmap.GetPixel($x, $y).ToArgb())
      }
    }
    if ($sampleColors.Count -lt 4) {
      throw "Capture contained too little visual variation; the Quest surface may be blank."
    }

    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    return [pscustomobject]@{
      Width = $width
      Height = $height
      SampleColorCount = $sampleColors.Count
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Invoke-SelfTest {
  $fixture = @'
  Display id 0: DisplayInfo{"Built-in Screen", owner android}
  Display id 37: DisplayInfo{"vr", displayId 37, uniqueId "virtual:net.holoscript.qrscanner,10101,vr,0", owner net.holoscript.qrscanner}
  Display id 38: DisplayInfo{"other", displayId 38, owner net.holoscript.other}
'@
  $actual = Get-QuestAppDisplayId -DisplayDump $fixture -OwnerPackage "net.holoscript.qrscanner"
  if ($actual -ne 37) {
    throw "display parser self-test failed: expected 37, got $actual"
  }

  $failedClosed = $false
  try {
    [void](Get-QuestAppDisplayId -DisplayDump $fixture -OwnerPackage "net.holoscript.missing")
  } catch {
    $failedClosed = $true
  }
  if (-not $failedClosed) {
    throw "display parser self-test failed to reject a missing package"
  }

  [pscustomobject]@{
    schemaVersion = "holoscript.quest-capture-self-test.v0.1.0"
    ok = $true
    displayParser = "pass"
    missingOwner = "rejected"
  } | ConvertTo-Json -Depth 4
}

if ($SelfTest) {
  Invoke-SelfTest
  exit 0
}

$resolvedOutput = Resolve-AbsolutePath $OutputPath
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (-not $ReceiptPath) {
  $ReceiptPath = "$resolvedOutput.receipt.json"
}
$resolvedReceipt = Resolve-AbsolutePath $ReceiptPath
$receiptDirectory = Split-Path -Parent $resolvedReceipt
New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null

$resolvedScrcpy = Resolve-ScrcpyExecutable -RequestedPath $ScrcpyPath -AllowBootstrap:$BootstrapScrcpy
$resolvedAdb = Resolve-AdbExecutable -RequestedPath $AdbPath -ResolvedScrcpyPath $resolvedScrcpy
$resolvedSerial = Resolve-DeviceSerial -RequestedSerial $DeviceSerial -ResolvedAdbPath $resolvedAdb

$packagePath = Invoke-NativeText $resolvedAdb @("-s", $resolvedSerial, "shell", "pm", "path", $PackageName)
if (-not $packagePath.Text.StartsWith("package:")) {
  throw "$PackageName is not installed on Quest $resolvedSerial."
}
$appPid = Invoke-NativeText $resolvedAdb @("-s", $resolvedSerial, "shell", "pidof", $PackageName)
if (-not $appPid.Text) {
  throw "$PackageName is installed but not running. Launch it before capturing."
}

$displayDump = Invoke-NativeText $resolvedAdb @("-s", $resolvedSerial, "shell", "cmd", "display", "get-displays")
$displayId = Get-QuestAppDisplayId -DisplayDump $displayDump.Text -OwnerPackage $PackageName
$model = (Invoke-NativeText $resolvedAdb @("-s", $resolvedSerial, "shell", "getprop", "ro.product.model")).Text
$product = (Invoke-NativeText $resolvedAdb @("-s", $resolvedSerial, "shell", "getprop", "ro.product.name")).Text
$scrcpyVersionText = (Invoke-NativeText $resolvedScrcpy @("--version")).Text

$captureProcess = $null
try {
  $arguments = @(
    "--serial", $resolvedSerial,
    "--display-id=$displayId",
    "--no-audio",
    "--no-control",
    "--max-fps=30",
    "--window-x=0",
    "--window-y=0",
    "--window-width=1080",
    "--window-height=1080",
    "--window-title=HoloQR-Capture",
    "--always-on-top"
  )
  $captureProcess = Start-Process -FilePath $resolvedScrcpy -ArgumentList $arguments -PassThru
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    Start-Sleep -Milliseconds 100
    $captureProcess.Refresh()
    if ($captureProcess.HasExited) {
      throw "scrcpy exited before exposing the Quest surface."
    }
    if ($captureProcess.MainWindowHandle -ne 0) {
      break
    }
  }
  if ($captureProcess.MainWindowHandle -eq 0) {
    throw "Timed out waiting for the scrcpy capture window."
  }
  Start-Sleep -Milliseconds $WarmupMs
  $capture = Save-WindowClientCapture -Process $captureProcess -Destination $resolvedOutput
} finally {
  if ($captureProcess -and -not $captureProcess.HasExited) {
    [void]$captureProcess.CloseMainWindow()
    if (-not $captureProcess.WaitForExit(3000)) {
      Stop-Process -Id $captureProcess.Id -Force
    }
  }
}

$artifact = Get-Item -LiteralPath $resolvedOutput
if ($artifact.Length -lt 4096) {
  throw "Capture artifact is unexpectedly small: $($artifact.Length) bytes"
}
$artifactSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput).Hash.ToLowerInvariant()

$receipt = [ordered]@{
  schemaVersion = "holoscript.quest-capture-receipt.v0.1.0"
  kind = "QuestCaptureReceipt"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  device = [ordered]@{
    serial = $resolvedSerial
    model = $model
    product = $product
  }
  application = [ordered]@{
    package = $PackageName
    pid = [int]$appPid.Text
    packagePath = $packagePath.Text.Substring("package:".Length)
  }
  source = [ordered]@{
    kind = "app-owned-virtual-display"
    displayId = $displayId
    coverage = "HoloQR Compose panel rendered by the live Quest app"
    excludes = @(
      "Quest compositor",
      "passthrough background",
      "native world entities outside the app-owned panel"
    )
  }
  capture = [ordered]@{
    width = $capture.Width
    height = $capture.Height
    sampledColorCount = $capture.SampleColorCount
    warmupMs = $WarmupMs
  }
  tool = [ordered]@{
    name = "scrcpy"
    version = $ScrcpyVersion
    reportedVersion = ($scrcpyVersionText -split "`r?`n")[0]
    archiveSha256 = $ScrcpySha256
    officialSource = "https://github.com/Genymobile/scrcpy"
  }
  artifact = [ordered]@{
    path = $resolvedOutput
    bytes = $artifact.Length
    sha256 = $artifactSha256
  }
  validation = [ordered]@{
    packageInstalled = $true
    packageRunning = $true
    liveDisplayOwnedByPackage = $true
    nonBlankCapture = $true
    languageSourceGate = "Run pnpm check:holoqr-born-from-source separately before release attribution."
  }
}

$receiptJson = $receipt | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedReceipt -Value $receiptJson -Encoding UTF8
$receiptJson
