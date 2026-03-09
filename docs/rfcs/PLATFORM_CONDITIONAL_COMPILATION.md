# RFC: @platform() Conditional Compilation for HoloScript

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| **RFC**     | RFC-0012                                   |
| **Title**   | Platform Conditional Compilation           |
| **Status**  | Implementation Ready                       |
| **Author**  | HoloScript Core Team                       |
| **Created** | 2026-03-06                                 |
| **Updated** | 2026-03-07                                 |
| **Targets** | Parser, Compiler, LSP, Tree-sitter Grammar |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Syntax Specification](#2-syntax-specification)
3. [Compilation Behavior](#3-compilation-behavior)
4. [Examples](#4-examples)
5. [Migration Guide](#5-migration-guide)
6. [AST Changes](#6-ast-changes)
7. [Parser Modifications](#7-parser-modifications)
8. [Implementation Status](#8-implementation-status)
9. [Appendix: Platform Matrix](#9-appendix-platform-matrix)

---

## 1. Executive Summary

### Problem

Spatial computing experiences must target 18+ platforms with radically different capabilities:

| Platform        | Runtime        | Capabilities                                          | Frame Budget |
| --------------- | -------------- | ----------------------------------------------------- | ------------ |
| **VisionOS**    | RealityKit     | Hand tracking, eye tracking, spatial audio, portals   | 11.1 ms      |
| **AndroidXR**   | Jetpack XR     | Hand tracking, eye tracking, passthrough, GPS         | 11.1 ms      |
| **Quest3**      | OpenXR/Vulkan  | Hand + controller, haptics, passthrough               | 11.1 ms      |
| **WebXR**       | Three.js/R3F   | Limited hand tracking, no eye tracking, browser-bound | 16.6 ms      |
| **iOS/Android** | Native         | Touch, GPS, ARKit/ARCore                              | 16.6 ms      |
| **Desktop**     | Browser/Native | Mouse/keyboard, no spatial tracking                   | 16.6 ms      |
| **Automotive**  | CarPlay/Auto   | Voice-only, safety-critical, minimal visual           | 30 ms        |
| **Wearable**    | Watch/Glass    | Haptic, glanceable, ultra-minimal                     | 33.3 ms      |

Today's approaches:

1. **Separate compositions per platform** → maintenance overhead scales linearly with platform count
2. **Runtime conditionals** → all code ships to all platforms, bundle bloat + runtime latency
3. **External build tooling** → breaks LSP, syntax highlighting, and compositional semantics

### Solution

The `@platform()` decorator enables **compile-time conditional compilation**:

```holoscript
// Single composition with platform-specific sections
composition "AdaptiveMuseumTour" {
  // Shared state (compiled everywhere)
  @state { currentExhibit: "lobby" }

  // VR-only: Full 3D avatar with spatial gestures
  @platform(vr)
  object "GuideAgent" @avatar_embodiment @hand_tracking {
    model: "avatars/guide_v2.glb"
    position: [0, 0, -2]
  }

  // AR: Spatial persona overlay
  @platform(ar)
  object "GuideAgent" @spatial_anchor {
    model: "avatars/guide_persona.glb"
    opacity: 0.85
    billboardMode: "y-axis"
  }

  // Phone/Desktop: 2D UI overlay
  @platform(mobile, desktop)
  object "GuideAgent" {
    layout: "bottom-sheet"
    avatarThumbnail: "guide_2d.png"
  }

  // Car: Voice-only (safety-critical)
  @platform(automotive)
  object "GuideAgent" {
    layout: "voice-hud"
    displayMode: "minimal"
    interruptible: true
  }
}
```

**When compiling to Quest3:**

- Only the `@platform(vr)` block is included (Quest3 is in the `vr` category)
- All other platform blocks are stripped (dead code elimination)
- Zero runtime cost, smaller bundles, no feature detection

### Design Goals

- **Single Source of Truth**: One `.holo` file per experience, not one per platform
- **Zero Runtime Cost**: Compiler strips non-target blocks entirely
- **Compositional**: Platform blocks compose naturally with existing HoloScript constructs
- **LSP-Friendly**: Language server provides contextual completions and visual indicators
- **Category-Level Abstraction**: Target form factors (`vr`, `ar`, `mobile`) instead of individual devices

---

## 2. Syntax Specification

### 2.1 Basic Form: Single Platform

Target a specific platform:

```holoscript
@platform(visionos)
object "OrnamentPanel" {
  // Only compiled when target is visionos
}
```

### 2.2 Category Form: Form Factor Targeting

Target all platforms in a category:

```holoscript
@platform(vr)
object "ImmersiveAvatar" {
  // Compiled for quest3, pcvr, visionos, android-xr
}
```

#### Platform Hierarchy

```
Category        Platforms
──────────────  ──────────────────────────────────────────
vr              quest3, pcvr, visionos, android-xr
ar              visionos-ar, android-xr-ar, webxr
mobile          ios, android
desktop         windows, macos, linux, web
automotive      android-auto, carplay
wearable        watchos, wearos
```

#### Aliases

| Alias   | Resolves To  |
| ------- | ------------ |
| `phone` | `mobile`     |
| `car`   | `automotive` |

### 2.3 Union Form: Multiple Platforms

Use comma-separated values to target multiple platforms or categories:

```holoscript
@platform(quest3, android-xr)
object "XRHandMenu" {
  // Compiled only for Quest 3 and Android XR
}

@platform(mobile, desktop)
object "FlatScreenUI" {
  // Compiled for ios, android, windows, macos, linux, web
}

@platform(vr, ar)
object "SpatialCursor" {
  // Compiled for all VR + all AR platforms
}
```

### 2.4 Negation Form: Exclusion

Use the `not:` prefix to exclude platforms:

```holoscript
@platform(not: web)
object "NativeOnlyFeature" {
  // Compiled for every platform EXCEPT web
}

@platform(not: automotive, wearable)
object "FullInteractionModel" {
  // Compiled for everything except automotive and wearable
}
```

### 2.5 Nesting and Scope

Platform decorators can be applied at multiple levels:

```holoscript
// Root level: decorates entire objects
@platform(vr)
object "VROnlyObject" { ... }

// Inside an object: decorates interactions
object "MultiPlatformObject" {
  position: [0, 1, 0]

  @platform(vr)
  interaction "GrabAndThrow" {
    type: spatial_gesture
    gestures: [grab, throw]
  }

  @platform(mobile)
  interaction "TapAndSwipe" {
    type: touch
    gestures: [tap, swipe]
  }
}
```

#### Block Types That Accept @platform()

| Block Type      | Root Level | Nested | AST Field                                      |
| --------------- | :--------: | :----: | ---------------------------------------------- |
| `object`        |     Y      |   Y    | `HoloObjectDecl.platformConstraint`            |
| `template`      |     Y      |   --   | `HoloTemplate.platformConstraint`              |
| `spatial_group` |     Y      |   Y    | `HoloSpatialGroup.platformConstraint`          |
| `light`         |     Y      |   --   | `HoloLight.platformConstraint`                 |
| `norm`          |     Y      |   --   | `HoloNormBlock.platformConstraint`             |
| `interaction`   |     --     |   Y    | Proposed: `HoloInteraction.platformConstraint` |

### 2.6 Grammar Specification

#### Current Parser Grammar (HoloCompositionParser.ts)

```
platform_decorator := '@' 'platform' '(' platform_args ')'
platform_args      := platform_list | 'not' ':' platform_list
platform_list      := platform_name (',' platform_name)*
platform_name      := IDENTIFIER ('-' IDENTIFIER)*   // e.g., android-xr
```

#### Proposed Tree-sitter Grammar Addition

```javascript
// Add to grammar.js rules
platform_decorator: ($) =>
  seq(
    '@',
    'platform',
    '(',
    choice(
      seq('not', ':', $.platform_list),
      $.platform_list,
    ),
    ')'
  ),

platform_list: ($) =>
  sepBy1($.platform_name, ','),

platform_name: ($) =>
  token(seq(
    /[a-z][a-z0-9]*/,
    repeat(seq('-', /[a-z][a-z0-9]*/))
  )),

// Modify object/template/spatial_group/light/norm rules to accept optional platform decorator
object: ($) =>
  seq(
    optional($.platform_decorator),
    'object',
    $.string,
    // ... rest of object rule
  ),
```

---

## 3. Compilation Behavior

### 3.1 Pipeline Overview

```
                                                 Target: quest3
                                                       |
  .holo source                                         v
       |                                   +------------------------+
       v                                   | PlatformConditional    |
  +---------+      +----------+            | CompilerMixin          |
  | Parser  | ---> | AST with | ---------> | .filterForPlatform()   |
  | (Lexer  |      | platform |            +------------------------+
  |  +Parse)|      | constraints|                   |
  +---------+      +----------+                    v
                                        +--------------------+
                                        | Filtered AST       |
                                        | (quest3 blocks     |
                                        |  only)             |
                                        +--------------------+
                                                |
                                                v
                                        +--------------------+
                                        | Target Compiler    |
                                        | (OpenXRCompiler)   |
                                        +--------------------+
                                                |
                                                v
                                        +--------------------+
                                        | C++ / Kotlin /     |
                                        | Swift / JS output  |
                                        +--------------------+
```

### 3.2 Step 1: Parsing

The parser converts `@platform(...)` syntax into a `PlatformConstraint` AST node:

**Parser location**: `packages/core/src/parser/HoloCompositionParser.ts` line ~3947

**Parsing rules**:

1. Consume `@` and `platform` tokens
2. Call `parsePlatformConstraint()` to read `(...)` arguments
3. Assemble hyphenated platform names (e.g., `android-xr` from `IDENTIFIER - IDENTIFIER`)
4. Handle `not:` prefix for exclusions
5. Attach resulting `PlatformConstraint` to the next parsed block

**Example AST output:**

```typescript
// For: @platform(quest3, android-xr)
{
  include: ['quest3', 'android-xr'],
  exclude: []
}

// For: @platform(not: automotive, wearable)
{
  include: [],
  exclude: ['automotive', 'wearable']
}
```

### 3.3 Step 2: Platform Filtering (Dead Code Elimination)

The `PlatformConditionalCompilerMixin` class filters the AST:

**Location**: `packages/core/src/compiler/PlatformConditionalCompilerMixin.ts`

**Key method**: `filterForPlatform(composition, target)`

```typescript
filterForPlatform(
  composition: HoloComposition,
  target: CompilePlatformTarget,
): HoloComposition {
  return {
    ...composition,
    objects: this.filterBlocks(composition.objects, target),
    templates: this.filterBlocks(composition.templates, target),
    spatialGroups: this.filterBlocks(composition.spatialGroups, target),
    lights: this.filterBlocks(composition.lights, target),
    norms: composition.norms
      ? this.filterBlocks(composition.norms, target)
      : undefined,
  };
}
```

**Matching algorithm** (from `matchesPlatformConstraint()`):

1. If constraint is `undefined` → **MATCH ALL** platforms
2. If `exclude` is non-empty:
   - Expand category names and aliases
   - If target platform OR its category is in exclude list → **REJECT**
3. If `include` is non-empty:
   - Expand category names and aliases
   - If target platform OR its category is in include list → **ACCEPT**
   - Otherwise → **REJECT**
4. If `include` is empty (and not excluded) → **ACCEPT**

**Category expansion examples**:

- `"vr"` → `['quest3', 'pcvr', 'visionos', 'android-xr']`
- `"phone"` (alias) → `"mobile"` → `['ios', 'android']`

### 3.4 Step 3: Target-Specific Compilation

After filtering, the cleaned AST is passed to the appropriate target compiler:

| Target Platform | Compiler Class                    | Output Language       |
| --------------- | --------------------------------- | --------------------- |
| `visionos`      | `VisionOSCompiler`                | Swift (RealityKit)    |
| `android-xr`    | `AndroidXRCompiler`               | Kotlin (Jetpack XR)   |
| `quest3`        | `OpenXRCompiler`                  | C++ (OpenXR/Vulkan)   |
| `pcvr`          | `OpenXRCompiler`                  | C++ (OpenXR/Vulkan)   |
| `webxr`         | `R3FCompiler` / `BabylonCompiler` | JavaScript/TypeScript |
| `web`           | `WebGPUCompiler`                  | TypeScript (WebGPU)   |
| `ios`           | `IOSCompiler`                     | Swift (SceneKit)      |
| `android`       | `AndroidCompiler`                 | Kotlin                |

Each compiler extends `CompilerBase` and receives a pre-filtered AST containing only blocks relevant to its target.

### 3.5 Compilation Diagnostics

| Severity | Condition                                                       | Example                                                                               |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Error    | `@platform()` references unknown platform name                  | `@platform(xbox)` → `"xbox" is not a recognized platform target`                      |
| Warning  | Trait used on platform that does not support it                 | `@hand_tracking` on `web` target → `"hand_tracking" unavailable`                      |
| Warning  | `@platform()` block is unreachable for the compile target       | `@platform(visionos)` when compiling for `quest3` → stripped silently                 |
| Info     | All platform variants of a multi-platform composition stripped  | Every `@platform(X)` block rejected → "no platform-specific code included"            |
| Warning  | Object has no unconstrained fallback and no matching constraint | Object "Menu" has `@platform(vr)` and `@platform(ar)` variants but none for `desktop` |

---

## 4. Examples

### 4.1 Single Composition Targeting VisionOS Eye Tracking, AndroidXR Hand Tracking, and WebXR Controller Input

This example demonstrates a spatial menu system that adapts its input modality per platform:

```holoscript
composition "AdaptiveSpatialMenu" {

  // ── Shared State (all platforms) ────────────────────────────────
  @state {
    menuOpen: false
    selectedTool: "pointer"
    toolHistory: []
  }

  // ── Shared Environment (all platforms) ──────────────────────────
  @environment {
    skybox: "workspace_hdri"
    ambientLight: 0.5
    tonemap: "aces"
  }

  // ══════════════════════════════════════════════════════════════════
  // VisionOS: Eye Tracking + Gaze-Based Selection
  // ══════════════════════════════════════════════════════════════════

  @platform(visionos)
  object "EyeTrackedMenu" @eye_tracking {
    position: [0, 1.5, -1]
    layout: "radial"

    @eye_gaze {
      dwellTime: 300  // ms to activate
      feedbackVisual: "ring_fill"
    }

    children: [
      { type: menu_item, id: "pointer", icon: "cursor.png" },
      { type: menu_item, id: "draw", icon: "pen.png" },
      { type: menu_item, id: "erase", icon: "eraser.png" },
      { type: menu_item, id: "select", icon: "hand.png" }
    ]

    interaction "GazeSelect" {
      type: eye_dwell
      action: emit("menu:select", item.id)
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Android XR: Hand Tracking Gestures
  // ══════════════════════════════════════════════════════════════════

  @platform(android-xr)
  object "HandTrackedMenu" @hand_tracking {
    position: [0, 1.5, -1]
    layout: "grid"
    hand: left

    @hand_gesture {
      gestures: [palm_up, pinch, poke]
      handedness: left
    }

    children: [
      { type: menu_item, id: "pointer", position: [0, 0, 0] },
      { type: menu_item, id: "draw", position: [0.1, 0, 0] },
      { type: menu_item, id: "erase", position: [0, 0.1, 0] },
      { type: menu_item, id: "select", position: [0.1, 0.1, 0] }
    ]

    interaction "PinchSelect" {
      type: pinch_gesture
      handedness: right
      action: emit("menu:select", item.id)
    }

    @haptic {
      onHover: { intensity: 0.1, duration: 10 }
      onSelect: { intensity: 0.5, duration: 50 }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // WebXR: Controller Input (Fallback for Browser VR)
  // ══════════════════════════════════════════════════════════════════

  @platform(webxr)
  object "ControllerMenu" {
    position: [0, 1.5, -1]
    layout: "vertical_panel"

    children: [
      { type: menu_button, id: "pointer", text: "Pointer" },
      { type: menu_button, id: "draw", text: "Draw" },
      { type: menu_button, id: "erase", text: "Erase" },
      { type: menu_button, id: "select", text: "Select" }
    ]

    interaction "RaySelect" {
      type: ray_intersection
      handedness: right
      rayLength: 10.0
      action: emit("menu:select", item.id)
    }
  }

  // ── Shared Logic (compiled to all platforms) ────────────────────

  logic {
    on "menu:select" (toolId) {
      state.selectedTool = toolId
      state.toolHistory.push(toolId)
      state.menuOpen = false
      agent.say("Switched to " + toolId + " tool")
    }

    on "menu:toggle" {
      state.menuOpen = !state.menuOpen
    }
  }
}
```

**Compilation results:**

- **VisionOS build**: Only `EyeTrackedMenu` object is included, eye tracking APIs generated
- **Android XR build**: Only `HandTrackedMenu` object is included, hand gesture + haptics APIs generated
- **WebXR build**: Only `ControllerMenu` object is included, ray intersection code generated
- **Shared state + logic**: Compiled to all three platforms identically

### 4.2 Cross-Reality Agent Continuity (Full Example)

See `examples/perception-tests/07-cross-reality-agent-continuity.holo` for a complete museum tour composition that adapts an AI guide agent across 6 platform categories:

- **VR** (`vr`): Full 3D avatar with spatial gestures
- **AR** (`ar`): Spatial persona overlay
- **Mobile/Desktop** (`mobile`, `desktop`): 2D UI chat overlay
- **Automotive** (`automotive`): Voice-only HUD (safety-critical)
- **Wearable** (`wearable`): Haptic nudge + glanceable text

Key features demonstrated:

- Platform-specific embodiment transitions
- Shared state (tour progress, visited exhibits)
- Platform-conditional interactions (walkthrough vs. gallery vs. voice)
- Norms with platform-specific scoping

---

## 5. Migration Guide

### 5.1 Converting Multi-File Compositions to Single Conditional Composition

#### Before: Separate Compositions Per Platform

**Old structure** (3 separate files):

```
compositions/
  museum-tour-vr.holo        # VR-specific composition
  museum-tour-mobile.holo    # Mobile-specific composition
  museum-tour-desktop.holo   # Desktop-specific composition
```

**museum-tour-vr.holo** (duplicates shared state/logic):

```holoscript
composition "MuseumTourVR" {
  @state {
    currentExhibit: "lobby"
    tourProgress: 0.0
  }

  object "GuideAgent" @avatar_embodiment {
    model: "avatars/guide_v2.glb"
    position: [0, 0, -2]
  }

  object "Temple" @interactive {
    model: "exhibits/temple.glb"
    interaction "Walkthrough" {
      type: spatial_tour
    }
  }

  logic {
    on "tour:start" {
      state.currentExhibit = "EgyptianWing"
    }
  }
}
```

**museum-tour-mobile.holo** (duplicates shared state/logic):

```holoscript
composition "MuseumTourMobile" {
  @state {
    currentExhibit: "lobby"
    tourProgress: 0.0
  }

  object "GuideAgent" {
    layout: "bottom-sheet"
    avatarThumbnail: "guide_2d.png"
  }

  object "Temple" @interactive {
    model: "exhibits/temple.glb"
    interaction "Gallery" {
      type: image_carousel
    }
  }

  logic {
    on "tour:start" {
      state.currentExhibit = "EgyptianWing"
    }
  }
}
```

**Problems**:

- Shared state (`@state`) duplicated across 3 files
- Shared logic (`logic {}`) duplicated across 3 files
- Object "Temple" defined 3 times with only `interaction` varying
- Changes to shared logic require updating all 3 files
- Build system must select which composition to compile

#### After: Single Conditional Composition

**New structure** (1 file):

```
compositions/
  museum-tour.holo    # Single unified composition
```

**museum-tour.holo** (platform-conditional sections):

```holoscript
composition "MuseumTour" {

  // ── Shared State (compiled to ALL platforms) ────────────────────
  @state {
    currentExhibit: "lobby"
    tourProgress: 0.0
  }

  // ── Platform-Specific Embodiment ─────────────────────────────────

  @platform(vr)
  object "GuideAgent" @avatar_embodiment {
    model: "avatars/guide_v2.glb"
    position: [0, 0, -2]
  }

  @platform(mobile)
  object "GuideAgent" {
    layout: "bottom-sheet"
    avatarThumbnail: "guide_2d.png"
  }

  @platform(desktop)
  object "GuideAgent" {
    layout: "sidebar"
    avatarThumbnail: "guide_2d.png"
  }

  // ── Shared Object with Platform-Specific Interactions ────────────

  object "Temple" @interactive {
    model: "exhibits/temple.glb"
    position: [-15, 0, 20]

    // VR-only interaction
    @platform(vr)
    interaction "Walkthrough" {
      type: spatial_tour
      waypoints: [[-15, 0, 18], [-14, 0, 22]]
    }

    // Mobile-only interaction
    @platform(mobile)
    interaction "Gallery" {
      type: image_carousel
      images: ["temple_1.jpg", "temple_2.jpg"]
    }

    // Desktop-only interaction
    @platform(desktop)
    interaction "3DViewer" {
      type: orbit_camera
      allowZoom: true
    }
  }

  // ── Shared Logic (compiled to ALL platforms) ─────────────────────

  logic {
    on "tour:start" {
      state.currentExhibit = "EgyptianWing"
    }
  }
}
```

**Benefits**:

- **1 file** instead of 3 → 67% reduction in files
- Shared state written **once** → no duplication
- Shared logic written **once** → single source of truth
- Object "Temple" defined **once** with conditional interactions
- Compiler automatically selects relevant sections based on `--target` flag

### 5.2 Migration Workflow

**Step 1: Identify Shared Sections**

Analyze your multi-file compositions and identify:

- Shared `@state` blocks
- Shared `@environment` blocks
- Shared objects that appear on all platforms
- Shared `logic {}` event handlers
- Shared spatial groups, lights, norms

**Step 2: Merge Into Single Composition**

1. Create new unified composition file
2. Copy shared sections (state, environment, logic) **once** at the top
3. Add `@platform()` decorators to platform-specific objects
4. For objects that exist on all platforms but have varying traits, use nested `@platform()` on interactions/sub-blocks

**Step 3: Identify Platform-Specific Sections**

Tag platform-specific blocks with `@platform()`:

- VR-only objects: `@platform(vr)`
- Mobile-only objects: `@platform(mobile)`
- Desktop-only objects: `@platform(desktop)`
- Multi-platform objects: `@platform(vr, ar)` or `@platform(mobile, desktop)`

**Step 4: Update Build Configuration**

Change your build scripts from:

```bash
# Old: Select different composition per platform
holoscript compile --target visionos compositions/museum-tour-vr.holo
holoscript compile --target ios compositions/museum-tour-mobile.holo
holoscript compile --target web compositions/museum-tour-desktop.holo
```

To:

```bash
# New: Same composition, different targets
holoscript compile --target visionos compositions/museum-tour.holo
holoscript compile --target ios compositions/museum-tour.holo
holoscript compile --target web compositions/museum-tour.holo
```

**Step 5: Validate Output**

1. Compile to each target platform
2. Verify that platform-specific blocks are correctly included/excluded
3. Check bundle sizes (should be smaller due to dead code elimination)
4. Test LSP integration (block dimming, completions)

### 5.3 Common Migration Patterns

#### Pattern 1: Shared Object with Platform-Specific Materials

**Before** (separate files):

```holoscript
// vr-scene.holo
object "Logo" {
  mesh: cube
  material: { color: "#ff0000", roughness: 0.2, metalness: 0.8 }
}

// mobile-scene.holo
object "Logo" {
  mesh: cube
  material: { color: "#ff0000", roughness: 0.6 }  // Simpler for perf
}
```

**After** (conditional):

```holoscript
object "Logo" {
  mesh: cube

  @platform(vr)
  material: { color: "#ff0000", roughness: 0.2, metalness: 0.8 }

  @platform(mobile)
  material: { color: "#ff0000", roughness: 0.6 }
}
```

#### Pattern 2: Category-Level Targeting

Use platform categories instead of listing individual platforms:

**Before**:

```holoscript
@platform(quest3, pcvr, visionos, android-xr)
object "VRHandMenu" { ... }
```

**After**:

```holoscript
@platform(vr)
object "VRHandMenu" { ... }
```

#### Pattern 3: Exclusion for Fallbacks

Use `not:` to define fallback behaviors:

```holoscript
// Default behavior (all platforms except automotive/wearable)
@platform(not: automotive, wearable)
object "FullFeatureMenu" {
  // Rich menu with images, animations, etc.
}

// Minimal fallback for automotive/wearable
@platform(automotive, wearable)
object "MinimalMenu" {
  // Text-only, no animations
}
```

### 5.4 Migration Checklist

- [ ] Identify all compositions targeting multiple platforms
- [ ] Extract shared `@state`, `@environment`, `logic {}` sections
- [ ] Merge into single composition file
- [ ] Add `@platform()` decorators to platform-specific objects
- [ ] Use nested `@platform()` for platform-specific interactions
- [ ] Update build scripts to use `--target` flag instead of file selection
- [ ] Test compilation to each target platform
- [ ] Verify dead code elimination (check generated bundle sizes)
- [ ] Update LSP configuration with active platform target
- [ ] Delete old multi-file compositions
- [ ] Update documentation/examples

---

## 6. AST Changes

### 6.1 New AST Types

**File**: `packages/core/src/parser/HoloCompositionTypes.ts`

```typescript
/**
 * Platform constraint parsed from @platform(...) decorators.
 *
 * Syntax forms:
 *   @platform(quest3)                 -> include: ['quest3'], exclude: []
 *   @platform(phone, desktop)         -> include: ['phone', 'desktop'], exclude: []
 *   @platform(not: car, wearable)     -> include: [], exclude: ['car', 'wearable']
 */
export interface PlatformConstraint {
  /** Target platforms this block applies to (empty = all) */
  include: string[];
  /** Platforms to exclude */
  exclude: string[];
}
```

### 6.2 Modified AST Types

Add `platformConstraint?: PlatformConstraint` field to:

```typescript
export interface HoloObjectDecl {
  type: 'Object';
  name: string;
  properties: HoloProperty[];
  traits: string[];
  children?: HoloObjectDecl[];
  interactions?: HoloInteraction[];
  platformConstraint?: PlatformConstraint; // NEW
  loc?: SourceLocation;
}

export interface HoloTemplate {
  type: 'Template';
  name: string;
  parameters: string[];
  body: HoloObjectDecl[];
  platformConstraint?: PlatformConstraint; // NEW
  loc?: SourceLocation;
}

export interface HoloSpatialGroup {
  type: 'SpatialGroup';
  name: string;
  layout: string;
  objects: HoloObjectDecl[];
  platformConstraint?: PlatformConstraint; // NEW
  loc?: SourceLocation;
}

export interface HoloLight {
  type: 'Light';
  lightType: string;
  properties: HoloProperty[];
  platformConstraint?: PlatformConstraint; // NEW
  loc?: SourceLocation;
}

export interface HoloNormBlock {
  type: 'Norm';
  name: string;
  properties: HoloProperty[];
  platformConstraint?: PlatformConstraint; // NEW
  loc?: SourceLocation;
}

// Proposed for future:
export interface HoloInteraction {
  type: 'Interaction';
  name: string;
  interactionType: string;
  properties: HoloProperty[];
  platformConstraint?: PlatformConstraint; // PROPOSED
  loc?: SourceLocation;
}
```

### 6.3 AST Transformation Example

**Input HoloScript**:

```holoscript
@platform(vr)
object "VRMenu" {
  position: [0, 1, 0]
}
```

**Output AST**:

```typescript
{
  type: 'Object',
  name: 'VRMenu',
  properties: [
    { key: 'position', value: [0, 1, 0] }
  ],
  traits: [],
  platformConstraint: {
    include: ['vr'],
    exclude: []
  },
  loc: { start: { line: 1, col: 1 }, end: { line: 3, col: 2 } }
}
```

---

## 7. Parser Modifications

### 7.1 Lexer Changes

**File**: `packages/core/src/parser/Lexer.ts`

**No changes required** — `@` and `platform` are already tokenized:

- `@` → `AT` token
- `platform` → `IDENTIFIER` token

### 7.2 Parser Changes

**File**: `packages/core/src/parser/HoloCompositionParser.ts`

#### Change 1: Add `parsePlatformConstraint()` Method

**Location**: Line ~3947 (already implemented)

```typescript
/**
 * Parse platform constraint decorator.
 *
 * Syntax:
 *   @platform(quest3)                 → include: ['quest3'], exclude: []
 *   @platform(phone, desktop)         → include: ['phone', 'desktop'], exclude: []
 *   @platform(not: car, wearable)     → include: [], exclude: ['car', 'wearable']
 *
 * Assumes the `@` and `platform` tokens have already been consumed.
 * Expects the opening `(` to be the current token.
 */
private parsePlatformConstraint(): PlatformConstraint {
  this.expect('LPAREN');

  const include: string[] = [];
  const exclude: string[] = [];
  let isExclude = false;

  while (!this.check('RPAREN') && !this.isAtEnd()) {
    this.skipNewlines();
    if (this.check('RPAREN')) break;

    // Check for "not:" prefix
    if (
      this.check('IDENTIFIER') &&
      this.current().value === 'not' &&
      this.peek(1).type === 'COLON'
    ) {
      this.advance(); // consume 'not'
      this.advance(); // consume ':'
      isExclude = true;
      continue;
    }

    // Read platform name (may be hyphenated like "android-xr")
    let platformName = '';
    if (this.check('IDENTIFIER') || this.check('STRING')) {
      platformName = this.check('STRING') ? this.expectString() : this.advance().value;
    } else {
      this.advance(); // skip unexpected token
      continue;
    }

    // Handle hyphenated names: android-xr, visionos-ar, etc.
    while (this.check('MINUS') && this.peek(1).type === 'IDENTIFIER') {
      this.advance(); // consume '-'
      platformName += '-' + this.advance().value;
    }

    if (isExclude) {
      exclude.push(platformName);
    } else {
      include.push(platformName);
    }

    if (this.check('COMMA')) {
      this.advance(); // consume ','
    }
    this.skipNewlines();
  }

  this.expect('RPAREN');
  return { include, exclude };
}
```

#### Change 2: Modify `parseObject()` to Accept Platform Decorator

**Location**: Line ~1800 (approximate)

```typescript
private parseObject(): HoloObjectDecl {
  // Check for @platform() decorator
  let platformConstraint: PlatformConstraint | undefined;

  if (this.check('AT') && this.peek(1).value === 'platform') {
    this.advance(); // consume '@'
    this.advance(); // consume 'platform'
    platformConstraint = this.parsePlatformConstraint();
    this.skipNewlines();
  }

  this.expect('OBJECT');
  const name = this.expectString();

  // ... rest of parseObject() logic ...

  return {
    type: 'Object',
    name,
    properties,
    traits,
    children,
    interactions,
    platformConstraint,  // Attach platform constraint
    loc: this.getLocation(startLoc),
  };
}
```

#### Change 3: Apply Same Pattern to Template, SpatialGroup, Light, Norm

Modify `parseTemplate()`, `parseSpatialGroup()`, `parseLight()`, `parseNorm()` to:

1. Check for `@platform()` decorator before the block keyword
2. Call `parsePlatformConstraint()` if found
3. Attach `platformConstraint` to the returned AST node

**Example for `parseTemplate()`**:

```typescript
private parseTemplate(): HoloTemplate {
  let platformConstraint: PlatformConstraint | undefined;

  if (this.check('AT') && this.peek(1).value === 'platform') {
    this.advance();
    this.advance();
    platformConstraint = this.parsePlatformConstraint();
    this.skipNewlines();
  }

  this.expect('TEMPLATE');
  const name = this.expectString();

  // ... rest of parseTemplate() logic ...

  return {
    type: 'Template',
    name,
    parameters,
    body,
    platformConstraint,
    loc: this.getLocation(startLoc),
  };
}
```

### 7.3 Tree-sitter Grammar Modifications

**File**: `packages/tree-sitter-holoscript/grammar.js`

**Status**: NOT YET IMPLEMENTED (tree-sitter grammar currently has no `@platform()` support)

#### Required Changes

1. **Add platform decorator rule**:

```javascript
platform_decorator: ($) =>
  seq(
    '@',
    'platform',
    '(',
    choice(
      seq('not', ':', $.platform_list),
      $.platform_list,
    ),
    ')'
  ),

platform_list: ($) =>
  sepBy($.platform_name, ','),

platform_name: ($) =>
  token(seq(
    /[a-z][a-z0-9]*/,
    repeat(seq('-', /[a-z][a-z0-9]*/))
  )),
```

2. **Modify object rule to accept optional platform decorator**:

```javascript
object: ($) =>
  seq(
    optional($.platform_decorator),  // NEW
    'object',
    $.string,
    optional($.trait_list),
    '{',
    repeat(choice(
      $.property,
      $.interaction,
      $.object,
    )),
    '}'
  ),
```

3. **Apply same pattern to template, spatial_group, light, norm**:

```javascript
template: ($) =>
  seq(
    optional($.platform_decorator),  // NEW
    'template',
    $.string,
    // ... rest of template rule
  ),

spatial_group: ($) =>
  seq(
    optional($.platform_decorator),  // NEW
    'spatial_group',
    $.string,
    // ... rest of spatial_group rule
  ),

light: ($) =>
  seq(
    optional($.platform_decorator),  // NEW
    'light',
    // ... rest of light rule
  ),

norm: ($) =>
  seq(
    optional($.platform_decorator),  // NEW
    'norm',
    $.string,
    // ... rest of norm rule
  ),
```

4. **Rebuild tree-sitter grammar**:

```bash
cd packages/tree-sitter-holoscript
npm run build
npm test
```

---

## 8. Implementation Status

### 8.1 Already Implemented

- [x] `PlatformConstraint` type in `HoloCompositionTypes.ts`
- [x] `parsePlatformConstraint()` in `HoloCompositionParser.ts` (line 3947)
- [x] `PlatformConditional.ts` with platform hierarchy, categories, capabilities
- [x] `PlatformConditionalCompilerMixin.ts` with `filterForPlatform()`
- [x] `matchesPlatformConstraint()` with include/exclude/category expansion
- [x] Platform aliases (`phone` → `mobile`, `car` → `automotive`)
- [x] Platform capability profiles per target
- [x] Example composition: `examples/perception-tests/07-cross-reality-agent-continuity.holo`
- [x] Unit tests for `PlatformConditional`

### 8.2 Remaining Work

#### Phase 1: Stabilize Existing Implementation

- [ ] Ensure all compilers call `filterForPlatform()` before compilation
  - **Files**: `VisionOSCompiler.ts`, `AndroidXRCompiler.ts`, `OpenXRCompiler.ts`, etc.
  - **Change**: In each compiler's `compile()` method, add:
    ```typescript
    const mixin = new PlatformConditionalCompilerMixin();
    const filtered = mixin.filterForPlatform(composition, this.target);
    // Then compile `filtered` instead of `composition`
    ```

- [ ] Add `@platform()` support for nested blocks (interactions)
  - **File**: `HoloCompositionTypes.ts`
  - **Change**: Add `platformConstraint?: PlatformConstraint` to `HoloInteraction`
  - **File**: `HoloCompositionParser.ts`
  - **Change**: Modify `parseInteraction()` to check for `@platform()` decorator

- [ ] Add compile-time diagnostic for unknown platform names
  - **File**: `PlatformConditionalCompilerMixin.ts`
  - **Change**: In `matchesPlatformConstraint()`, check if platform names are in `ALL_PLATFORMS`
  - **Emit**: Warning diagnostic for unknown names

#### Phase 2: Tree-sitter Grammar

- [ ] Add `platform_decorator` rule to `grammar.js`
- [ ] Modify `object`, `template`, `spatial_group`, `light`, `norm` rules
- [ ] Rebuild grammar (`npm run build`)
- [ ] Add tests for `@platform()` syntax parsing
- [ ] Regenerate language bindings

#### Phase 3: LSP Platform Awareness

- [ ] Implement `activePlatformTarget` setting in LSP configuration
  - **File**: `packages/lsp/src/server.ts`
  - **Change**: Add workspace configuration for active platform target

- [ ] Add `platformInactive` semantic token modifier
  - **File**: `packages/lsp/src/semanticTokens.ts`
  - **Change**: Dim tokens inside non-matching platform blocks

- [ ] Platform-aware trait completions
  - **File**: `packages/lsp/src/completions.ts`
  - **Change**: Filter trait completions based on active target platform

- [ ] `@platform()` argument completions
  - **File**: `packages/lsp/src/completions.ts`
  - **Change**: Suggest platform names/categories inside `@platform(...)`

- [ ] Inlay hints showing expanded platform lists
  - **File**: `packages/lsp/src/inlayHints.ts`
  - **Change**: Show `// [quest3, pcvr, visionos, android-xr]` after `@platform(vr)`

- [ ] CodeLens for platform blocks
  - **File**: `packages/lsp/src/codeLens.ts`
  - **Change**: Show "Targets: quest3, pcvr, visionos, android-xr" above blocks

#### Phase 4: VSCode Extension

- [ ] Status bar platform selector widget
  - **File**: `packages/vscode-extension/src/extension.ts`
  - **Change**: Add status bar item with dropdown to select active platform

- [ ] `HoloScript: Set Target Platform` command
  - **File**: `packages/vscode-extension/src/commands.ts`
  - **Change**: Register command to change active platform target

- [ ] Custom TextMate scopes for platform decorators
  - **File**: `packages/vscode-extension/syntaxes/holoscript.tmLanguage.json`
  - **Change**: Add scope `entity.name.decorator.platform.holoscript`

- [ ] Block dimming/folding for non-active platform blocks
  - **File**: `packages/vscode-extension/src/decorations.ts`
  - **Change**: Apply gray overlay to blocks not matching active target

---

## 9. Appendix: Platform Matrix

### 9.1 Platform Capabilities

| Platform      | Spatial | Hand | Eye | Haptics | Spatial Audio | GPU | AR  | GPS | NPU | Frame Budget |
| ------------- | :-----: | :--: | :-: | :-----: | :-----------: | :-: | :-: | :-: | :-: | :----------: |
| quest3        |    ✓    |  ✓   |  ✓  |    ✓    |       ✓       |  ✓  |  ✓  |  ✗  |  ✓  |   11.1 ms    |
| pcvr          |    ✓    |  ✓   |  ✓  |    ✓    |       ✓       |  ✓  |  ✗  |  ✗  |  ✗  |   11.1 ms    |
| visionos      |    ✓    |  ✓   |  ✓  |    ✗    |       ✓       |  ✓  |  ✓  |  ✗  |  ✓  |   11.1 ms    |
| android-xr    |    ✓    |  ✓   |  ✓  |    ✓    |       ✓       |  ✓  |  ✓  |  ✓  |  ✓  |   11.1 ms    |
| visionos-ar   |    ✓    |  ✓   |  ✓  |    ✗    |       ✓       |  ✓  |  ✓  |  ✓  |  ✓  |   16.6 ms    |
| android-xr-ar |    ✓    |  ✓   |  ✗  |    ✓    |       ✓       |  ✓  |  ✓  |  ✓  |  ✓  |   16.6 ms    |
| webxr         |    ✓    |  ✗   |  ✗  |    ✗    |       ✗       |  ✓  |  ✓  |  ✗  |  ✗  |   16.6 ms    |
| ios           |    ✗    |  ✗   |  ✗  |    ✓    |       ✗       |  ✓  |  ✓  |  ✓  |  ✓  |   16.6 ms    |
| android       |    ✗    |  ✗   |  ✗  |    ✓    |       ✗       |  ✓  |  ✓  |  ✓  |  ✓  |   16.6 ms    |
| windows       |    ✗    |  ✗   |  ✗  |    ✗    |       ✗       |  ✓  |  ✗  |  ✗  |  ✗  |   16.6 ms    |
| macos         |    ✗    |  ✗   |  ✗  |    ✗    |       ✗       |  ✓  |  ✗  |  ✗  |  ✓  |   16.6 ms    |
| linux         |    ✗    |  ✗   |  ✗  |    ✗    |       ✗       |  ✓  |  ✗  |  ✗  |  ✗  |   16.6 ms    |
| web           |    ✗    |  ✗   |  ✗  |    ✗    |       ✗       |  ✓  |  ✗  |  ✗  |  ✗  |   16.6 ms    |
| android-auto  |    ✗    |  ✗   |  ✗  |    ✗    |       ✓       |  ✗  |  ✗  |  ✓  |  ✗  |    30 ms     |
| carplay       |    ✗    |  ✗   |  ✗  |    ✗    |       ✓       |  ✗  |  ✗  |  ✓  |  ✗  |    30 ms     |
| watchos       |    ✗    |  ✗   |  ✗  |    ✓    |       ✗       |  ✗  |  ✗  |  ✓  |  ✓  |   33.3 ms    |
| wearos        |    ✗    |  ✗   |  ✗  |    ✓    |       ✗       |  ✗  |  ✗  |  ✓  |  ✗  |   33.3 ms    |

### 9.2 Trait Compatibility Matrix

#### Spatial Tracking Traits

| Trait             | VisionOS | AndroidXR | Quest3 | PCVR |  WebXR  | iOS  | Android | Desktop |
| ----------------- | :------: | :-------: | :----: | :--: | :-----: | :--: | :-----: | :-----: |
| `hand_tracking`   |   full   |   full    |  full  | full |   --    |  --  |   --    |   --    |
| `eye_tracking`    |   full   |   full    |  full  | full |   --    |  --  |   --    |   --    |
| `plane_detection` |   full   |   full    |  full  |  --  | partial | full |  full   |   --    |
| `mesh_detection`  |   full   |   full    |  full  |  --  |   --    | full |   --    |   --    |
| `anchor`          |   full   |   full    |  full  | full | partial | full |  full   |   --    |
| `world_anchor`    |   full   |   full    |  full  |  --  |   --    | full |  full   |   --    |
| `geospatial`      |    --    |   full    |   --   |  --  |   --    | full |  full   |   --    |

#### Interaction Traits

| Trait       | VisionOS | AndroidXR | Quest3 | PCVR |  WebXR  | iOS  | Android | Desktop |
| ----------- | :------: | :-------: | :----: | :--: | :-----: | :--: | :-----: | :-----: |
| `grabbable` |   full   |   full    |  full  | full | partial |  --  |   --    |   --    |
| `hoverable` |   full   |   full    |  full  | full | partial |  --  |   --    |  full   |
| `clickable` |   full   |   full    |  full  | full |  full   | full |  full   |  full   |
| `draggable` |   full   |   full    |  full  | full | partial | full |  full   |  full   |
| `throwable` |   full   |   full    |  full  | full |   --    |  --  |   --    |   --    |

#### Platform-Exclusive Traits

| Trait               | Platform                 | Category      | Notes                           |
| ------------------- | ------------------------ | ------------- | ------------------------------- |
| `shareplay`         | visionos                 | Collaboration | GroupActivities framework       |
| `spatial_persona`   | visionos                 | Social        | visionOS 2.0 Spatial Persona    |
| `volumetric_window` | visionos                 | Windowing     | WindowGroup .volumetric style   |
| `face_tracking`     | android-xr               | Tracking      | 68 blendshapes (DP3)            |
| `controller_input`  | quest3, pcvr             | Input         | Quest Touch / Index controllers |
| `haptic`            | quest3, pcvr, android-xr | Feedback      | Controller/hand haptics         |

### 9.3 Platform to Compiler Mapping

| Platform Target | Default Compiler    | Output Language      | Notes               |
| --------------- | ------------------- | -------------------- | ------------------- |
| `visionos`      | `VisionOSCompiler`  | Swift (RealityKit)   | VR mode             |
| `visionos-ar`   | `VisionOSCompiler`  | Swift (ARKit)        | AR passthrough mode |
| `android-xr`    | `AndroidXRCompiler` | Kotlin (Jetpack XR)  | VR mode             |
| `android-xr-ar` | `AndroidXRCompiler` | Kotlin (ARCore)      | AR passthrough mode |
| `quest3`        | `OpenXRCompiler`    | C++ (OpenXR+Vulkan)  | Standalone headset  |
| `pcvr`          | `OpenXRCompiler`    | C++ (OpenXR+Vulkan)  | Tethered to PC      |
| `webxr`         | `R3FCompiler`       | TypeScript (R3F)     | Browser-based VR/AR |
| `ios`           | `IOSCompiler`       | Swift (SceneKit)     | iPhone/iPad         |
| `android`       | `AndroidCompiler`   | Kotlin               | Phone/tablet        |
| `windows`       | `WebGPUCompiler`    | TypeScript (WebGPU)  | Desktop             |
| `macos`         | `WebGPUCompiler`    | TypeScript (WebGPU)  | Desktop             |
| `linux`         | `WebGPUCompiler`    | TypeScript (WebGPU)  | Desktop             |
| `web`           | `BabylonCompiler`   | JavaScript (Babylon) | Browser             |
| `android-auto`  | `AndroidCompiler`   | Kotlin (Auto)        | In-vehicle          |
| `carplay`       | `IOSCompiler`       | Swift (CarPlay)      | In-vehicle          |
| `watchos`       | `IOSCompiler`       | Swift (WatchKit)     | Apple Watch         |
| `wearos`        | `AndroidCompiler`   | Kotlin (Wear OS)     | Android watches     |

---

**End of RFC**

_This document specifies the complete design and implementation of HoloScript's `@platform()` conditional compilation system. The core infrastructure is implemented; remaining work includes LSP integration, tree-sitter grammar updates, and VSCode extension enhancements._
