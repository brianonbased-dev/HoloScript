<#
.SYNOPSIS
    Local GPU Multi-Agent Optimization Script
    
.DESCRIPTION
    Configures Ollama and system for running multiple IDEs + 5 agents simultaneously
    on RTX 3060 (6GB VRAM) / 32GB RAM setup.
    
.NOTES
    GPU: NVIDIA GeForce RTX 3060 Laptop GPU (6GB)
    RAM: 32GB
    Target: 5 concurrent agents + VS Code + Antigravity + Claude Desktop
#>

param(
    [switch]$Apply,
    [switch]$Status,
    [switch]$Recommend
)

# =============================================================================
# CONFIGURATION - Optimized for 6GB VRAM / 32GB RAM multi-agent workload
# =============================================================================

$OptimalConfig = @{
    # Ollama parallel processing (allows 5 concurrent requests to same model)
    OLLAMA_NUM_PARALLEL = "5"
    
    # Only keep 1 model loaded (saves VRAM, uses disk cache for switching)
    OLLAMA_MAX_LOADED_MODELS = "1"
    
    # Enable flash attention for memory efficiency (critical for 6GB VRAM)
    OLLAMA_FLASH_ATTENTION = "1"
    
    # Reserve 512MB VRAM for IDEs/system (prevents OOM)
    OLLAMA_GPU_OVERHEAD = "536870912"
    
    # Keep model loaded for 30 min between requests (faster warmup)
    OLLAMA_KEEP_ALIVE = "30m"
    
    # Prefer smaller context for multi-agent (2K per request vs 4K default)
    OLLAMA_NUM_CTX = "2048"
}

# =============================================================================
# RECOMMENDED MODELS for multi-agent (sorted by efficiency)
# =============================================================================

$RecommendedModels = @(
    @{ Name = "brittney-v15:latest"; VRAM = "4.1GB"; Speed = "Fast"; Use = "HoloScript generation" }
    @{ Name = "phi3.5:3.8b-mini-instruct-q8_0"; VRAM = "4.1GB"; Speed = "Fastest"; Use = "Quick completions" }
    @{ Name = "nomic-embed-text:latest"; VRAM = "274MB"; Speed = "Instant"; Use = "Embeddings (parallel safe)" }
)

$AvoidModels = @(
    @{ Name = "brittney-v15-f16:latest"; VRAM = "7.6GB"; Reason = "Exceeds 6GB VRAM" }
    @{ Name = "mistral-nemo:12b"; VRAM = "7.1GB"; Reason = "Exceeds 6GB VRAM" }
    @{ Name = "deepseek-r1:latest"; VRAM = "5.2GB"; Reason = "Leaves little headroom" }
)

# =============================================================================
# FUNCTIONS
# =============================================================================

function Show-Status {
    Write-Host "`n=== Local GPU Multi-Agent Status ===" -ForegroundColor Cyan
    
    # GPU Info
    Write-Host "`n[GPU]" -ForegroundColor Yellow
    $gpuInfo = nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>$null
    if ($gpuInfo) {
        Write-Host "  $gpuInfo"
    } else {
        Write-Host "  nvidia-smi not available" -ForegroundColor Red
    }
    
    # RAM Info
    Write-Host "`n[RAM]" -ForegroundColor Yellow
    $os = Get-CimInstance Win32_OperatingSystem
    $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    $usedGB = $totalGB - $freeGB
    Write-Host "  Total: ${totalGB}GB | Used: ${usedGB}GB | Free: ${freeGB}GB"
    
    # Ollama Config
    Write-Host "`n[Ollama Environment]" -ForegroundColor Yellow
    foreach ($key in $OptimalConfig.Keys) {
        $current = [Environment]::GetEnvironmentVariable($key, "User")
        $optimal = $OptimalConfig[$key]
        $status = if ($current -eq $optimal) { "[OK]" } else { "[MISSING]" }
        $color = if ($current -eq $optimal) { "Green" } else { "Yellow" }
        Write-Host "  $status $key = $current (optimal: $optimal)" -ForegroundColor $color
    }
    
    # Loaded Models
    Write-Host "`n[Ollama Models]" -ForegroundColor Yellow
    $models = ollama list 2>$null | Select-Object -Skip 1 | ForEach-Object { $_.Split()[0] }
    $models | ForEach-Object { Write-Host "  - $_" }
    
    # Running Processes
    Write-Host "`n[Active IDE/Agent Processes]" -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -match 'Code|Antigravity|claude|ollama' } |
        Group-Object ProcessName |
        ForEach-Object { 
            $memMB = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 0)
            Write-Host "  $($_.Name): $($_.Count) processes, ${memMB}MB total"
        }
}

function Show-Recommendations {
    Write-Host "`n=== Multi-Agent GPU Recommendations ===" -ForegroundColor Cyan
    
    Write-Host "`n[RECOMMENDED MODELS for 5 concurrent agents]" -ForegroundColor Green
    $RecommendedModels | ForEach-Object {
        Write-Host "  $($_.Name)" -ForegroundColor White
        Write-Host "    VRAM: $($_.VRAM) | Speed: $($_.Speed) | Use: $($_.Use)" -ForegroundColor Gray
    }
    
    Write-Host "`n[AVOID THESE MODELS (exceed 6GB VRAM)]" -ForegroundColor Red
    $AvoidModels | ForEach-Object {
        Write-Host "  $($_.Name)" -ForegroundColor White
        Write-Host "    VRAM: $($_.VRAM) | Reason: $($_.Reason)" -ForegroundColor Gray
    }
    
    Write-Host "`n[MCP CONFIG RECOMMENDATIONS]" -ForegroundColor Yellow
    Write-Host @"
  In ~/.mcp/config.json or Claude Desktop config, use:
  
    "env": {
      "OLLAMA_BASE_URL": "http://localhost:11434",
      "BRITTNEY_MODEL": "brittney-v15:latest",  // NOT f16 version
      "OLLAMA_NUM_CTX": "2048"  // Smaller context = more parallel capacity
    }
"@
    
    Write-Host "`n[MEMORY OPTIMIZATION TIPS]" -ForegroundColor Yellow
    Write-Host @"
  1. Close unused VS Code/Antigravity windows (each ~800MB-1GB RAM)
  2. Use phi3.5:3.8b for quick completions (faster than mistral-nemo)
  3. Keep brittney-v15 (Q8) instead of brittney-v15-f16 (saves 3.5GB VRAM)
  4. Run 'ollama stop' when not using AI to free VRAM
"@
}

function Apply-Configuration {
    Write-Host "`n=== Applying Optimal Configuration ===" -ForegroundColor Cyan
    
    foreach ($key in $OptimalConfig.Keys) {
        $value = $OptimalConfig[$key]
        Write-Host "  Setting $key = $value" -ForegroundColor Yellow
        [Environment]::SetEnvironmentVariable($key, $value, "User")
    }
    
    Write-Host "`n[Configuration Applied]" -ForegroundColor Green
    Write-Host "  Restart Ollama for changes to take effect:" -ForegroundColor White
    Write-Host "    ollama stop" -ForegroundColor Gray
    Write-Host "    ollama serve" -ForegroundColor Gray
    
    # Also set for current session
    foreach ($key in $OptimalConfig.Keys) {
        [Environment]::SetEnvironmentVariable($key, $OptimalConfig[$key])
    }
    Write-Host "`n  Current session updated (no restart needed for new requests)" -ForegroundColor Green
}

# =============================================================================
# MAIN
# =============================================================================

if ($Status) {
    Show-Status
} elseif ($Recommend) {
    Show-Recommendations
} elseif ($Apply) {
    Apply-Configuration
    Show-Status
} else {
    Write-Host @"

Local GPU Multi-Agent Setup Script
===================================

Usage:
  .\local-gpu-setup.ps1 -Status      # Show current configuration
  .\local-gpu-setup.ps1 -Recommend   # Show optimization recommendations
  .\local-gpu-setup.ps1 -Apply       # Apply optimal settings

Your System:
  GPU: RTX 3060 (6GB VRAM)
  RAM: 32GB

Optimized For:
  - 5 concurrent agents (Claude, MCP, etc.)
  - VS Code + Antigravity running simultaneously
  - HoloScript development with Brittney AI

"@
    Show-Status
}
