# HoloScript Native Hardware — Local Service Launcher
# Starts all HoloScript services locally for offline-capable development.
#
# Usage:
#   .\scripts\holoscript-local.ps1              # Start all services
#   .\scripts\holoscript-local.ps1 -Service mcp # Start only MCP server
#   .\scripts\holoscript-local.ps1 -Stop        # Stop all services
#
# Services:
#   MCP Server  — localhost:3000 (tools, compilers, simulation)
#   Store       — localhost:4873 (Verdaccio package registry)
#   Registry    — localhost:3001 (package API + team workspaces)

param(
    [ValidateSet("all", "mcp", "store", "registry")]
    [string]$Service = "all",
    [switch]$Stop,
    [switch]$Status
)

$ErrorActionPreference = "Continue"
$HoloRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $HoloRoot) { $HoloRoot = (Get-Location).Path }
# Fallback: if we're running from HoloScript root directly
if (Test-Path "$PSScriptRoot\..\package.json") {
    $HoloRoot = Resolve-Path "$PSScriptRoot\.."
}

$StorageDir = "$env:APPDATA\HoloScript\store"
$PidDir = "$env:APPDATA\HoloScript\pids"

# Load .env
$envFile = "$HoloRoot\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
    Write-Host "[env] Loaded $envFile" -ForegroundColor DarkGray
}

# Ensure directories
New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null
New-Item -ItemType Directory -Force -Path $PidDir | Out-Null

function Get-ServiceStatus {
    $services = @(
        @{ Name = "MCP Server"; Port = 3000; PidFile = "$PidDir\mcp.pid" },
        @{ Name = "Store";      Port = 4873; PidFile = "$PidDir\store.pid" },
        @{ Name = "Registry";   Port = 3001; PidFile = "$PidDir\registry.pid" }
    )
    foreach ($svc in $services) {
        $running = $false
        if (Test-Path $svc.PidFile) {
            $pid = Get-Content $svc.PidFile -ErrorAction SilentlyContinue
            if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
                $running = $true
            }
        }
        $portCheck = Test-NetConnection -ComputerName localhost -Port $svc.Port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        $portOpen = $portCheck.TcpTestSucceeded

        $status = if ($running -and $portOpen) { "RUNNING" }
                  elseif ($portOpen) { "PORT IN USE" }
                  else { "STOPPED" }
        $color = if ($status -eq "RUNNING") { "Green" } elseif ($status -eq "PORT IN USE") { "Yellow" } else { "Red" }
        Write-Host "  $($svc.Name.PadRight(12)) :$($svc.Port)  $status" -ForegroundColor $color
    }
}

function Stop-Service($name, $pidFile) {
    if (Test-Path $pidFile) {
        $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($pid) {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped $name (PID $pid)" -ForegroundColor Yellow
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

function Start-MCP {
    Write-Host "`n[MCP Server] Starting on :3000..." -ForegroundColor Cyan
    $distCheck = "$HoloRoot\packages\mcp-server\dist\http-server.js"
    if (-not (Test-Path $distCheck)) {
        Write-Host "  Building mcp-server first..." -ForegroundColor Yellow
        Push-Location "$HoloRoot\packages\mcp-server"
        & npm run build 2>&1 | Out-Null
        Pop-Location
    }
    $proc = Start-Process -FilePath "node" `
        -ArgumentList "$HoloRoot\packages\mcp-server\dist\http-server.js" `
        -WorkingDirectory "$HoloRoot\packages\mcp-server" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$PidDir\mcp.log" `
        -RedirectStandardError "$PidDir\mcp.err.log"
    $proc.Id | Out-File -FilePath "$PidDir\mcp.pid" -Force
    Write-Host "  MCP Server started (PID $($proc.Id)) — http://localhost:3000" -ForegroundColor Green
}

function Start-Store {
    Write-Host "`n[Store] Starting Verdaccio on :4873..." -ForegroundColor Cyan
    # Install deps if needed
    if (-not (Test-Path "$HoloRoot\packages\store\node_modules")) {
        Write-Host "  Installing store dependencies..." -ForegroundColor Yellow
        Push-Location "$HoloRoot\packages\store"
        & pnpm install 2>&1 | Out-Null
        Pop-Location
    }
    # Create default htpasswd if it doesn't exist
    $htpasswd = "$StorageDir\htpasswd"
    if (-not (Test-Path $htpasswd)) {
        # Create founder account (no password needed for local dev)
        "founder:`{SHA}placeholder" | Out-File -FilePath $htpasswd -Encoding utf8 -Force
        Write-Host "  Created default htpasswd at $htpasswd" -ForegroundColor DarkGray
    }
    $proc = Start-Process -FilePath "npx" `
        -ArgumentList "verdaccio", "--config", "$HoloRoot\packages\store\config.yaml" `
        -WorkingDirectory "$HoloRoot\packages\store" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$PidDir\store.log" `
        -RedirectStandardError "$PidDir\store.err.log"
    $proc.Id | Out-File -FilePath "$PidDir\store.pid" -Force
    Write-Host "  Store started (PID $($proc.Id)) — http://localhost:4873" -ForegroundColor Green
}

function Start-Registry {
    Write-Host "`n[Registry] Starting API on :3001..." -ForegroundColor Cyan
    $distCheck = "$HoloRoot\packages\registry\dist\server.js"
    if (-not (Test-Path $distCheck)) {
        Write-Host "  Building registry first..." -ForegroundColor Yellow
        Push-Location "$HoloRoot\packages\registry"
        & npm run build 2>&1 | Out-Null
        Pop-Location
    }
    $env:PORT = "3001"
    $proc = Start-Process -FilePath "node" `
        -ArgumentList "$HoloRoot\packages\registry\dist\server.js" `
        -WorkingDirectory "$HoloRoot\packages\registry" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$PidDir\registry.log" `
        -RedirectStandardError "$PidDir\registry.err.log"
    $proc.Id | Out-File -FilePath "$PidDir\registry.pid" -Force
    Write-Host "  Registry started (PID $($proc.Id)) — http://localhost:3001" -ForegroundColor Green
}

# ─── Main ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  HoloScript Native Hardware — Local Services" -ForegroundColor Magenta
Write-Host "  ============================================" -ForegroundColor DarkGray

if ($Status) {
    Write-Host ""
    Get-ServiceStatus
    Write-Host ""
    exit 0
}

if ($Stop) {
    Write-Host ""
    Stop-Service "MCP Server" "$PidDir\mcp.pid"
    Stop-Service "Store" "$PidDir\store.pid"
    Stop-Service "Registry" "$PidDir\registry.pid"
    Write-Host ""
    Write-Host "  All services stopped." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# Start requested services
switch ($Service) {
    "mcp"      { Start-MCP }
    "store"    { Start-Store }
    "registry" { Start-Registry }
    "all"      {
        Start-MCP
        Start-Store
        Start-Registry
    }
}

Write-Host ""
Write-Host "  ─── Status ───" -ForegroundColor DarkGray
Start-Sleep -Seconds 2
Get-ServiceStatus

Write-Host ""
Write-Host "  Store registry: http://localhost:4873" -ForegroundColor White
Write-Host "  MCP tools:      http://localhost:3000/health" -ForegroundColor White
Write-Host "  Registry API:   http://localhost:3001/health" -ForegroundColor White
Write-Host ""
Write-Host "  To publish:  npm publish --registry http://localhost:4873" -ForegroundColor DarkGray
Write-Host "  To install:  pnpm add @holoscript/core --registry http://localhost:4873" -ForegroundColor DarkGray
Write-Host "  To stop:     .\scripts\holoscript-local.ps1 -Stop" -ForegroundColor DarkGray
Write-Host "  To check:    .\scripts\holoscript-local.ps1 -Status" -ForegroundColor DarkGray
Write-Host ""
