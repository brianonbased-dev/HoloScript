##############################################################################
# Grok Edge-Case Training Data Generator for HoloScript
# Uses Grok API with repo context to generate miracle edge cases
# Requires: PowerShell 5.1+
##############################################################################

$GROK_API_KEY = $env:GROK_API_KEY
if (-not $GROK_API_KEY) {
    Write-Error "GROK_API_KEY environment variable not set"
    exit 1
}
$API_URL = "https://api.x.ai/v1/chat/completions"
$MODEL = "grok-3"
$REPO_URL = "https://github.com/brianonbased-dev/Holoscript"
$OUTPUT_FILE = Join-Path $PSScriptRoot "..\datasets\grok_edge_cases_$(Get-Date -Format 'yyyy-MM-dd_HHmm').json"

# Ensure output directory exists
$outputDir = Split-Path $OUTPUT_FILE -Parent
if (!(Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force }

##############################################################################
# SYSTEM PROMPT - Extremely specific to prevent hallucination
##############################################################################

$SYSTEM_PROMPT = @"
You are a HoloScript training data generator. HoloScript is a spatial computing language at $REPO_URL.

CRITICAL RULES - DO NOT HALLUCINATE:
1. ONLY use these EXACT trait names (prefixed with @):
   INTERACTION: @grabbable, @throwable, @collidable, @physics, @gravity, @trigger, @pointable, @hoverable, @clickable, @draggable, @scalable
   VISUAL: @glowing, @transparent, @spinning, @floating, @billboard, @pulse, @animated, @look_at, @outline, @proximity
   AI/BEHAVIOR: @behavior_tree, @emotion, @goal_oriented, @perception, @memory
   PHYSICS: @cloth, @soft_body, @fluid, @buoyancy, @rope, @wind, @joint, @rigidbody, @destruction
   EXTENDED: @rotatable, @stackable, @snappable, @breakable, @character, @patrol, @networked, @anchor, @spatial_audio, @reverb_zone, @voice_proximity
   ADVANCED: @teleport, @ui_panel, @particle_system, @weather, @day_night, @lod, @hand_tracking, @haptic, @portal, @mirror

2. ONLY use these geometry types: "cube", "sphere", "cylinder", "cone", "plane", "torus", "ring", "capsule", "model"

3. ONLY use these materials: "standard", "shiny", "glass", "hologram", "neon", "chrome", "toon", "velvet", "xray", "gradient", "wireframe", "matte", "metal"

4. The EXACT .holo composition syntax is:
   composition "Name" {
     environment { skybox: "gradient", ambient_light: 0.4, fog: { color: "#hex", near: 10, far: 50 }, physics: { gravity: [0, -9.81, 0] } }
     template "Name" { @trait1, @trait2(param: value), geometry: "type", color: "#hex" }
     spatial_group "Name" { position: [x, y, z], object "Name" { ... } }
     object "Name" using "TemplateName" { geometry: "type", position: [x, y, z], scale: 0.5, color: "#hex", rotation: [0, 45, 0] }
     state { key: value }
     logic { on event_name { statements } action name(params) { statements } }
   }

5. Trait config syntax: @trait_name(param1: value1, param2: value2)
   Examples: @physics(mass: 2, restitution: 0.8), @glowing(intensity: 0.7, color: "#ff0000", pulse: true, pulse_speed: 2), @cloth(resolution: 30, stiffness: 0.95)

6. Position format: [x, y, z] where y=up. Eye level is y=1.5, ground is y=0. Negative z is forward.

7. Colors are ALWAYS hex strings: "#ff0000", "#00ff88", "#1a1a2e"

8. Scale can be number (uniform) or [x, y, z]: scale: 0.5 or scale: [2, 0.1, 1]

DO NOT invent traits, properties, or syntax that don't exist. Refer to $REPO_URL for the actual codebase if uncertain.
"@

##############################################################################
# EDGE CASE PROMPT BATCHES - Super specific to get miracle results
##############################################################################

$EDGE_CASE_PROMPTS = @(
    # BATCH 1: Multi-trait interaction edge cases
    @{
        batch = "multi-trait-interactions"
        prompt = @"
Generate EXACTLY 8 HoloScript .holo training data entries as a JSON array. Each entry must be: {"id": "edge-XXX", "prompt": "description", "format": "holo", "category": "edge-case", "code": "..."}

Generate edge cases where MULTIPLE traits interact in non-obvious ways:
1. An object with @cloth AND @wind AND @glowing - a glowing flag that blows in wind
2. An object with @physics AND @buoyancy AND @grabbable - a ball you can grab and drop in water
3. An object with @portal AND @particle_system AND @spatial_audio - a portal with particles and sound
4. An object with @behavior_tree AND @perception AND @patrol - an NPC that patrols and reacts to player
5. An object with @destruction AND @physics AND @stackable - destructible crate pyramid
6. An object with @mirror AND @day_night AND @transparent - a semi-transparent mirror that changes with time
7. A template with @grabbable @throwable @physics @glowing used by 5 objects in a spatial_group
8. An object with @joint(joint_type: "spring") connecting two @rigidbody objects

Each must be a COMPLETE composition with environment block. Use realistic positions, proper hex colors, and valid trait configs.
"@
    },

    # BATCH 2: Complex scene compositions
    @{
        batch = "complex-scenes"
        prompt = @"
Generate EXACTLY 6 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "scene-XXX", "prompt": "description", "format": "holo", "category": "complex-scene", "code": "..."}

Create complex, realistic scenes that push the language to its limits:
1. A weather station: @weather(type: "rain") + @day_night cycle + @wind zone + objects with @cloth banner + @ui_panel showing time
2. An underwater cave: @fluid particles + @buoyancy objects + @glowing crystals + @spatial_audio echoes + @reverb_zone(type: "cave") + @transparent water surface
3. A physics puzzle room: 3 @physics balls, 2 @trigger zones, @joint-connected platforms, @destruction walls, @stackable crates blocking a @portal
4. A VR art studio: @hand_tracking enabled, @grabbable paint brushes, @particle_system for paint, @mirror for viewing, @ui_panel palette, @haptic feedback on paint
5. A haunted house: @day_night(cycle_duration: 30) always night, @weather(type: "fog"), @floating ghost objects, @glowing(pulse: true) candles, @proximity triggers, @spatial_audio(src: "creak.mp3")
6. A space station: @gravity(mass: 0.1) low gravity, @networked objects, @anchor points, @teleport pads, @ui_panel status displays, @lod for distant modules

Each scene MUST have: environment block, at least 2 templates, at least 1 spatial_group, at least 6 objects, and logic block with at least 1 event handler.
"@
    },

    # BATCH 3: State management + logic edge cases
    @{
        batch = "state-logic-edge"
        prompt = @"
Generate EXACTLY 8 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "logic-XXX", "prompt": "description", "format": "holo", "category": "state-logic", "code": "..."}

Create edge cases focused on state management and logic blocks:
1. A score counter: state { score: 0, multiplier: 1, combo: 0 } with logic that increments score on trigger enter, resets combo after 5 seconds
2. A door puzzle: state { door_open: false, keys_collected: 0, required_keys: 3 } with 3 @clickable key objects and a door that opens when all collected
3. A color-changing room: state { current_color: "#ffffff", mode: "normal" } with @clickable buttons that change environment ambient and all object colors
4. A timer challenge: state { time_remaining: 60, started: false, completed: false } with @ui_panel countdown, @trigger start zone, @proximity finish zone
5. A toggle system: state { lights_on: true, gravity_on: true, music_on: false } with 3 @clickable switch objects that toggle each, objects react to state
6. A inventory system: state { held_item: "none", inventory: [] } with @grabbable items, @trigger drop zones, @ui_panel inventory display
7. A progression system: state { level: 1, xp: 0, xp_needed: 100 } with @trigger zones that give xp, @ui_panel level display, objects unlock at levels
8. A physics sandbox: state { gravity_strength: -9.81, friction: 0.5, restitution: 0.3 } with @ui_panel sliders, @physics objects that update when state changes

Each MUST have complete state block, logic block with on/action handlers, and emit() calls for state changes.
"@
    },

    # BATCH 4: Template inheritance + spatial hierarchy edge cases
    @{
        batch = "template-hierarchy"
        prompt = @"
Generate EXACTLY 6 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "tmpl-XXX", "prompt": "description", "format": "holo", "category": "template-hierarchy", "code": "..."}

Create edge cases focused on templates and spatial hierarchy:
1. A furniture store: template "Furniture" with @grabbable @physics, template "Chair" reuses properties, template "Table" reuses, 3 spatial_groups (living_room, bedroom, kitchen) each with 4+ objects using templates
2. A solar system: template "Planet" with @spinning @floating, 8 planet objects in nested spatial_groups (inner_planets, outer_planets) with different scale/color/speed overrides
3. A chess board: template "WhitePiece" and "BlackPiece" with @draggable @snappable(grid_size: 1), 32 pieces in 2 spatial_groups with exact grid positions
4. A city block: template "Building" with @lod, template "Car" with @physics @patrol, template "Streetlight" with @day_night @glowing, nested spatial_groups for streets/sidewalks
5. A laboratory: template "Beaker" with @grabbable @transparent @fluid, template "Equipment" with @clickable, objects in spatial_groups (workbench, storage, experiment_area)
6. A forest: template "Tree" with @wind @cloth (leaves), template "Rock" with @collidable, template "Creature" with @patrol @perception @behavior_tree, 20+ objects in groups

Each MUST demonstrate: template reuse with property overrides, nested spatial_groups, at least 3 templates, at least 10 objects total.
"@
    },

    # BATCH 5: Platform-specific edge cases
    @{
        batch = "platform-edge"
        prompt = @"
Generate EXACTLY 6 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "plat-XXX", "prompt": "description", "format": "holo", "category": "platform-edge", "code": "..."}

Create scenes that exercise platform-specific features:
1. VR hand interaction: @hand_tracking on both hands, @haptic feedback, @grabbable tools, @scalable objects with pinch gesture, @pointable UI panels
2. AR furniture placement: @anchor(type: "world") furniture, @draggable @scalable @rotatable, @transparent placement preview, @ui_panel price display, @proximity snap guides
3. Multiplayer sync stress: @networked on 10 objects, @voice_proximity zone, @spatial_audio sources, @networked @physics shared objects, @ui_panel player list
4. Accessibility-focused: @ui_panel with large text, @proximity narration triggers, @glowing(intensity: 1.0) high-visibility objects, @spatial_audio directional cues, @haptic navigation feedback
5. Performance-optimized: @lod on all distant objects, template reuse for instancing, spatial_groups for culling, @billboard for sprites, @particle_system with low count
6. WebXR showcase: @teleport navigation, @hand_tracking pinch, @portal room transitions, @mirror reflection, @weather(type: "snow") atmosphere, @day_night(cycle_duration: 60)

Each MUST have environment block with appropriate physics config, and demonstrate the specific platform constraints.
"@
    },

    # BATCH 6: Error correction pairs (typo/fix edge cases)
    @{
        batch = "error-correction"
        prompt = @"
Generate EXACTLY 10 HoloScript error correction training pairs as a JSON array. Each entry: {"id": "fix-XXX", "prompt": "Fix this HoloScript code", "format": "holo", "category": "error-correction", "broken_code": "...", "fixed_code": "...", "error_type": "..."}

Create realistic errors that a user might make:
1. Misspelled trait: @grabaable instead of @grabbable
2. Wrong geometry: geometry: "box" instead of geometry: "cube"
3. Missing quotes on composition name: composition MyScene { instead of composition "MyScene" {
4. Wrong bracket type: position: {0, 1, -2} instead of position: [0, 1, -2]
5. Missing colon: geometry "sphere" instead of geometry: "sphere"
6. Invalid color: color: red instead of color: "#ff0000"
7. Trait with wrong param name: @physics(weight: 2) instead of @physics(mass: 2)
8. Misspelled keyword: enviroment { instead of environment {
9. Missing closing brace in nested spatial_group (unbalanced braces)
10. Using position: (0, 1, 0) with parens instead of position: [0, 1, 0] with brackets

Each broken_code must be a complete but broken composition. Each fixed_code must be the corrected version. error_type describes the mistake.
"@
    },

    # BATCH 7: Behavioral AI edge cases
    @{
        batch = "ai-behavior-edge"
        prompt = @"
Generate EXACTLY 6 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "ai-XXX", "prompt": "description", "format": "holo", "category": "ai-behavior", "code": "..."}

Create scenes with complex AI behavior configurations:
1. A guard NPC: @behavior_tree with sequence(patrol, selector(chase_if_seen, return_to_post)), @perception(range: 15, fov: 90), @patrol(waypoints: [[0,0,0],[5,0,0],[5,0,5],[0,0,5]], speed: 2), @emotion(default_mood: "neutral", reactivity: 0.3)
2. A shopkeeper NPC: @goal_oriented with goals and actions for greeting/selling/restocking, @perception(range: 5, fov: 180), @memory(capacity: 50), @emotion(default_mood: "joy")
3. A predator-prey ecosystem: 3 @behavior_tree predators with chase behavior, 5 @behavior_tree prey with flee behavior, @perception for detection, @memory for remembering threats
4. A puzzle companion: @behavior_tree with help_if_stuck condition, @perception(range: 20) to see player, @memory to remember puzzle state, @look_at(target: "player"), @proximity(radius: 3) for dialogue trigger
5. An emotion-reactive environment: Multiple objects with @emotion listeners, @proximity(radius: 5) triggers emotion changes, @glowing intensity changes with emotion, colors shift based on PAD values
6. A GOAP delivery robot: @goal_oriented with pick_up/deliver/recharge goals, @physics for movement, @perception(range: 10), @memory for delivery locations, @ui_panel showing current goal

Each MUST use valid trait config syntax. @behavior_tree root must use valid node types: sequence, selector, parallel, condition, action, wait.
"@
    },

    # BATCH 8: Extreme minimal + extreme maximal
    @{
        batch = "size-extremes"
        prompt = @"
Generate EXACTLY 8 HoloScript .holo training data entries as a JSON array. Each entry: {"id": "size-XXX", "prompt": "description", "format": "holo", "category": "size-extreme", "code": "..."}

Create size extremes - both minimal and maximal:
1. MINIMAL: The absolute smallest valid composition - just a name and one object with geometry only
2. MINIMAL: Single object with every required field and nothing else
3. MINIMAL: Environment-only composition with no objects (just skybox and lighting)
4. MINIMAL: Template-only composition with one template defined but no object instances
5. MAXIMAL: Scene with ALL environment options set (skybox, ambient_light, fog, physics gravity)
6. MAXIMAL: Single object with the MOST traits possible stacked: @grabbable @throwable @physics @collidable @glowing @transparent @spinning @floating @pulse @proximity @pointable @hoverable @clickable
7. MAXIMAL: Scene with 3 templates, 3 spatial_groups, 12 objects, state block, and logic with 3 event handlers
8. MAXIMAL: @behavior_tree with deeply nested node structure: sequence containing selector containing parallel containing conditions and actions

Show the absolute boundaries of what valid HoloScript can be.
"@
    }
)

##############################################################################
# API CALL FUNCTION
##############################################################################

function Invoke-GrokAPI {
    param(
        [string]$SystemPrompt,
        [string]$UserPrompt,
        [string]$BatchName
    )

    $body = @{
        model = $MODEL
        messages = @(
            @{ role = "system"; content = $SystemPrompt }
            @{ role = "user"; content = $UserPrompt }
        )
        temperature = 0.7
        max_tokens = 8000
    } | ConvertTo-Json -Depth 10

    $headers = @{
        "Authorization" = "Bearer $GROK_API_KEY"
        "Content-Type" = "application/json"
    }

    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "BATCH: $BatchName" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Sending request to Grok API..." -ForegroundColor Gray

    try {
        $response = Invoke-RestMethod -Uri $API_URL -Method Post -Headers $headers -Body $body -TimeoutSec 120
        $content = $response.choices[0].message.content
        Write-Host "SUCCESS - Got $(($content).Length) chars" -ForegroundColor Green
        Write-Host "Tokens used: $($response.usage.total_tokens)" -ForegroundColor Gray
        return $content
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

##############################################################################
# MAIN EXECUTION
##############################################################################

Write-Host @"

 _   _       _       ____            _       _
| | | | ___ | | ___ / ___|  ___ _ __(_)_ __ | |_
| |_| |/ _ \| |/ _ \\___ \ / __| '__| | '_ \| __|
|  _  | (_) | | (_) |___) | (__| |  | | |_) | |_
|_| |_|\___/|_|\___/|____/ \___|_|  |_| .__/ \__|
                                       |_|
  GROK EDGE-CASE TRAINING DATA GENERATOR
  Model: $MODEL | Batches: $($EDGE_CASE_PROMPTS.Count)

"@ -ForegroundColor Magenta

$allResults = @{
    metadata = @{
        generated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        generator = "grok-edge-case-v1"
        model = $MODEL
        repo = $REPO_URL
        batch_count = $EDGE_CASE_PROMPTS.Count
    }
    batches = @()
}

$totalStartTime = Get-Date

foreach ($batch in $EDGE_CASE_PROMPTS) {
    $batchStart = Get-Date
    $result = Invoke-GrokAPI -SystemPrompt $SYSTEM_PROMPT -UserPrompt $batch.prompt -BatchName $batch.batch

    if ($result) {
        # Try to extract JSON from response
        $jsonContent = $null
        try {
            # Try direct parse
            $jsonContent = $result | ConvertFrom-Json
        }
        catch {
            # Try extracting from markdown code block
            if ($result -match '```json\s*([\s\S]*?)\s*```') {
                try {
                    $jsonContent = $Matches[1] | ConvertFrom-Json
                }
                catch {
                    Write-Host "  WARNING: Could not parse JSON from code block" -ForegroundColor Yellow
                }
            }
            # Try extracting array
            if (!$jsonContent -and $result -match '\[[\s\S]*\]') {
                try {
                    $jsonContent = $Matches[0] | ConvertFrom-Json
                }
                catch {
                    Write-Host "  WARNING: Could not parse JSON array" -ForegroundColor Yellow
                }
            }
        }

        $batchDuration = ((Get-Date) - $batchStart).TotalSeconds
        $entryCount = if ($jsonContent -is [array]) { $jsonContent.Count } elseif ($jsonContent) { 1 } else { 0 }

        $allResults.batches += @{
            name = $batch.batch
            duration_seconds = [math]::Round($batchDuration, 1)
            entry_count = $entryCount
            raw_response = $result
            parsed_entries = $jsonContent
        }

        Write-Host "  Parsed $entryCount entries in $([math]::Round($batchDuration, 1))s" -ForegroundColor Cyan
    }
    else {
        $allResults.batches += @{
            name = $batch.batch
            error = "API call failed"
            parsed_entries = @()
        }
    }

    # Rate limit: wait 2 seconds between batches
    Start-Sleep -Seconds 2
}

$totalDuration = ((Get-Date) - $totalStartTime).TotalSeconds
$totalEntries = ($allResults.batches | ForEach-Object { $_.entry_count } | Measure-Object -Sum).Sum

$allResults.metadata.total_duration_seconds = [math]::Round($totalDuration, 1)
$allResults.metadata.total_entries = $totalEntries

# Save to file
$allResults | ConvertTo-Json -Depth 20 | Set-Content -Path $OUTPUT_FILE -Encoding UTF8

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Total batches: $($EDGE_CASE_PROMPTS.Count)" -ForegroundColor White
Write-Host "Total entries: $totalEntries" -ForegroundColor White
Write-Host "Total time: $([math]::Round($totalDuration, 1))s" -ForegroundColor White
Write-Host "Output: $OUTPUT_FILE" -ForegroundColor Yellow
