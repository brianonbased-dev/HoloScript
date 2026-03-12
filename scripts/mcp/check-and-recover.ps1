param(
    [string]$HealthUrl = "http://localhost:5567/health"
)

$ErrorActionPreference = "Stop"

function Test-MeshHealth {
    param([string]$Url)
    try {
        $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5
        return ($response.status -eq "ok" -or $response.healthy -eq $true)
    } catch {
        return $false
    }
}

if (Test-MeshHealth -Url $HealthUrl) {
    Write-Host "MCP mesh is healthy."
    exit 0
}

Write-Warning "MCP mesh is not healthy. Attempting recovery..."

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$orchestratorRoot = Resolve-Path (Join-Path $repoRoot "..\mcp-orchestrator") -ErrorAction SilentlyContinue

if (-not $orchestratorRoot) {
    Write-Error "Could not locate sibling mcp-orchestrator repository. Start orchestrator manually."
    exit 1
}

Push-Location $orchestratorRoot
try {
    npx tsx scripts/auto-start.ts --daemon | Out-Host
} finally {
    Pop-Location
}

Start-Sleep -Seconds 3

if (Test-MeshHealth -Url $HealthUrl) {
    Write-Host "MCP mesh recovered successfully."
    exit 0
}

Write-Error "Recovery attempted, but MCP mesh is still unhealthy."
exit 1
