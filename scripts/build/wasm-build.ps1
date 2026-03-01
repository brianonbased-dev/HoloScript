# =============================================================================
# Unified WASM Build Pipeline for HoloScript (Windows/PowerShell)
# =============================================================================
#
# Builds all WASM modules with a single command:
#   - spatial-engine-wasm   (wasm-pack / wasm-bindgen)
#   - compiler-wasm         (wasm-pack / wasm-bindgen)
#   - holoscript-component  (WASI Component Model: cargo + wasm-tools + jco)
#   - tree-sitter-holoscript (tree-sitter CLI)
#
# Usage:
#   .\scripts\build\wasm-build.ps1                           # Build all (release)
#   .\scripts\build\wasm-build.ps1 -Debug                    # Build all (debug)
#   .\scripts\build\wasm-build.ps1 -Module spatial            # Build one module
#   .\scripts\build\wasm-build.ps1 -Module compiler,component # Build multiple
#   .\scripts\build\wasm-build.ps1 -Parallel                  # Parallel builds
#   .\scripts\build\wasm-build.ps1 -Sizes                     # Report sizes
#   .\scripts\build\wasm-build.ps1 -CheckOnly                 # Check toolchain
#   .\scripts\build\wasm-build.ps1 -Clean                     # Clean artifacts
#
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Debug,
    [switch]$Parallel,
    [switch]$Sizes,
    [switch]$CheckOnly,
    [switch]$Clean,
    [string[]]$Module
)

$ErrorActionPreference = "Stop"

# -- Configuration -----------------------------------------------------------

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$PackagesDir = Join-Path $RepoRoot "packages"

$BuildMode = if ($Debug) { "debug" } else { "release" }

# Map module names to package directories
$ModuleMap = @{
    "spatial"    = "spatial-engine-wasm"
    "compiler"   = "compiler-wasm"
    "component"  = "holoscript-component"
    "treesitter" = "tree-sitter-holoscript"
}

$AllModules = @("spatial-engine-wasm", "compiler-wasm", "holoscript-component", "tree-sitter-holoscript")

# Resolve module selection
if ($Module -and $Module.Count -gt 0) {
    $SelectedModules = @()
    foreach ($m in $Module) {
        if ($ModuleMap.ContainsKey($m)) {
            $SelectedModules += $ModuleMap[$m]
        } elseif ($m -eq "all") {
            $SelectedModules = $AllModules
            break
        } else {
            Write-Error "Unknown module: $m. Valid: spatial, compiler, component, treesitter, all"
            return
        }
    }
} else {
    $SelectedModules = $AllModules
}

# -- Logging -----------------------------------------------------------------

function Write-Header($msg) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Blue
    Write-Host "  $msg" -ForegroundColor Blue
    Write-Host ("=" * 60) -ForegroundColor Blue
}

function Write-Step($msg) {
    Write-Host "  -> $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  [ERROR] $msg" -ForegroundColor Red
}

function Write-Size($filePath) {
    if (Test-Path $filePath) {
        $size = (Get-Item $filePath).Length
        $sizeKB = [math]::Round($size / 1024)
        $name = Split-Path $filePath -Leaf
        Write-Host "    $name`: $sizeKB KB ($size bytes)" -ForegroundColor White
    }
}

# -- Toolchain Check ---------------------------------------------------------

function Test-Toolchain {
    Write-Header "Checking WASM Toolchain"
    $allOk = $true

    # Cargo
    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        $ver = (cargo --version) -replace 'cargo ', ''
        Write-Ok "cargo $ver"
    } else {
        Write-Err "cargo not found"
        $allOk = $false
    }

    # Rust WASM targets
    if (Get-Command rustup -ErrorAction SilentlyContinue) {
        $targets = rustup target list --installed 2>$null
        if ($targets -match "wasm32-unknown-unknown") {
            Write-Ok "wasm32-unknown-unknown target installed"
        } else {
            Write-Warn "wasm32-unknown-unknown not installed (run: rustup target add wasm32-unknown-unknown)"
        }
        if ($targets -match "wasm32-wasip1") {
            Write-Ok "wasm32-wasip1 target installed"
        } else {
            Write-Warn "wasm32-wasip1 not installed (run: rustup target add wasm32-wasip1)"
        }
    }

    # wasm-pack
    if (Get-Command wasm-pack -ErrorAction SilentlyContinue) {
        Write-Ok "wasm-pack installed"
    } else {
        Write-Warn "wasm-pack not found (required for spatial-engine-wasm, compiler-wasm)"
    }

    # wasm-tools
    if (Get-Command wasm-tools -ErrorAction SilentlyContinue) {
        Write-Ok "wasm-tools installed"
    } else {
        Write-Warn "wasm-tools not found (required for holoscript-component)"
    }

    # tree-sitter
    if (Get-Command tree-sitter -ErrorAction SilentlyContinue) {
        Write-Ok "tree-sitter installed"
    } else {
        Write-Warn "tree-sitter not found (required for tree-sitter-holoscript)"
    }

    # wasm-opt
    if (Get-Command wasm-opt -ErrorAction SilentlyContinue) {
        Write-Ok "wasm-opt installed (optional optimizer)"
    } else {
        Write-Warn "wasm-opt not found (optional)"
    }

    if ($allOk) {
        Write-Ok "Core toolchain available"
    }
    return $allOk
}

# -- Clean -------------------------------------------------------------------

function Invoke-Clean {
    Write-Header "Cleaning WASM Build Artifacts"
    foreach ($mod in $SelectedModules) {
        switch ($mod) {
            "spatial-engine-wasm" {
                Write-Step "Cleaning spatial-engine-wasm..."
                Remove-Item -Recurse -Force "$PackagesDir\spatial-engine-wasm\pkg" -ErrorAction SilentlyContinue
                Write-Ok "spatial-engine-wasm cleaned"
            }
            "compiler-wasm" {
                Write-Step "Cleaning compiler-wasm..."
                Remove-Item -Recurse -Force "$PackagesDir\compiler-wasm\pkg" -ErrorAction SilentlyContinue
                Remove-Item -Recurse -Force "$PackagesDir\compiler-wasm\pkg-node" -ErrorAction SilentlyContinue
                Remove-Item -Recurse -Force "$PackagesDir\compiler-wasm\pkg-bundler" -ErrorAction SilentlyContinue
                Write-Ok "compiler-wasm cleaned"
            }
            "holoscript-component" {
                Write-Step "Cleaning holoscript-component..."
                Remove-Item -Recurse -Force "$PackagesDir\holoscript-component\dist" -ErrorAction SilentlyContinue
                Write-Ok "holoscript-component cleaned"
            }
            "tree-sitter-holoscript" {
                Write-Step "Cleaning tree-sitter-holoscript..."
                Get-ChildItem "$PackagesDir\tree-sitter-holoscript\*.wasm" -ErrorAction SilentlyContinue | Remove-Item -Force
                Write-Ok "tree-sitter-holoscript cleaned"
            }
        }
    }
}

# -- Build Functions ---------------------------------------------------------

function Build-SpatialEngineWasm {
    Write-Header "Building: spatial-engine-wasm"
    $pkgDir = Join-Path $PackagesDir "spatial-engine-wasm"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
        Write-Err "wasm-pack not found - skipping"
        return $false
    }

    Write-Step "Running wasm-pack build (target: web, mode: $BuildMode)..."

    $modeFlag = if ($BuildMode -eq "release") { "--release" } else { "--dev" }
    Push-Location $pkgDir
    try {
        wasm-pack build --target web --out-dir pkg $modeFlag
        if ($LASTEXITCODE -ne 0) { throw "wasm-pack failed" }
    } finally {
        Pop-Location
    }

    # Optional wasm-opt
    if ($BuildMode -eq "release" -and (Get-Command wasm-opt -ErrorAction SilentlyContinue)) {
        $wasmFile = Join-Path $pkgDir "pkg\spatial_engine_wasm_bg.wasm"
        if (Test-Path $wasmFile) {
            Write-Step "Running wasm-opt..."
            wasm-opt -Oz $wasmFile -o $wasmFile
        }
    }

    $sw.Stop()
    Write-Ok "spatial-engine-wasm built in $([math]::Round($sw.Elapsed.TotalSeconds))s"

    if ($Sizes) {
        Write-Host "  Output sizes:" -ForegroundColor White
        Get-ChildItem "$pkgDir\pkg\*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { Write-Size $_.FullName }
    }
    return $true
}

function Build-CompilerWasm {
    Write-Header "Building: compiler-wasm"
    $pkgDir = Join-Path $PackagesDir "compiler-wasm"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
        Write-Err "wasm-pack not found - skipping"
        return $false
    }

    Write-Step "Running wasm-pack build (target: web, mode: $BuildMode)..."

    $modeFlag = if ($BuildMode -eq "release") { "--release" } else { "--dev" }
    Push-Location $pkgDir
    try {
        wasm-pack build --target web --out-dir pkg $modeFlag
        if ($LASTEXITCODE -ne 0) { throw "wasm-pack failed" }

        Write-Step "Running wasm-pack build (target: nodejs)..."
        wasm-pack build --target nodejs --out-dir pkg-node $modeFlag 2>$null
    } finally {
        Pop-Location
    }

    # Optional wasm-opt
    if ($BuildMode -eq "release" -and (Get-Command wasm-opt -ErrorAction SilentlyContinue)) {
        $wasmFile = Join-Path $pkgDir "pkg\holoscript_wasm_bg.wasm"
        if (Test-Path $wasmFile) {
            Write-Step "Running wasm-opt..."
            wasm-opt -Oz $wasmFile -o $wasmFile
        }
    }

    $sw.Stop()
    Write-Ok "compiler-wasm built in $([math]::Round($sw.Elapsed.TotalSeconds))s"

    if ($Sizes) {
        Write-Host "  Output sizes:" -ForegroundColor White
        Get-ChildItem "$pkgDir\pkg\*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { Write-Size $_.FullName }
    }
    return $true
}

function Build-HoloscriptComponent {
    Write-Header "Building: holoscript-component (WASI Component Model)"
    $pkgDir = Join-Path $PackagesDir "holoscript-component"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Err "cargo not found - skipping"
        return $false
    }

    # Step 1: Cargo build
    Write-Step "Step 1/4: Building Rust (target: wasm32-wasip1, mode: $BuildMode)..."
    $cargoArgs = @("build", "--target", "wasm32-wasip1")
    if ($BuildMode -eq "release") { $cargoArgs += "--release" }

    Push-Location $pkgDir
    try {
        & cargo @cargoArgs
        if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
    } finally {
        Pop-Location
    }

    $profileDir = if ($BuildMode -eq "release") { "release" } else { "debug" }
    $coreWasm = Join-Path $pkgDir "target\wasm32-wasip1\$profileDir\holoscript_component.wasm"

    if (-not (Test-Path $coreWasm)) {
        Write-Err "Core WASM not found at: $coreWasm"
        return $false
    }

    New-Item -ItemType Directory -Force -Path "$pkgDir\dist" | Out-Null

    # Step 2: wasm-tools component new
    Write-Step "Step 2/4: Creating WASI component..."
    $adapter = Join-Path $pkgDir "wasi_snapshot_preview1.reactor.wasm"
    $componentWasm = Join-Path $pkgDir "dist\holoscript.component.wasm"

    if ((Get-Command wasm-tools -ErrorAction SilentlyContinue) -and (Test-Path $adapter)) {
        wasm-tools component new $coreWasm --adapt $adapter -o $componentWasm
        Write-Ok "WASI component created"
    } else {
        Write-Warn "wasm-tools or adapter not found - copying raw wasm"
        Copy-Item $coreWasm $componentWasm
    }

    # Step 3: jco transpile
    Write-Step "Step 3/4: Transpiling to JS..."
    Push-Location $pkgDir
    try {
        npx jco transpile dist/holoscript.component.wasm -o dist --name holoscript 2>$null
        Write-Ok "JS transpilation complete"
    } catch {
        Write-Warn "jco transpile failed (non-fatal)"
    } finally {
        Pop-Location
    }

    # Step 4: Types
    Write-Step "Step 4/4: Generating TypeScript types..."
    Push-Location $pkgDir
    try {
        npx jco types dist/holoscript.component.wasm -o dist/holoscript.d.ts 2>$null
    } catch {
        Write-Warn "Type generation skipped"
    } finally {
        Pop-Location
    }

    $sw.Stop()
    Write-Ok "holoscript-component built in $([math]::Round($sw.Elapsed.TotalSeconds))s"

    if ($Sizes) {
        Write-Host "  Output sizes:" -ForegroundColor White
        Get-ChildItem "$pkgDir\dist\*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { Write-Size $_.FullName }
    }
    return $true
}

function Build-TreeSitterHoloscript {
    Write-Header "Building: tree-sitter-holoscript (WASM)"
    $pkgDir = Join-Path $PackagesDir "tree-sitter-holoscript"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    $tsCmd = $null
    if (Get-Command tree-sitter -ErrorAction SilentlyContinue) {
        $tsCmd = "tree-sitter"
    }

    if (-not $tsCmd) {
        Write-Err "tree-sitter CLI not found - skipping"
        return $false
    }

    Write-Step "Step 1/2: Generating parser from grammar.js..."
    Push-Location $pkgDir
    try {
        & $tsCmd generate 2>$null
        Write-Step "Step 2/2: Building WASM..."
        & $tsCmd build --wasm
        if ($LASTEXITCODE -ne 0) { throw "tree-sitter build --wasm failed" }
    } finally {
        Pop-Location
    }

    $sw.Stop()
    Write-Ok "tree-sitter-holoscript built in $([math]::Round($sw.Elapsed.TotalSeconds))s"

    if ($Sizes) {
        Write-Host "  Output sizes:" -ForegroundColor White
        Get-ChildItem "$pkgDir\*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { Write-Size $_.FullName }
    }
    return $true
}

# -- Main Entry Point --------------------------------------------------------

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Header "HoloScript Unified WASM Build Pipeline"
Write-Host "  Mode:     $BuildMode" -ForegroundColor White
Write-Host "  Modules:  $($SelectedModules -join ', ')" -ForegroundColor White
Write-Host "  Parallel: $Parallel" -ForegroundColor White

# Toolchain check
$toolchainOk = Test-Toolchain
if ($CheckOnly) { return }

if ($Clean) {
    Invoke-Clean
    return
}

# Build
$succeeded = 0
$failed = 0

if ($Parallel) {
    Write-Header "Running WASM Builds in Parallel"
    $jobs = @()

    foreach ($mod in $SelectedModules) {
        switch ($mod) {
            "spatial-engine-wasm"     { $jobs += Start-Job -ScriptBlock { & "$using:PSScriptRoot\wasm-build.ps1" -Module spatial } }
            "compiler-wasm"           { $jobs += Start-Job -ScriptBlock { & "$using:PSScriptRoot\wasm-build.ps1" -Module compiler } }
            "holoscript-component"    { $jobs += Start-Job -ScriptBlock { & "$using:PSScriptRoot\wasm-build.ps1" -Module component } }
            "tree-sitter-holoscript"  { $jobs += Start-Job -ScriptBlock { & "$using:PSScriptRoot\wasm-build.ps1" -Module treesitter } }
        }
    }

    $jobs | Wait-Job | ForEach-Object {
        $result = Receive-Job $_
        Write-Host $result
        Remove-Job $_
    }
} else {
    foreach ($mod in $SelectedModules) {
        $result = $false
        switch ($mod) {
            "spatial-engine-wasm"     { $result = Build-SpatialEngineWasm }
            "compiler-wasm"           { $result = Build-CompilerWasm }
            "holoscript-component"    { $result = Build-HoloscriptComponent }
            "tree-sitter-holoscript"  { $result = Build-TreeSitterHoloscript }
        }
        if ($result) { $succeeded++ } else { $failed++ }
    }
}

$totalSw.Stop()

Write-Header "Build Summary"
Write-Host "  Total time: $([math]::Round($totalSw.Elapsed.TotalSeconds))s" -ForegroundColor White
Write-Host "  Succeeded:  $succeeded" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "  Failed:     $failed" -ForegroundColor Red
}

if ($failed -gt 0) { exit 1 }
