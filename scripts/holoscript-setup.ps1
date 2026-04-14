# HoloScript Native Hardware Setup - Replication Script
# Transforms any Windows machine into a HoloScript-native appliance in <30 min.

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host "`n  #################################################" -ForegroundColor Cyan
    Write-Host "  #          HoloScript Native Hardware           #" -ForegroundColor Cyan
    Write-Host "  #            Replication Protocol               #" -ForegroundColor Cyan
    Write-Host "  #################################################`n" -ForegroundColor Cyan
}

function Check-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error "This script must be run as Administrator."
    }
}

function Install-Prerequisites {
    Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Gray
    
    # Check Winget
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget not found. Please install the App Installer from the Windows Store."
    }

    $deps = @{
        "git"    = "Git.Git"
        "node"   = "OpenJS.NodeJS.LTS"
    }

    foreach ($dep in $deps.Keys) {
        if (-not (Get-Command $dep -ErrorAction SilentlyContinue)) {
            Write-Host "Installing $dep..." -ForegroundColor Yellow
            winget install --id $deps[$dep] --silent --accept-package-agreements --accept-source-agreements
        } else {
            Write-Host "✓ $dep is already installed." -ForegroundColor Green
        }
    }

    # Install pnpm
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "Installing pnpm..." -ForegroundColor Yellow
        npm install -g pnpm
    } else {
        Write-Host "✓ pnpm is already installed." -ForegroundColor Green
    }
}

function Setup-HoloScript {
    Write-Host "[2/5] Setting up HoloScript Core..." -ForegroundColor Gray
    $repoUrl = "https://github.com/brianonbased-dev/HoloScript.git"
    $targetPath = "$env:USERPROFILE\Documents\GitHub\HoloScript"

    if (-not (Test-Path $targetPath)) {
        Write-Host "Cloning repo to $targetPath..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path (Split-Path $targetPath) | Out-Null
        git clone $repoUrl $targetPath
    }

    Set-Location $targetPath
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pnpm install
    
    Write-Host "Building ecosystem..." -ForegroundColor Yellow
    pnpm build
}

function Register-FileAssociations {
    Write-Host "[3/5] Registering HoloScript file associations..." -ForegroundColor Gray
    $extensions = @(".holo", ".hs", ".hsplus")
    $cliPath = "npx hs" # Execute via npx to prevent phantom command issues

    foreach ($ext in $extensions) {
        $progId = "HoloScript.Source.$($ext.TrimStart('.'))"
        cmd /c "assoc $ext=$progId"
        cmd /c "ftype $progId=`"$cliPath`" run `"%1`""
        Write-Host "✓ Registered $ext" -ForegroundColor Green
    }
}

function Configure-Registry {
    Write-Host "[4/5] Configuring HoloMesh Registry..." -ForegroundColor Gray
    $registryUrl = "https://store.holoscript.net"
    npm config set @holoscript:registry $registryUrl
    pnpm config set @holoscript:registry $registryUrl
    Write-Host "✓ Registry set to $registryUrl" -ForegroundColor Green
}

function Finalize-Identity {
    Write-Host "[5/5] Finalizing Identity Layer..." -ForegroundColor Gray
    
    # Set global HoloMesh endpoint
    [Environment]::SetEnvironmentVariable("HOLOMESH_ENDPOINT", "https://mcp.holoscript.net", "User")
    
    Write-Host "`n✓ Transformation Complete!" -ForegroundColor Cyan
    Write-Host "Your machine is now a HoloScript-native appliance."
    Write-Host "Run 'hs login' to authenticate with your agent key.`n"
}

# Execution
Write-Banner
Check-Admin
Install-Prerequisites
Setup-HoloScript
Register-FileAssociations
Configure-Registry
Finalize-Identity
