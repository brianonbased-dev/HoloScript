#requires -version 5
<#
  deploy-holoshell-to-jetson.ps1

  Windows-native HoloShell deploy wrapper for the default Codex PowerShell shell.
  It mirrors scripts/deploy-holoshell-to-jetson.sh, but resolves node, Windows
  OpenSSH, the Jetson key, and holojetson.local/IP fallback without depending on
  WSL or Git Bash path behavior.
#>

[CmdletBinding()]
param(
  [switch]$Restart,
  [switch]$VerifyChat,
  [switch]$PlanOnly,
  [switch]$Json,
  [string]$JetsonHost = $env:JETSON_HOST,
  [string]$JetsonIp = $env:JETSON_IP,
  [string]$JetsonUser = $env:JETSON_USER,
  [string]$JetsonKey = $env:JETSON_KEY,
  [string]$NodeBin = $env:NODE_BIN,
  [string]$HoloScriptRepo = $env:HOLOSCRIPT_REPO,
  [string]$ModelLibraryPath = $env:HOLOSHELL_MODEL_LIBRARY_PATH,
  [string]$RemoteRoot = '/mnt/nvme/holo/holoscript-root',
  [string]$RemoteSurface = '/mnt/nvme/holo/holoshell-surface',
  [int]$ChatTimeoutSec = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Hololand = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($HoloScriptRepo)) {
  $HoloScriptRepo = Join-Path (Split-Path -Parent $Hololand) 'HoloScript'
}
if ([string]::IsNullOrWhiteSpace($ModelLibraryPath)) {
  $ModelLibraryPath = Join-Path $env:USERPROFILE '.ai-ecosystem\model-library\library.json'
}
if ([string]::IsNullOrWhiteSpace($JetsonUser)) {
  $JetsonUser = 'username'
}
if ([string]::IsNullOrWhiteSpace($JetsonIp)) {
  $JetsonIp = '192.168.0.119'
}

function Write-Deploy {
  param([string]$Message)
  if (-not $Json) {
    Write-Host "[deploy] $Message"
  }
}

function Resolve-CommandPath {
  param([string[]]$Names, [string]$Configured)
  if (-not [string]::IsNullOrWhiteSpace($Configured)) {
    return $Configured
  }
  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  throw "Required command not found: $($Names -join ', ')"
}

function Test-NameResolves {
  param([string]$Name)
  try {
    [Net.Dns]::GetHostAddresses($Name) | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Resolve-JetsonTarget {
  param([string]$HostValue, [string]$UserValue, [string]$IpValue)
  if (-not [string]::IsNullOrWhiteSpace($HostValue)) {
    if ($HostValue -match '@') {
      return @{
        Target = $HostValue
        HostPart = ($HostValue -replace '^[^@]+@', '')
        Mode = 'explicit-host'
      }
    }
    return @{
      Target = "$UserValue@$HostValue"
      HostPart = $HostValue
      Mode = 'explicit-host'
    }
  }

  $mdnsName = 'holojetson.local'
  if (Test-NameResolves $mdnsName) {
    return @{
      Target = "$UserValue@$mdnsName"
      HostPart = $mdnsName
      Mode = 'mdns'
    }
  }

  return @{
    Target = "$UserValue@$IpValue"
    HostPart = $IpValue
    Mode = 'ip-fallback'
  }
}

function Resolve-JetsonKey {
  param([string]$Configured)
  if (-not [string]::IsNullOrWhiteSpace($Configured)) {
    return $Configured
  }
  return Join-Path $env:USERPROFILE '.ssh\jetson_ed25519'
}

function Assert-LocalPath {
  param([string]$PathValue, [string]$Label, [switch]$Optional)
  if (-not (Test-Path -LiteralPath $PathValue)) {
    if ($Optional) {
      return $false
    }
    throw "$Label not found: $PathValue"
  }
  return $true
}

function Join-RemotePath {
  param([string]$Base, [string]$Child)
  return ($Base.TrimEnd('/') + '/' + $Child.TrimStart('/'))
}

function Quote-RemotePath {
  param([string]$Value)
  if ($Value -match "[`r`n`0']") {
    throw 'remote path contains forbidden characters'
  }
  return "'$Value'"
}

function Get-RemoteDestinationDirectory {
  param([string]$Destination)
  $normalized = $Destination.Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    throw 'remote destination is empty'
  }
  if ($normalized.EndsWith('/')) {
    return $normalized.TrimEnd('/')
  }
  $lastSlash = $normalized.LastIndexOf('/')
  if ($lastSlash -le 0) {
    throw "remote destination has no parent directory: $Destination"
  }
  return $normalized.Substring(0, $lastSlash)
}

function Ensure-RemoteDirectory {
  param([string]$RemotePath)
  $normalized = $RemotePath.Trim()
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    throw 'remote directory is empty'
  }
  [void](Invoke-Remote ("mkdir -p " + (Quote-RemotePath $normalized)))
}

function Quote-NativeArgument {
  param([string]$Value)
  if ($Value.Length -eq 0) {
    return '""'
  }
  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $result = '"'
  $backslashes = 0
  foreach ($char in [char[]]$Value) {
    if ($char -eq '\') {
      $backslashes += 1
    } elseif ($char -eq '"') {
      $result += ('\' * (($backslashes * 2) + 1))
      $result += '"'
      $backslashes = 0
    } else {
      if ($backslashes -gt 0) {
        $result += ('\' * $backslashes)
        $backslashes = 0
      }
      $result += $char
    }
  }
  if ($backslashes -gt 0) {
    $result += ('\' * ($backslashes * 2))
  }
  $result += '"'
  return $result
}

function Join-NativeArguments {
  param([string[]]$Arguments)
  return (($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join ' ')
}

function Invoke-External {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$TimeoutSec = 120
  )
  $stdoutPath = [IO.Path]::GetTempFileName()
  $stderrPath = [IO.Path]::GetTempFileName()
  try {
    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList (Join-NativeArguments $Arguments) `
      -WorkingDirectory $Hololand `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -WindowStyle Hidden `
      -PassThru

    if (-not $process.WaitForExit($TimeoutSec * 1000)) {
      $process.Kill()
      throw "$FilePath timed out after ${TimeoutSec}s"
    }

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue } else { '' }
    $exitCode = $process.ExitCode
    if ($null -eq $exitCode -or "$exitCode" -eq '') {
      $exitCode = if ([string]::IsNullOrWhiteSpace($stderr)) { 0 } else { 1 }
    }
    if ([int]$exitCode -ne 0) {
      $detail = (($stderr, $stdout) -join "`n").Trim()
      throw "$FilePath exited ${exitCode}: $detail"
    }
    return @{
      Stdout = $stdout
      Stderr = $stderr
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function New-SshArgs {
  param([string]$KeyPath)
  return @(
    '-i', $KeyPath,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=accept-new'
  )
}

function Invoke-Remote {
  param([string]$Command)
  $args = @()
  $args += New-SshArgs $script:ResolvedJetsonKey
  $args += $script:Jetson.Target
  $args += $Command
  return Invoke-External -FilePath $script:SshBin -Arguments $args -TimeoutSec 180
}

function Get-LocalSha256 {
  param([string]$PathValue)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $PathValue).Hash.ToLowerInvariant()
}

function Get-RemoteSha256 {
  param([string]$RemotePath)
  $result = Invoke-Remote ("sha256sum " + (Quote-RemotePath $RemotePath))
  $hash = (($result.Stdout -split '\s+') | Where-Object { $_ } | Select-Object -First 1)
  if ($hash -notmatch '^[a-fA-F0-9]{64}$') {
    throw "remote sha256sum did not return a sha256 for $RemotePath"
  }
  return $hash.ToLowerInvariant()
}

function Test-JetsonChatWrapperParity {
  $pairs = @(
    @{
      Name = 'holoshell-serve'
      RelativePath = 'packages/holoshell/serve.mjs'
      LocalPath = Join-Path $Hololand 'packages\holoshell\serve.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'packages/holoshell/serve.mjs'
    },
    @{
      Name = 'brittney-turn'
      RelativePath = 'scripts/holoshell-brittney-turn.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-brittney-turn.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-brittney-turn.mjs'
    },
    @{
      Name = 'sovereign-room-marathon'
      RelativePath = 'scripts/holoshell-sovereign-room-marathon.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-sovereign-room-marathon.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-sovereign-room-marathon.mjs'
    },
    @{
      Name = 'control-daemon'
      RelativePath = 'scripts/holoshell-control-daemon.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-control-daemon.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-control-daemon.mjs'
    },
    @{
      Name = 'holoclaw-runtime-bridge'
      RelativePath = 'scripts/holoshell-holoclaw-runtime-bridge.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-holoclaw-runtime-bridge.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-holoclaw-runtime-bridge.mjs'
    },
    @{
      Name = 'terminal-event-stream'
      RelativePath = 'scripts/holoshell-terminal-event-stream.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-terminal-event-stream.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-terminal-event-stream.mjs'
    },
    @{
      Name = 'build-custody'
      RelativePath = 'scripts/holoshell-build-custody.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-build-custody.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-build-custody.mjs'
    },
    @{
      Name = 'workflow-approval-bundle'
      RelativePath = 'scripts/holoshell-workflow-approval-bundle.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-workflow-approval-bundle.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-workflow-approval-bundle.mjs'
    },
    @{
      Name = 'agent-lanes'
      RelativePath = 'scripts/holoshell-agent-lanes.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-agent-lanes.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-agent-lanes.mjs'
    },
    @{
      Name = 'receipt-control'
      RelativePath = 'scripts/holoshell-receipt-control.mjs'
      LocalPath = Join-Path $Hololand 'scripts\holoshell-receipt-control.mjs'
      RemotePath = Join-RemotePath $RemoteSurface 'scripts/holoshell-receipt-control.mjs'
    },
  @{
    Name = 'browser-terminal-coupling-source'
    RelativePath = 'apps/holoshell/source/holoshell-browser-terminal-coupling.hsplus'
    LocalPath = Join-Path $Hololand 'apps\holoshell\source\holoshell-browser-terminal-coupling.hsplus'
    RemotePath = Join-RemotePath $RemoteSurface 'apps/holoshell/source/holoshell-browser-terminal-coupling.hsplus'
  },
  @{
    Name = 'brittney-runtime-bridge-source'
    RelativePath = 'apps/holoshell/source/holoshell-brittney-runtime-bridge.hsplus'
    LocalPath = Join-Path $Hololand 'apps\holoshell\source\holoshell-brittney-runtime-bridge.hsplus'
    RemotePath = Join-RemotePath $RemoteSurface 'apps/holoshell/source/holoshell-brittney-runtime-bridge.hsplus'
  },
  @{
    Name = 'operator-terminal-source'
    RelativePath = 'apps/holoshell/source/holoshell-operator-terminal.hsplus'
      LocalPath = Join-Path $Hololand 'apps\holoshell\source\holoshell-operator-terminal.hsplus'
      RemotePath = Join-RemotePath $RemoteSurface 'apps/holoshell/source/holoshell-operator-terminal.hsplus'
    }
  )

  $checks = @()
  foreach ($pair in $pairs) {
    $localHash = Get-LocalSha256 $pair.LocalPath
    $remoteHash = Get-RemoteSha256 $pair.RemotePath
    $matches = $localHash -eq $remoteHash
    $checks += [ordered]@{
      name = $pair.Name
      relativePath = $pair.RelativePath
      localSha256 = $localHash
      remoteSha256 = $remoteHash
      matches = $matches
      remotePath = $pair.RemotePath
    }
  }

  $mismatches = @($checks | Where-Object { -not $_.matches })
  if ($mismatches.Count -gt 0) {
    $details = ($mismatches | ForEach-Object { "$($_.relativePath) local=$($_.localSha256) remote=$($_.remoteSha256)" }) -join '; '
    throw "Jetson chat wrapper parity mismatch after deploy: $details"
  }

  return $checks
}

function Copy-ToJetson {
  param(
    [string]$Source,
    [string]$Destination,
    [switch]$Recursive
  )
  Ensure-RemoteDirectory (Get-RemoteDestinationDirectory $Destination)
  $args = @()
  $args += New-SshArgs $script:ResolvedJetsonKey
  if ($Recursive) {
    $args += '-r'
  }
  $args += '-q'
  $args += $Source
  $args += "$($script:Jetson.Target):$Destination"
  [void](Invoke-External -FilePath $script:ScpBin -Arguments $args -TimeoutSec 180)
}

function Invoke-ChatReceipt {
  param([string]$HostPart)
  $uri = "http://${HostPart}:8747/api/brittney/chat"
  $body = @{
    message = 'Brittney deploy verification: confirm the Jetson HoloShell surface restarted and can answer through the live chat route.'
    source = 'deploy-holoshell-to-jetson.ps1'
    verification = 'jetson_deploy_wrapper_parity'
  } | ConvertTo-Json -Depth 5
  try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Body $body -TimeoutSec $ChatTimeoutSec
    $propertyNames = @($response.PSObject.Properties | ForEach-Object { $_.Name })
    $responseStatus = 'unknown'
    if ($propertyNames -contains 'summary' -and $response.summary) {
      $summaryNames = @($response.summary.PSObject.Properties | ForEach-Object { $_.Name })
      if ($summaryNames -contains 'status' -and $response.summary.status) {
        $responseStatus = $response.summary.status
      }
    } elseif ($propertyNames -contains 'status' -and $response.status) {
      $responseStatus = $response.status
    } elseif ($propertyNames -contains 'ok' -and $response.ok) {
      $responseStatus = 'ok'
    } elseif ($propertyNames -contains 'message' -and $response.message) {
      $responseStatus = 'message'
    }
    return @{
      status = 'pass'
      uri = $uri
      responseStatus = $responseStatus
      rawResponseIncluded = $false
    }
  } catch {
    return @{
      status = 'fail'
      uri = $uri
      error = $_.Exception.Message
      rawResponseIncluded = $false
    }
  }
}

$SshBin = Resolve-CommandPath -Names @('ssh.exe', 'ssh') -Configured ''
$ScpBin = Resolve-CommandPath -Names @('scp.exe', 'scp') -Configured ''
$NodeBin = Resolve-CommandPath -Names @('node.exe', 'node') -Configured $NodeBin
$ResolvedJetsonKey = Resolve-JetsonKey $JetsonKey
$Jetson = Resolve-JetsonTarget -HostValue $JetsonHost -UserValue $JetsonUser -IpValue $JetsonIp
$FounderFixture = Join-Path $Hololand '.tmp\holoshell\founder-prompt-fixtures.json'
$FixtureScript = Join-Path $Hololand 'scripts\holoshell-founder-prompt-fixtures.mjs'

$copyPlan = @(
  @{ Source = Join-Path $HoloScriptRepo 'packages\aibrittney\dist'; Destination = Join-RemotePath $RemoteRoot 'packages/aibrittney/'; Recursive = $true; Required = $true },
  @{ Source = Join-Path $HoloScriptRepo 'packages\llm-provider\dist'; Destination = Join-RemotePath $RemoteRoot 'packages/llm-provider/'; Recursive = $true; Required = $true },
  @{ Source = Join-Path $HoloScriptRepo 'packages\holollama\dist'; Destination = Join-RemotePath $RemoteRoot 'packages/holollama/'; Recursive = $true; Required = $true },
  @{ Source = Join-Path $HoloScriptRepo 'compositions\model-fleet.hsplus'; Destination = Join-RemotePath $RemoteRoot 'compositions/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $HoloScriptRepo 'compositions\skills'; Destination = Join-RemotePath $RemoteRoot 'compositions/'; Recursive = $true; Required = $true },
  @{ Source = Join-Path $Hololand 'packages\holoshell\serve.mjs'; Destination = Join-RemotePath $RemoteSurface 'packages/holoshell/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'packages\holoshell\dist\operate-room.html'; Destination = Join-RemotePath $RemoteSurface 'packages/holoshell/dist/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-brittney-turn.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-sovereign-room-marathon.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-control-daemon.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-holoclaw-runtime-bridge.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-terminal-event-stream.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-build-custody.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-workflow-approval-bundle.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-agent-lanes.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-receipt-control.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-operator-terminal.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-desktop-control-plan.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-agent-dispatch.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'scripts\holoshell-founder-prompt-fixtures.mjs'; Destination = Join-RemotePath $RemoteSurface 'scripts/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-brittney-desktop-cockpit.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-brittney-runtime-bridge.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-sovereign-room-marathon.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-holoclaw-runtime-bridge.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-founder-prompt-fixtures.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-agent-dispatch.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-brittney-operator-chat.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-browser-terminal-coupling.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = Join-Path $Hololand 'apps\holoshell\source\holoshell-operator-terminal.hsplus'; Destination = Join-RemotePath $RemoteSurface 'apps/holoshell/source/'; Recursive = $false; Required = $true },
  @{ Source = $FounderFixture; Destination = Join-RemotePath $RemoteSurface '.tmp/holoshell/founder-prompt-fixtures.json'; Recursive = $false; Required = $true },
  @{ Source = $ModelLibraryPath; Destination = Join-RemotePath $RemoteSurface 'model-library/library.json'; Recursive = $false; Required = $false }
)

$receipt = [ordered]@{
  schemaVersion = 'hololand.holoshell.jetson-deploy-wrapper.v0.1.0'
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  summary = [ordered]@{
    target = $Jetson.Target
    hostResolution = $Jetson.Mode
    restartRequested = [bool]$Restart
    verifyChatRequested = [bool]($VerifyChat -or $Restart)
    planOnly = [bool]$PlanOnly
    copiedCount = 0
    parityStatus = 'not_checked'
    parityCheckedCount = 0
    serviceStatus = 'not_requested'
    chatStatus = 'not_requested'
  }
  policy = [ordered]@{
    mutationRequiresRestartFlag = $true
    jetsonChatWrapperParityRequired = $true
    sshBatchMode = $true
    strictHostKeyChecking = 'accept-new'
    sshKeyPathIncluded = $false
    rawChatResponseIncluded = $false
  }
  resolved = [ordered]@{
    node = (Split-Path -Leaf $NodeBin)
    ssh = (Split-Path -Leaf $SshBin)
    scp = (Split-Path -Leaf $ScpBin)
    sshKeyConfigured = -not [string]::IsNullOrWhiteSpace($ResolvedJetsonKey)
    sshKeyPathIncluded = $false
    hololand = ($Hololand -replace '\\', '/')
    holoscript = ($HoloScriptRepo -replace '\\', '/')
    remoteRoot = $RemoteRoot
    remoteSurface = $RemoteSurface
  }
}

if ($PlanOnly) {
  $receipt.summary.copiedCount = ($copyPlan | Where-Object { $_.Required -or (Test-Path -LiteralPath $_.Source) }).Count
  $receipt.summary.parityStatus = 'not_checked_plan_only'
  if ($Json) {
    $receipt | ConvertTo-Json -Depth 8
  } else {
    Write-Deploy "plan-only target=$($Jetson.Target) hostResolution=$($Jetson.Mode)"
  }
  exit 0
}

Assert-LocalPath -PathValue $ResolvedJetsonKey -Label 'Jetson SSH key' | Out-Null
Assert-LocalPath -PathValue $FixtureScript -Label 'fixture generator' | Out-Null
foreach ($entry in $copyPlan) {
  if ($entry.Source -eq $FounderFixture) {
    continue
  }
  Assert-LocalPath -PathValue $entry.Source -Label "deploy source $($entry.Source)" -Optional:(!$entry.Required) | Out-Null
}

Write-Deploy "HoloScript repo: $HoloScriptRepo"
Write-Deploy "Jetson target: $($Jetson.Target) ($($Jetson.Mode))"
Write-Deploy "ssh: $(Split-Path -Leaf $SshBin) | scp: $(Split-Path -Leaf $ScpBin) | key: <configured>"
Write-Deploy 'generating founder prompt fixtures ...'
[void](Invoke-External -FilePath $NodeBin -Arguments @(
  $FixtureScript,
  '--out', $FounderFixture,
  '--limit', ($env:HOLOSHELL_FOUNDER_PROMPT_LIMIT, '48' | Where-Object { $_ } | Select-Object -First 1),
  '--json'
) -TimeoutSec 300)

Write-Deploy 'ensuring Jetson layout under /mnt/nvme/holo ...'
$remoteDirs = @(
  Join-RemotePath $RemoteSurface 'packages/holoshell/dist',
  Join-RemotePath $RemoteSurface 'scripts',
  Join-RemotePath $RemoteSurface 'model-library',
  Join-RemotePath $RemoteSurface '.tmp/holoshell',
  Join-RemotePath $RemoteSurface 'apps/holoshell/source',
  Join-RemotePath $RemoteRoot 'packages/aibrittney',
  Join-RemotePath $RemoteRoot 'packages/llm-provider',
  Join-RemotePath $RemoteRoot 'packages/holollama',
  Join-RemotePath $RemoteRoot 'compositions/skills'
)
$mkdir = 'mkdir -p ' + (($remoteDirs | ForEach-Object { Quote-RemotePath $_ }) -join ' ')
[void](Invoke-Remote $mkdir)

Write-Deploy 'syncing platform-neutral dists + brain + native resources + surface ...'
foreach ($entry in $copyPlan) {
  if (-not (Test-Path -LiteralPath $entry.Source)) {
    if ($entry.Required) {
      throw "deploy source missing after fixture generation: $($entry.Source)"
    }
    Write-Deploy "model library not found at $($entry.Source); HoloLlama target will use installed-model fallback only"
    continue
  }
  Copy-ToJetson -Source $entry.Source -Destination $entry.Destination -Recursive:([bool]$entry.Recursive)
  $receipt.summary.copiedCount += 1
}

Write-Deploy 'checking Jetson chat wrapper parity ...'
$parity = Test-JetsonChatWrapperParity
$receipt.summary.parityStatus = 'pass'
$receipt.summary.parityCheckedCount = $parity.Count
$receipt.parity = $parity

if ($Restart) {
  Write-Deploy 'restarting holoshell-surface ...'
  $restartResult = Invoke-Remote 'sudo -n systemctl restart holoshell-surface && sleep 3 && printf active= && sudo systemctl is-active holoshell-surface'
  $receipt.summary.serviceStatus = (($restartResult.Stdout -split '\r?\n') | Where-Object { $_ } | Select-Object -Last 1)
}

if ($VerifyChat -or $Restart) {
  Write-Deploy 'verifying live /api/brittney/chat route ...'
  $chat = Invoke-ChatReceipt -HostPart $Jetson.HostPart
  $receipt.summary.chatStatus = $chat.status
  $receipt.chatReceipt = $chat
  if ($chat.status -ne 'pass') {
    throw "live chat verification failed: $($chat.error)"
  }
}

Write-Deploy "done -> http://$($Jetson.HostPart):8747"
if ($Json) {
  $receipt | ConvertTo-Json -Depth 8
}
