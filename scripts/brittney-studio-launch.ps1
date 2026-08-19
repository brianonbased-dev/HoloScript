#requires -version 5
<#
  brittney-studio-launch.ps1
  One-click "Brittney live + HoloShell operate-room canvas" — the REAL launcher for THIS
  stack (replaces the generic LiteLLM/.desktop draft, which targeted a different system).

  $0 BY DESIGN:
    * Jetson targets the sealed HoloLlama proxy as the sovereign local Brain/serving
      lane. Admission requires proxy attribution plus the expected NVMe0 model identity;
      legacy Ollama is not a readiness signal.
    * Messages land on the Jetson-hosted Brittney/HoloShell surface first.
    * The laptop is the reasoning workstation: Codex/HoloMesh peers inspect, decide,
      validate, and act through HoloShell + HoloMesh while the Jetson keeps the live surface.
    * The Vast fleet is SCALE-TO-ZERO — the serving autoscaler warms a box only on real
      inference demand and drains it on idle. NOTHING is provisioned at launch. No spend.
    * "Claude-level depth" is the model-policy CLOUD default (claude-opus-4-8) and is OPT-IN
      Anthropic-API SPEND — NOT wired here. Escalation is a model-policy config, not a launch flag.

  SAFE BY DESIGN: idempotent (starts only what's offline, no EADDRINUSE), hidden by default
  (no terminal pop), delegates daemon management to the existing receipt-anchored supervisor
  (F.101).

  Run:  powershell -ExecutionPolicy Bypass -File scripts\brittney-studio-launch.ps1
  (Pin a desktop shortcut to that command — see the README block at the bottom.)
#>

param(
  [switch]$Headless,    # OPTIONAL: boot the stack but don't open the UI surfaces (APIs-only).
  [switch]$NoTerminal,  # OPTIONAL: open the browser only; skip the laptop receipt freshness watcher.
  [switch]$OperatorTerminal # OPTIONAL: also open the persistent read-only operator terminal.
)
                          # NOTE: opening a browser to actually use a surface is FINE for anyone
                          # incl. agents (open -> use -> close). The real Desktop anti-pattern is
                          # FLASHING windows / program-output windows — handled by -WindowStyle
                          # Hidden on the SERVICE spawns below, not by refusing to open a browser.

$ErrorActionPreference = 'SilentlyContinue'
$Hololand    = Split-Path -Parent $PSScriptRoot           # repo root (this file is in scripts/)
$OperatePort = 8747
$HoloLlamaPackage = '@holoscript/holollama'
# Windows has no built-in mDNS resolver, so 'holojetson.local' does NOT resolve here --
# every call below would silently fail as a connection error indistinguishable from a
# model/service failure (ai-ecosystem/scripts/lib/resolve-jetson-endpoint.mjs, W.733).
# Use the LAN IP on this Windows launcher; it is DHCP-assigned and has flapped before
# (.114 -> .119) -- the SSOT is ai-ecosystem/config/sovereign-devices/jetson-orin.json's
# `ip` key, update here if it flaps again. mDNS stays fine for non-Windows callers.
$HoloLlamaEndpoint = 'http://192.168.0.119:18080'
$HoloLlamaHealth = 'http://192.168.0.119:18080/health'
$HoloLlamaModels = 'http://192.168.0.119:18080/v1/models'
$HoloLlamaProxyIdentity = 'holo-inference-proxy/v0'
$ExpectedHoloLlamaModel = '/mnt/nvme/holo/models/qwen3-4b-instruct.gguf'
$HoloLlamaMaxBodyBytes = 1048576
$JetsonSurface = 'http://192.168.0.119:8747'  # Jetson-HOSTED Brittney surface (systemd holoshell-surface)
$HoloScript  = Join-Path (Split-Path -Parent $Hololand) 'HoloScript'  # sibling repo — Studio lives here
$StudioPort  = 3101                                                   # Studio /create = BrittneyPlus (building)
$LaptopDesktopBridgePort = 8751

function Invoke-BoundedJsonProbe {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [int]$TimeoutSec = 4,
    [int]$MaxBodyBytes = 1048576
  )

  $ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  $cts = New-Object System.Threading.CancellationTokenSource
  $response = $null
  $stream = $null
  $buffered = $null
  try {
    $deadlineMs = $TimeoutSec * 1000
    $deadlineClock = [System.Diagnostics.Stopwatch]::StartNew()
    $cts.CancelAfter($deadlineMs)
    $requestTask = $client.GetAsync(
      $Uri,
      [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead,
      $cts.Token
    )
    $requestDeadline = [System.Threading.Tasks.Task]::Delay($deadlineMs)
    $requestCompleted = [System.Threading.Tasks.Task]::WhenAny(
      [System.Threading.Tasks.Task[]]@($requestTask, $requestDeadline)
    ).GetAwaiter().GetResult()
    if (-not [object]::ReferenceEquals($requestCompleted, $requestTask)) {
      $cts.Cancel()
      throw 'HoloLlama probe exceeded its wall-clock deadline'
    }
    $response = $requestTask.GetAwaiter().GetResult()
    $declaredLength = $response.Content.Headers.ContentLength
    if ($null -ne $declaredLength -and [long]$declaredLength -gt $MaxBodyBytes) {
      throw 'HoloLlama probe response exceeds the admitted body limit'
    }

    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $buffered = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 8192
    $totalBytes = 0
    while ($true) {
      $remainingMs = $deadlineMs - [int]$deadlineClock.ElapsedMilliseconds
      if ($remainingMs -le 0) {
        $cts.Cancel()
        throw 'HoloLlama probe exceeded its wall-clock deadline'
      }
      $readTask = $stream.ReadAsync($buffer, 0, $buffer.Length, $cts.Token)
      $readDeadline = [System.Threading.Tasks.Task]::Delay($remainingMs)
      $readCompleted = [System.Threading.Tasks.Task]::WhenAny(
        [System.Threading.Tasks.Task[]]@($readTask, $readDeadline)
      ).GetAwaiter().GetResult()
      if (-not [object]::ReferenceEquals($readCompleted, $readTask)) {
        $cts.Cancel()
        throw 'HoloLlama probe exceeded its wall-clock deadline'
      }
      $read = $readTask.GetAwaiter().GetResult()
      if ($read -le 0) { break }
      $totalBytes += $read
      if ($totalBytes -gt $MaxBodyBytes) {
        throw 'HoloLlama probe response exceeds the admitted body limit'
      }
      $buffered.Write($buffer, 0, $read)
    }

    $headerValues = $null
    $proxyValues = @()
    if ($response.Headers.TryGetValues('X-Holo-Proxy', [ref]$headerValues)) {
      $proxyValues = @($headerValues)
    }
    $bodyText = [System.Text.Encoding]::UTF8.GetString($buffered.ToArray())
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      ResponseUri = $response.RequestMessage.RequestUri.AbsoluteUri
      ProxyValues = $proxyValues
      Body = $bodyText | ConvertFrom-Json -ErrorAction Stop
      BodyBytes = $totalBytes
    }
  } finally {
    if ($null -ne $buffered) { $buffered.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $response) { $response.Dispose() }
    $cts.Dispose()
    $client.Dispose()
  }
}

function Test-LocalPort([int]$Port) {
  $c = New-Object Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $Port); $true } catch { $false } finally { $c.Close() }
}

function Quote-PowerShellSingle([string]$Value) {
  "'" + ($Value -replace "'", "''") + "'"
}

function Start-LaptopDesktopBridge {
  if (Test-LocalPort $LaptopDesktopBridgePort) { return $true }
  if (-not (Test-Path (Join-Path $Hololand 'scripts\holoshell-laptop-desktop-bridge.mjs'))) { return $false }

  $repo = Quote-PowerShellSingle $Hololand
  $port = $LaptopDesktopBridgePort
  $bridgeCommand = @"
Set-Location $repo
New-Item -ItemType Directory -Force .tmp\holoshell\desktop-control-bridge | Out-Null
Write-Host '[Brittney Studio] starting laptop desktop bridge...'
if (Get-Command node -ErrorAction SilentlyContinue) {
  node scripts\holoshell-laptop-desktop-bridge.mjs --host 127.0.0.1 --port $port *>> .tmp\holoshell\desktop-control-bridge\bridge-daemon.log
} else {
  Write-Host '[Brittney Studio] node unavailable; laptop desktop bridge not started.'
}
"@
  Start-Process powershell.exe -WorkingDirectory $Hololand -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $bridgeCommand
  )

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-LocalPort $LaptopDesktopBridgePort) { return $true }
  }
  return $false
}

# 0) Self-install the desktop icon if missing — so running this once (you OR an agent) gives
#    everyone easy click-access. Idempotent; never overwrites an existing shortcut.
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Brittney Studio.lnk'
if (-not (Test-Path $lnk)) {
  try {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
    $s.WorkingDirectory = $Hololand
    $icon = Join-Path $HoloScript 'packages\tauri-app\src-tauri\icons\icon.ico'
    if (Test-Path $icon) { $s.IconLocation = $icon }
    $s.Description = 'Brittney & Daimon (manage) + BrittneyPlus (build)'
    $s.Save()
  } catch {}
}

Write-Host '[Brittney Studio] the laptop is a SCREEN for the Jetson (founder 2026-06-17)...'

# The Jetson is the sovereign node — it HOSTS the Brittney surface itself (systemd
# holoshell-surface, always-on, $0: brain + agents + surface all on the Jetson). This
# launcher does not start a laptop Brittney serve; the laptop provides deeper
# reasoning, validation, and HoloMesh/HoloShell actions from its agent seats while it
# displays the Jetson.
# (Studio — the heavy Next.js build IDE — is a separate dev tool launched on its own,
# not part of this screen; it cannot run on the 8GB Jetson alongside the model.)

# 1) Jetson HoloLlama admitted proxy + NVMe0 model brain reachable?
$jetson = "Jetson HoloLlama target: $HoloLlamaPackage (admission pending at $HoloLlamaEndpoint)"
try {
  $healthResponse = Invoke-BoundedJsonProbe -Uri $HoloLlamaHealth -MaxBodyBytes $HoloLlamaMaxBodyBytes
  $modelsResponse = Invoke-BoundedJsonProbe -Uri $HoloLlamaModels -MaxBodyBytes $HoloLlamaMaxBodyBytes
  $healthBody = $healthResponse.Body
  $modelsBody = $modelsResponse.Body
  $healthProxyValues = @($healthResponse.ProxyValues)
  $modelsProxyValues = @($modelsResponse.ProxyValues)
  $healthStatusProperties = @($healthBody.PSObject.Properties | Where-Object { $_.Name -ceq 'status' })
  $modelsObjectProperties = @($modelsBody.PSObject.Properties | Where-Object { $_.Name -ceq 'object' })
  $modelsDataProperties = @($modelsBody.PSObject.Properties | Where-Object { $_.Name -ceq 'data' })
  $healthShapeOk = $healthBody -is [System.Management.Automation.PSCustomObject] -and $healthStatusProperties.Count -eq 1
  $modelsShapeOk = (
    $modelsBody -is [System.Management.Automation.PSCustomObject] -and
    $modelsObjectProperties.Count -eq 1 -and
    $modelsDataProperties.Count -eq 1
  )
  $healthStatus = if ($healthShapeOk) { [string]$healthStatusProperties[0].Value } else { $null }
  $modelsObject = if ($modelsShapeOk) { [string]$modelsObjectProperties[0].Value } else { $null }
  $modelsData = $null
  if ($modelsShapeOk) {
    $modelsData = $modelsDataProperties[0].Value
  }
  $modelsDataIsArray = $modelsShapeOk -and $modelsData -is [System.Array]
  $modelIds = @()
  $modelEntriesHaveExactId = $false
  if ($modelsDataIsArray) {
    $modelEntries = @($modelsData)
    if ($modelEntries.Count -eq 1 -and $modelEntries[0] -is [System.Management.Automation.PSCustomObject]) {
      $modelIdProperties = @($modelEntries[0].PSObject.Properties | Where-Object { $_.Name -ceq 'id' })
      if ($modelIdProperties.Count -eq 1) {
        $modelEntriesHaveExactId = $true
        $modelIds = @([string]$modelIdProperties[0].Value)
      }
    }
  }
  $proxyIdentityOk = (
    $healthProxyValues.Count -eq 1 -and
    $modelsProxyValues.Count -eq 1 -and
    $healthProxyValues[0] -ceq $HoloLlamaProxyIdentity -and
    $modelsProxyValues[0] -ceq $HoloLlamaProxyIdentity
  )
  $modelIdentityOk = $modelsDataIsArray -and $modelEntriesHaveExactId -and $modelIds.Count -eq 1 -and $modelIds[0] -ceq $ExpectedHoloLlamaModel
  if (
    $healthResponse.StatusCode -eq 200 -and
    $modelsResponse.StatusCode -eq 200 -and
    $healthResponse.ResponseUri -ceq $HoloLlamaHealth -and
    $modelsResponse.ResponseUri -ceq $HoloLlamaModels -and
    $healthShapeOk -and
    $modelsShapeOk -and
    $healthStatus -ceq 'ok' -and
    $modelsObject -ceq 'list' -and
    $proxyIdentityOk -and
    $modelIdentityOk
  ) {
    $jetson = "Jetson HoloLlama target: $HoloLlamaPackage (sealed proxy + NVMe0 brain OK)"
  } else {
    $jetson = "Jetson HoloLlama target: $HoloLlamaPackage (admission mismatch)"
  }
} catch {
  $jetson = "Jetson HoloLlama target: $HoloLlamaPackage (unreachable or invalid admission evidence)"
}

# 2) Jetson-hosted Brittney surface reachable?
$surfaceUp = $false
try { $surfaceUp = (Invoke-WebRequest -Uri "$JetsonSurface/" -TimeoutSec 6 -UseBasicParsing).StatusCode -eq 200 } catch {}
if (-not $surfaceUp) {
  Write-Host "[Brittney Studio] Jetson surface UNREACHABLE at $JetsonSurface."
  Write-Host '  It is a systemd service on the Jetson. If the Jetson is on, restart it:'
  Write-Host "    ssh -i `$HOME\.ssh\jetson_ed25519 username@holojetson.local 'sudo systemctl restart holoshell-surface'"
}

# 3) Start the laptop loopback bridge before the browser probes it.
$bridgeUp = Start-LaptopDesktopBridge
if (-not $bridgeUp) {
  Write-Host "[Brittney Studio] laptop desktop bridge unavailable on 127.0.0.1:$LaptopDesktopBridgePort."
}

# 4) Open the screen onto the Jetson (skip with -Headless / APIs-only).
if (-not $Headless) { Start-Process $JetsonSurface }

# 5) Keep the paired read-only laptop receipts fresh. This stays hidden by default so desktop
#    shortcuts and agent-triggered launches do not create surprise terminal windows. A visible,
#    persistent operator terminal is still available with -OperatorTerminal. Append watcher
#    output so repeat launches preserve verifier history instead of flattening the receipt log.
$RefreshOperatorReceipt = (-not $Headless) -and (-not $NoTerminal)
$ShowOperatorTerminal = $RefreshOperatorReceipt -and $OperatorTerminal
if ($OperatorTerminal -and $NoTerminal) {
  Write-Host '[Brittney Studio] -NoTerminal supplied; skipping visible operator terminal.'
}

if ($RefreshOperatorReceipt) {
  $repo = Quote-PowerShellSingle $Hololand
  $watchCommand = @"
Set-Location $repo
New-Item -ItemType Directory -Force .tmp\holoshell | Out-Null
Write-Host '[Brittney Studio] starting read-only receipt freshness watcher...'
if ((Test-Path (Join-Path (Get-Location) 'scripts\holoshell-laptop-receipt-freshness.mjs')) -and (Get-Command node -ErrorAction SilentlyContinue)) {
  node scripts\holoshell-laptop-receipt-freshness.mjs --watch --interval-ms 60000 --timeout-ms 60000 --json *>> .tmp\holoshell\laptop-receipt-freshness-watch.log
} elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
  `$env:CI = 'true'
  pnpm run holoshell:laptop-receipt-freshness -- --watch --interval-ms 60000 --timeout-ms 60000 --json *>> .tmp\holoshell\laptop-receipt-freshness-watch.log
} else {
  corepack pnpm run holoshell:laptop-receipt-freshness -- --watch --interval-ms 60000 --timeout-ms 60000 --json *>> .tmp\holoshell\laptop-receipt-freshness-watch.log
}
"@
  Start-Process powershell.exe -WorkingDirectory $Hololand -WindowStyle Hidden -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $watchCommand
  )

  if ($ShowOperatorTerminal) {
    $terminalCommand = @"
Set-Location $repo
Write-Host '[Brittney Studio] browser cockpit: $JetsonSurface'
Write-Host '[Brittney Studio] read-only receipt freshness watcher: .tmp/holoshell/laptop-receipt-freshness-watch.log'
if ((Test-Path (Join-Path (Get-Location) 'scripts\holoshell-operator-terminal.mjs')) -and (Get-Command node -ErrorAction SilentlyContinue)) {
  node scripts\holoshell-operator-terminal.mjs
} elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
  `$env:CI = 'true'
  pnpm run holoshell:operator-terminal
} else {
  corepack pnpm run holoshell:operator-terminal
}
Write-Host ''
Write-Host '[Brittney Studio] receipt: .tmp/holoshell/operator-terminal.json'
"@
    Start-Process powershell.exe -WorkingDirectory $Hololand -WindowStyle Normal -ArgumentList @(
      '-NoExit',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      $terminalCommand
    )
  }
}

Write-Host "[Brittney Studio] surface: $(if($surfaceUp){'OK'}else{'DOWN'}) ($JetsonSurface) | $jetson | brain+agents+surface all on the Jetson (`$0)"

<#
  -------------------------------------------------------------------------------------------
  MAKE THE ONE-CLICK DESKTOP ICON (run once, in PowerShell):

    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Brittney Studio.lnk")
    $lnk.TargetPath  = "powershell.exe"
    $lnk.Arguments   = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($PWD)\scripts\brittney-studio-launch.ps1`""
    $lnk.WorkingDirectory = "$PWD"
    $lnk.IconLocation = "$PWD\packages\holoshell\dist\brittney.ico"   # optional; any .ico
    $lnk.Save()

  Double-click "Brittney Studio" -> the whole $0 hybrid comes up hidden, opens the HoloShell
  canvas, and keeps the laptop receipts fresh without a visible terminal. Add -OperatorTerminal
  to the shortcut arguments when you explicitly want the persistent terminal projection.
  (An F9 global hotkey needs AutoHotkey or the shortcut's "Shortcut key" field.)
  -------------------------------------------------------------------------------------------
#>
