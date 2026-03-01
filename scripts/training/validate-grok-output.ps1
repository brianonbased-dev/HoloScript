##############################################################################
# Validate Grok-generated edge cases and extract to JSONL
# Reads the JSON output, flattens all entries, validates structure
##############################################################################

param(
    [string]$InputFile = "",
    [string]$OutputFile = ""
)

# Find latest grok output if not specified
if (!$InputFile) {
    $latest = Get-ChildItem -Path (Join-Path $PSScriptRoot "..\datasets") -Filter "grok_edge_cases_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) {
        $InputFile = $latest.FullName
    } else {
        Write-Host "ERROR: No grok edge case files found in datasets/" -ForegroundColor Red
        exit 1
    }
}

if (!$OutputFile) {
    $OutputFile = Join-Path (Split-Path $InputFile) "grok_edge_cases_validated.jsonl"
}

Write-Host "Input:  $InputFile" -ForegroundColor Cyan
Write-Host "Output: $OutputFile" -ForegroundColor Cyan

$data = Get-Content $InputFile -Raw | ConvertFrom-Json

$validEntries = @()
$invalidEntries = @()
$totalParsed = 0

foreach ($batch in $data.batches) {
    Write-Host "`nBatch: $($batch.name)" -ForegroundColor Yellow

    $entries = $batch.parsed_entries
    if (!$entries) {
        Write-Host "  SKIP: No parsed entries" -ForegroundColor Gray
        continue
    }

    # Handle both array and single object
    if ($entries -isnot [array]) { $entries = @($entries) }

    foreach ($entry in $entries) {
        $totalParsed++

        # Determine code field
        $code = $null
        if ($entry.code) { $code = $entry.code }
        elseif ($entry.fixed_code) { $code = $entry.fixed_code }

        if (!$code) {
            Write-Host "  SKIP entry $($entry.id): no code field" -ForegroundColor Gray
            $invalidEntries += $entry
            continue
        }

        # Basic structural validation
        $issues = @()

        # Check for composition keyword (most .holo files need this)
        if ($code -notmatch 'composition\s+"[^"]*"' -and $batch.name -ne "error-correction") {
            $issues += "missing composition declaration"
        }

        # Check brace balance
        $openBraces = ([regex]::Matches($code, '\{')).Count
        $closeBraces = ([regex]::Matches($code, '\}')).Count
        if ($openBraces -ne $closeBraces) {
            $issues += "unbalanced braces (open=$openBraces, close=$closeBraces)"
        }

        # Check bracket balance
        $openBrackets = ([regex]::Matches($code, '\[')).Count
        $closeBrackets = ([regex]::Matches($code, '\]')).Count
        if ($openBrackets -ne $closeBrackets) {
            $issues += "unbalanced brackets (open=$openBrackets, close=$closeBrackets)"
        }

        # Check for hallucinated traits (not in our valid list)
        $validTraits = @(
            "grabbable","throwable","collidable","physics","gravity","trigger","pointable","hoverable",
            "clickable","draggable","scalable","glowing","transparent","spinning","floating","billboard",
            "pulse","animated","look_at","outline","proximity","behavior_tree","emotion","goal_oriented",
            "perception","memory","cloth","soft_body","fluid","buoyancy","rope","wind","joint","rigidbody",
            "destruction","rotatable","stackable","snappable","breakable","character","patrol","networked",
            "anchor","spatial_audio","reverb_zone","voice_proximity","teleport","ui_panel","particle_system",
            "weather","day_night","lod","hand_tracking","haptic","portal","mirror"
        )

        $traitMatches = [regex]::Matches($code, '@(\w+)')
        foreach ($m in $traitMatches) {
            $traitName = $m.Groups[1].Value
            # Skip known non-trait @ usages
            if ($traitName -in @("on_collision","on_click","on_hover","on_grab","on_enter","on_exit","on_event","import","state","config")) { continue }
            if ($traitName -notin $validTraits) {
                $issues += "unknown trait: @$traitName"
            }
        }

        # Check for invalid geometries
        $geoMatches = [regex]::Matches($code, 'geometry:\s*"(\w+)"')
        $validGeos = @("cube","sphere","cylinder","cone","plane","torus","ring","capsule","model","mesh")
        foreach ($m in $geoMatches) {
            if ($m.Groups[1].Value -notin $validGeos) {
                $issues += "invalid geometry: $($m.Groups[1].Value)"
            }
        }

        if ($issues.Count -eq 0) {
            $validEntries += $entry
            Write-Host "  VALID: $($entry.id)" -ForegroundColor Green
        } else {
            $invalidEntries += @{ entry = $entry; issues = $issues }
            Write-Host "  INVALID: $($entry.id) - $($issues -join ', ')" -ForegroundColor Red
        }
    }
}

# Write valid entries as JSONL
$jsonlLines = @()
foreach ($entry in $validEntries) {
    # Normalize to standard training format
    $trainEntry = @{
        id = $entry.id
        prompt = $entry.prompt
        format = if ($entry.format) { $entry.format } else { "holo" }
        category = if ($entry.category) { $entry.category } else { "edge-case" }
    }

    # Handle error correction entries
    if ($entry.broken_code -and $entry.fixed_code) {
        $trainEntry.prompt = "Fix this HoloScript code: $($entry.broken_code)"
        $trainEntry.code = $entry.fixed_code
        $trainEntry.error_type = $entry.error_type
    } else {
        $trainEntry.code = $entry.code
    }

    $jsonlLines += ($trainEntry | ConvertTo-Json -Compress)
}

$jsonlLines | Set-Content -Path $OutputFile -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "VALIDATION COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Total parsed:  $totalParsed" -ForegroundColor White
Write-Host "Valid entries: $($validEntries.Count)" -ForegroundColor Green
Write-Host "Invalid:       $($invalidEntries.Count)" -ForegroundColor $(if ($invalidEntries.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "Pass rate:     $([math]::Round($validEntries.Count / [math]::Max($totalParsed, 1) * 100, 1))%" -ForegroundColor Cyan
Write-Host "Output:        $OutputFile" -ForegroundColor Yellow

if ($invalidEntries.Count -gt 0) {
    Write-Host "`nInvalid entry details:" -ForegroundColor Yellow
    foreach ($inv in $invalidEntries) {
        if ($inv.issues) {
            Write-Host "  $($inv.entry.id): $($inv.issues -join '; ')" -ForegroundColor Gray
        }
    }
}
