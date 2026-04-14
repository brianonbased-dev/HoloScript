# RFC: @platform() Conditional Compilation

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| **RFC**     | RFC-0012                                   |
| **Title**   | Platform Conditional Compilation           |
| **Status**  | Draft                                      |
| **Author**  | HoloScript Core Team                       |
| **Created** | 2026-03-06                                 |
| **Updated** | 2026-03-06                                 |
| **Targets** | Parser, Compiler, LSP, Tree-sitter Grammar |

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Proposed Syntax](#2-proposed-syntax)
3. [Trait Availability per Platform Matrix](#3-trait-availability-per-platform-matrix)
4. [Compilation Behavior](#4-compilation-behavior)
5. [LSP Integration](#5-lsp-integration)
6. [Examples](#6-examples)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Appendix: Existing Architecture Reference](#8-appendix-existing-architecture-reference)

---

## 1. Motivation

### 1.1 Problem Statement

Spatial computing applications must run on a proliferating set of platforms with
radically different capabilities. A single HoloScript composition describing a
museum tour, a collaborative workspace, or an interactive product demo must
target:

| Platform      | Runtime        | Capabilities                                          | Frame Budget |
| ------------- | -------------- | ----------------------------------------------------- | ------------ |
| **VisionOS**  | RealityKit     | Hand tracking, eye tracking, spatial audio, portals   | 11.1 ms      |
| **AndroidXR** | Jetpack XR     | Hand tracking, eye tracking, passthrough, GPS         | 11.1 ms      |
| **WebXR**     | Three.js/R3F   | Limited hand tracking, no eye tracking, browser-bound | 16.6 ms      |
| **Quest**     | OpenXR/Vulkan  | Hand + controller, haptics, passthrough               | 11.1 ms      |
| **PCVR**      | OpenXR/Vulkan  | Full PC GPU, hand + controller, haptics               | 11.1 ms      |
| **Desktop**   | Browser/Native | Mouse/keyboard, no spatial tracking                   | 16.6 ms      |

Today, developers must either:

1. **Write separate compositions per platform** -- duplicating shared logic
   (scene graph, state, norms, audio) and creating maintenance overhead that
   grows linearly with the number of target platforms.

2. **Maintain runtime conditionals** -- shipping all platform code to every
   target, inflating bundle size, and requiring runtime feature detection that
   adds latency in the critical render path.

3. **Use external build tooling** -- preprocessing `.holo` files through
   non-standard templating systems that break LSP integration, syntax
   highlighting, and the compositional nature of HoloScript.

### 1.2 Solution: Compile-Time Platform Conditional Blocks

The `@platform()` decorator enables a single HoloScript composition to contain
platform-specific sections that are **resolved at compile time**. Non-matching
blocks are stripped during compilation (dead code elimination), producing
target-specific output with zero runtime overhead.

### 1.3 Design Goals

- **Single Source of Truth**: One `.holo` file per experience, not one per
  platform. Shared logic (state, norms, environment, audio) is written once.

- **Zero Runtime Cost**: The compiler strips non-target blocks entirely. The
  compiled output contains only code for the selected platform. No
  `if (platform === 'quest3')` in generated code.

- **Compositional**: Platform blocks compose naturally with HoloScript's
  existing block types (objects, templates, spatial groups, norms, lights,
  interactions).

- **LSP-Friendly**: The language server understands platform blocks and provides
  contextual completions, diagnostics, and visual indicators based on the
  active target platform.

- **Category-Level Abstraction**: Authors can target form factors (`vr`, `ar`,
  `mobile`, `desktop`, `automotive`, `wearable`) instead of individual devices,
  with the ability to specialize when needed.

### 1.4 Prior Art

| System                                 | Approach                            | HoloScript Advantage                         |
| -------------------------------------- | ----------------------------------- | -------------------------------------------- |
| Rust `#[cfg(target_os)]`               | Attribute-based conditional compile | HoloScript adds categories + unions          |
| C# `#if UNITY_IOS`                     | Preprocessor directives             | HoloScript is declarative, not preprocessor  |
| Kotlin Multiplatform `expect`/`actual` | Interface-based platform split      | HoloScript keeps one file, not split modules |
| Flutter `Platform.isAndroid`           | Runtime check                       | HoloScript is compile-time, zero cost        |

---

## 2. Proposed Syntax

### 2.1 Basic Form: Single Platform

Target a single specific platform:

```holoscript
@platform(visionos)
object "OrnamentPanel" {
  // ... only compiled when target is visionos
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

### 2.5 Pipe Union Syntax (Proposed Extension)

For ergonomic inline expressions, an alternative pipe (`|`) union syntax:

```holoscript
@platform(quest3 | android-xr)
object "XRHandMenu" {
  // Equivalent to @platform(quest3, android-xr)
}
```

**Status**: This is a proposed future extension. The current parser uses commas.
The pipe syntax would require a grammar change in both the hand-written parser
(`HoloCompositionParser.ts`) and the tree-sitter grammar (`grammar.js`). It is
recommended as syntactic sugar after the comma form is stabilized.

**Parser change required**: In `parsePlatformConstraint()`, add handling for a
`PIPE` or `BAR` token between identifiers, treating it identically to `COMMA`.

### 2.6 Nesting and Scope

Platform decorators can be applied at multiple levels:

```holoscript
// Root level: decorates entire objects, templates, norms, spatial groups, lights
@platform(vr)
object "VROnlyObject" { ... }

// Inside an object: decorates interactions, sub-blocks
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

### 2.7 Grammar Specification

#### Current Parser Grammar (HoloCompositionParser.ts)

```
platform_decorator := '@' 'platform' '(' platform_args ')'
platform_args      := platform_list | 'not' ':' platform_list
platform_list      := platform_name (',' platform_name)*
platform_name      := IDENTIFIER ('-' IDENTIFIER)*   // e.g., android-xr
```

#### Proposed Tree-sitter Grammar Addition

```javascript
platform_decorator: ($) =>
  seq(
    '@platform',
    '(',
    choice(
      seq('not', ':', $.platform_list),
      $.platform_list,
    ),
    ')'
  ),

platform_list: ($) =>
  sepBy1($.platform_name, choice(',', '|')),

platform_name: ($) =>
  token(seq(
    /[a-z][a-z0-9]*/,
    repeat(seq('-', /[a-z][a-z0-9]*/))
  )),
```

### 2.8 AST Representation

The `PlatformConstraint` interface (already defined in
`packages/core/src/parser/HoloCompositionTypes.ts`):

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

The constraint is attached as an optional field on AST nodes:

```typescript
export interface HoloObjectDecl {
  // ... existing fields ...
  platformConstraint?: PlatformConstraint;
}
```

---

## 3. Trait Availability per Platform Matrix

### 3.1 Core Trait Compatibility

This matrix shows which HoloScript traits are available on each platform target.
Traits marked `full` generate native code. Traits marked `partial` generate
stubs with TODOs. Traits marked `--` are not available.

#### Spatial Tracking Traits

| Trait                  | VisionOS | AndroidXR | Quest3  | PCVR |  WebXR  |   iOS   | Android | Desktop |
| ---------------------- | :------: | :-------: | :-----: | :--: | :-----: | :-----: | :-----: | :-----: |
| `hand_tracking`        |   full   |   full    |  full   | full |   --    |   --    |   --    |   --    |
| `eye_tracking`         |   full   |   full    |  full   | full |   --    |   --    |   --    |   --    |
| `plane_detection`      |   full   |   full    |  full   |  --  | partial |  full   |  full   |   --    |
| `mesh_detection`       |   full   |   full    |  full   |  --  |   --    |  full   |   --    |   --    |
| `object_tracking`      | partial  |  partial  | partial |  --  |   --    |   --    |   --    |   --    |
| `scene_reconstruction` | partial  |  partial  |   --    |  --  |   --    | partial |   --    |   --    |
| `anchor`               |   full   |   full    |  full   | full | partial |  full   |  full   |   --    |
| `world_anchor`         |   full   |   full    |  full   |  --  |   --    |  full   |  full   |   --    |
| `geospatial`           |    --    |   full    |   --    |  --  |   --    |  full   |  full   |   --    |

#### Interaction Traits

| Trait       | VisionOS | AndroidXR | Quest3 | PCVR |  WebXR  | iOS  | Android | Desktop |
| ----------- | :------: | :-------: | :----: | :--: | :-----: | :--: | :-----: | :-----: |
| `grabbable` |   full   |   full    |  full  | full | partial |  --  |   --    |   --    |
| `hoverable` |   full   |   full    |  full  | full | partial |  --  |   --    |  full   |
| `clickable` |   full   |   full    |  full  | full |  full   | full |  full   |  full   |
| `draggable` |   full   |   full    |  full  | full | partial | full |  full   |  full   |
| `throwable` |   full   |   full    |  full  | full |   --    |  --  |   --    |   --    |
| `scalable`  |   full   |   full    |  full  | full |   --    | full |  full   |   --    |
| `rotatable` |   full   |   full    |  full  | full |   --    | full |  full   |   --    |

#### Physics Traits

| Trait        | VisionOS | AndroidXR | Quest3  | PCVR | WebXR | iOS | Android | Desktop |
| ------------ | :------: | :-------: | :-----: | :--: | :---: | :-: | :-----: | :-----: |
| `physics`    |   full   |   full    |  full   | full | full  | --  |   --    |  full   |
| `collidable` |   full   |   full    |  full   | full | full  | --  |   --    |  full   |
| `cloth`      | partial  |  partial  | partial | full |  --   | --  |   --    | partial |
| `soft_body`  | partial  |  partial  | partial | full |  --   | --  |   --    | partial |
| `fluid`      | partial  |  partial  |   --    | full |  --   | --  |   --    | partial |

#### Audio Traits

| Trait             | VisionOS | AndroidXR | Quest3 | PCVR | WebXR | iOS  | Android | Desktop |
| ----------------- | :------: | :-------: | :----: | :--: | :---: | :--: | :-----: | :-----: |
| `spatial_audio`   |   full   |   full    |  full  | full |  --   |  --  |   --    |   --    |
| `ambisonics`      |   full   |   full    |  full  | full |  --   |  --  |   --    |   --    |
| `audio_occlusion` |   full   |   full    |  full  | full |  --   |  --  |   --    |   --    |
| `reverb_zone`     |   full   |   full    |  full  | full |  --   |  --  |   --    |   --    |
| `audio`           |   full   |   full    |  full  | full | full  | full |  full   |  full   |

#### Visual / Rendering Traits

| Trait              | VisionOS | AndroidXR | Quest3  |  PCVR   |  WebXR  | iOS  | Android | Desktop |
| ------------------ | :------: | :-------: | :-----: | :-----: | :-----: | :--: | :-----: | :-----: |
| `billboard`        |   full   |   full    |  full   |  full   |  full   | full |  full   |  full   |
| `particle_emitter` |   full   |   full    |  full   |  full   |  full   | full |  full   |  full   |
| `animated`         |   full   |   full    |  full   |  full   |  full   | full |  full   |  full   |
| `lod`              | partial  |  partial  | partial |  full   | partial |  --  |   --    | partial |
| `portal`           |   full   |  partial  | partial | partial |   --    |  --  |   --    |   --    |
| `volume`           |   full   |  partial  |   --    |   --    |   --    |  --  |   --    |   --    |
| `immersive`        |   full   |   full    |  full   |  full   | partial |  --  |   --    |   --    |

#### Accessibility Traits

| Trait            | VisionOS | AndroidXR | Quest3  |  PCVR   | WebXR | iOS  | Android | Desktop |
| ---------------- | :------: | :-------: | :-----: | :-----: | :---: | :--: | :-----: | :-----: |
| `accessible`     |   full   |   full    | partial | partial | full  | full |  full   |  full   |
| `alt_text`       |   full   |   full    | partial | partial | full  | full |  full   |  full   |
| `high_contrast`  |   full   |   full    |   --    |   --    | full  | full |  full   |  full   |
| `motion_reduced` |   full   |   full    | partial | partial | full  | full |  full   |  full   |

#### Platform-Exclusive Traits

| Trait               | Platform                 | Category      | Notes                           |
| ------------------- | ------------------------ | ------------- | ------------------------------- |
| `shareplay`         | visionos                 | Collaboration | GroupActivities framework       |
| `spatial_persona`   | visionos                 | Social        | visionOS 2.0 Spatial Persona    |
| `volumetric_window` | visionos                 | Windowing     | WindowGroup .volumetric style   |
| `face_tracking`     | android-xr               | Tracking      | 68 blendshapes (DP3)            |
| `drm_video`         | android-xr               | Media         | SurfaceEntity + Widevine        |
| `follows_head`      | android-xr               | UI            | UserSubspace follow behavior    |
| `controller_input`  | quest3, pcvr             | Input         | Quest Touch / Index controllers |
| `haptic`            | quest3, pcvr, android-xr | Feedback      | Controller/hand haptics         |

### 3.2 Capability-Based Trait Guards

Beyond explicit `@platform()` constraints, traits can declare capability
requirements. The compiler validates these at compile time:

```typescript
// In PlatformConditional.ts
export interface PlatformCapabilities {
  spatialTracking: boolean;
  handTracking: boolean;
  eyeTracking: boolean;
  haptics: boolean;
  spatialAudio: boolean;
  gpu3D: boolean;
  arCamera: boolean;
  gps: boolean;
  npu: boolean;
  webxrSupport: boolean;
  frameBudgetMs: number;
  agentBudgetMs: number;
  computeModel: 'edge-first' | 'cloud-first' | 'safety-critical';
}
```

A trait that requires `handTracking: true` will emit a compile-time warning if
used on platforms where `handTracking` is `false`, even without an explicit
`@platform()` guard.

---

## 4. Compilation Behavior

### 4.1 Overview: The Dead Code Elimination Pipeline

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

### 4.2 Step 1: Parsing

The parser (`HoloCompositionParser.parsePlatformConstraint()`) converts the
`@platform(...)` syntax into a `PlatformConstraint` AST node, which is
attached to the subsequent block declaration.

**Current parser location**: `packages/core/src/parser/HoloCompositionParser.ts`
line ~3947.

**Parsing rules**:

- The `@` and `platform` tokens are consumed first.
- `parsePlatformConstraint()` reads the `(...)` arguments.
- Hyphenated platform names (e.g., `android-xr`) are assembled from
  `IDENTIFIER - IDENTIFIER` sequences.
- The `not:` prefix sets the exclude mode.
- The resulting `PlatformConstraint` is stored on the next parsed block.

### 4.3 Step 2: Platform Filtering (Dead Code Elimination)

The `PlatformConditionalCompilerMixin` class (in
`packages/core/src/compiler/PlatformConditionalCompilerMixin.ts`) provides the
`filterForPlatform()` method, which takes a full `HoloComposition` and a
`CompilePlatformTarget` and returns a new composition with non-matching blocks
removed.

```typescript
class PlatformConditionalCompilerMixin {
  filterForPlatform(composition: HoloComposition, target: CompilePlatformTarget): HoloComposition {
    return {
      ...composition,
      objects: this.filterBlocks(composition.objects, target),
      templates: this.filterBlocks(composition.templates, target),
      spatialGroups: this.filterBlocks(composition.spatialGroups, target),
      lights: this.filterBlocks(composition.lights, target),
      norms: composition.norms ? this.filterBlocks(composition.norms, target) : undefined,
    };
  }
}
```

**Matching algorithm** (from `matchesPlatformConstraint()`):

1. If the constraint is `undefined`, the block matches **all** platforms.
2. If `exclude` is non-empty, expand category names and aliases. If the target
   platform or its category is in the exclude list, **reject**.
3. If `include` is non-empty, expand category names and aliases. If the target
   platform or its category is in the include list, **accept**. Otherwise,
   **reject**.
4. If `include` is empty (and the block was not excluded), **accept**.

**Category expansion**: The string `"vr"` expands to
`['quest3', 'pcvr', 'visionos', 'android-xr']`. The alias `"phone"` expands
to `"mobile"` which expands to `['ios', 'android']`.

### 4.4 Step 3: Target-Specific Compilation

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

Each compiler extends `CompilerBase` and is unaware of platform conditional
logic -- it receives a pre-filtered AST containing only blocks relevant to its
target.

### 4.5 Compilation Diagnostics

The compiler should emit the following diagnostics:

| Severity | Condition                                                       | Example                                                                               |
| -------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Error    | `@platform()` references unknown platform name                  | `@platform(xbox)` -- `"xbox" is not a recognized platform target`                     |
| Warning  | Trait used on platform that does not support it                 | `@hand_tracking` on `web` target -- `"hand_tracking" unavailable`                     |
| Warning  | `@platform()` block is unreachable for the compile target       | `@platform(visionos)` when compiling for `quest3` -- stripped silently                |
| Info     | All platform variants of a multi-platform composition stripped  | Every `@platform(X)` block rejected -- "no platform-specific code included"           |
| Warning  | Object has no unconstrained fallback and no matching constraint | Object "Menu" has `@platform(vr)` and `@platform(ar)` variants but none for `desktop` |

### 4.6 Multi-Target Build

The compiler can be invoked in multi-target mode to produce outputs for all
specified targets in a single pass:

```typescript
const targets: PlatformTarget[] = ['visionos', 'quest3', 'webxr'];
const results: Record<PlatformTarget, string> = {};

for (const target of targets) {
  const filtered = mixin.filterForPlatform(composition, createPlatformTarget(target));
  const compiler = getCompilerForTarget(target);
  results[target] = compiler.compile(filtered, agentToken);
}
```

This avoids re-parsing the `.holo` source for each target.

---

## 5. LSP Integration

### 5.1 Platform-Aware Completions

The Language Server (`packages/lsp/src/`) should provide contextual completions
inside `@platform()`:

```
@platform(|)
           ^--- Suggest: visionos, android-xr, quest3, pcvr, webxr,
                         ios, android, windows, macos, linux, web,
                         android-auto, carplay, watchos, wearos,
                         vr, ar, mobile, desktop, automotive, wearable,
                         phone, car, not:
```

After `not:`:

```
@platform(not: |)
               ^--- Suggest same platform/category list
```

### 5.2 Active Platform Context

The LSP should maintain an "active platform target" setting (configurable via
editor settings or a status bar selector). This enables:

#### 5.2.1 Block Dimming

When the active target is `quest3`, blocks decorated with `@platform(visionos)`
should be rendered with reduced opacity or a gray overlay to indicate they will
be stripped during compilation.

**Implementation**: The LSP sends `textDocument/semanticTokens` with a custom
token modifier `platformInactive` for tokens inside non-matching platform
blocks.

#### 5.2.2 Block Folding

Platform blocks that do not match the active target should be foldable by
default. The LSP provides folding ranges for these blocks:

```typescript
// In LSP folding range provider
if (node.type === 'object' && node.platformConstraint) {
  if (!matchesPlatformConstraint(node.platformConstraint, activeTarget)) {
    foldingRanges.push({
      startLine: node.loc.start.line,
      endLine: node.loc.end.line,
      kind: FoldingRangeKind.Region,
    });
  }
}
```

#### 5.2.3 Contextual Trait Completions

Inside a `@platform(visionos)` block, the LSP should prioritize
VisionOS-specific traits in autocomplete:

```
@platform(visionos)
object "Panel" {
  @|
   ^--- Prioritized: shareplay, spatial_persona, volumetric_window, portal, volume
        Available:    grabbable, clickable, physics, animated, ...
        Unavailable:  controller_input (not on visionos), haptic (not on visionos)
}
```

Traits marked `unsupported` for the platform should either be hidden or shown
with a strikethrough/warning icon.

#### 5.2.4 Inline Platform Indicators

The LSP can provide `textDocument/inlayHints` to show which platforms a block
targets:

```holoscript
@platform(vr)                         // [quest3, pcvr, visionos, android-xr]
object "SpatialMenu" { ... }

@platform(not: automotive, wearable)  // [quest3, pcvr, visionos, android-xr, visionos-ar, ...]
object "FullFeatureSet" { ... }
```

### 5.3 Diagnostic Integration

The LSP should surface the diagnostics described in section 4.5 as squiggly
underlines:

- **Red underline**: Unknown platform name in `@platform()`.
- **Yellow underline**: Trait used inside a platform block that does not
  support it.
- **Blue info underline**: Block will be stripped for the active target platform.

### 5.4 VSCode Extension Integration

The `packages/vscode-extension/src/` should add:

1. **Status bar item**: Shows the active target platform with a dropdown
   selector.
2. **Command palette**: `HoloScript: Set Target Platform` to change the active
   target.
3. **Color theme tokens**: Custom TextMate scopes for platform decorators
   (`entity.name.decorator.platform.holoscript`).
4. **CodeLens**: Above `@platform()` blocks, show "Targets: quest3, pcvr,
   visionos, android-xr" as a clickable CodeLens.

---

## 6. Examples

### 6.1 Single Composition with Platform-Specific Sections

This example demonstrates a collaborative workspace that adapts its interaction
model and UI per platform:

```holoscript
composition "CollaborativeWorkspace" {

  // ── Shared State (all platforms) ────────────────────────────────
  @state {
    participants: []
    activeDocument: null
    cursorPositions: {}
    isPresenting: false
  }

  // ── Shared Environment (all platforms) ──────────────────────────
  @environment {
    skybox: "office_hdri"
    ambientLight: 0.4
    tonemap: "aces"
  }

  // ── Shared Objects (no @platform = compiled everywhere) ─────────
  object "SharedWhiteboard" @interactive @crdt_room {
    model: "props/whiteboard_4k.glb"
    position: [0, 1.5, -3]
    crdt_channel: "whiteboard-sync"

    interaction "Draw" {
      type: freehand
      tool: pen
      syncMode: realtime
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // VisionOS-Specific: Ornaments, SharePlay, Volumes
  // ══════════════════════════════════════════════════════════════════

  @platform(visionos)
  object "OrnamentToolbar" {
    type: ui_panel
    position: [0, -0.2, -0.5]

    // visionOS ornament: docked UI below the volumetric window
    @ui_docked { position: "bottom" }

    children: [
      { type: ui_button, text: "Pen",    action: emit("tool:select", "pen") },
      { type: ui_button, text: "Eraser", action: emit("tool:select", "eraser") },
      { type: ui_button, text: "Shapes", action: emit("tool:select", "shapes") },
      { type: ui_button, text: "Share",  action: emit("shareplay:start") },
    ]
  }

  @platform(visionos)
  object "PersonaAnchor" @spatial_persona @shareplay {
    activity_type: "com.example.workspace.collaboration"
    // SharePlay Spatial Persona renders co-located participant avatars
    // via GroupActivities framework
  }

  @platform(visionos)
  object "DocumentVolume" @volumetric_window {
    width: 0.8
    height: 0.6
    depth: 0.3
    // Opens as a separate volumetric window for 3D document inspection
  }

  // ══════════════════════════════════════════════════════════════════
  // Quest / PCVR: Hand Tracking Grab + Controller Fallback
  // ══════════════════════════════════════════════════════════════════

  @platform(quest3)
  object "HandMenu" @hand_tracking @hand_menu {
    hand: left
    trigger: palm_up

    @spatial_audio { spatialize: true, rolloff: logarithmic }

    children: [
      { type: ui_button, text: "Pen",    action: emit("tool:select", "pen") },
      { type: ui_button, text: "Eraser", action: emit("tool:select", "eraser") },
      { type: ui_button, text: "Color",  action: emit("tool:color_picker") },
    ]
  }

  @platform(quest3, pcvr)
  object "ControllerCursor" @controller_input {
    handedness: right
    rayLength: 10.0
    hapticFeedback: true

    @haptic {
      onHover: { intensity: 0.1, duration: 10 }
      onClick: { intensity: 0.5, duration: 30 }
    }
  }

  @platform(quest3, pcvr)
  object "PassthroughToggle" {
    position: [1.5, 1.5, -2]
    @clickable

    interaction "TogglePassthrough" {
      type: button
      label: "Toggle AR"
      action: emit("passthrough:toggle")
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // WebXR: Browser-Based Fallback
  // ══════════════════════════════════════════════════════════════════

  @platform(webxr)
  object "WebToolbar" {
    type: ui_panel
    position: [0, -0.3, -0.5]
    width: 600
    height: 60

    // Flat HTML overlay toolbar for WebXR sessions
    children: [
      { type: ui_button, text: "Pen",    action: emit("tool:select", "pen") },
      { type: ui_button, text: "Eraser", action: emit("tool:select", "eraser") },
      { type: ui_button, text: "Undo",   action: emit("tool:undo") },
    ]
  }

  @platform(webxr)
  object "FallbackCursor" {
    // WebXR has limited hand tracking; use ray from controller/gaze
    mesh: sphere
    radius: 0.01
    material: { color: "#00ff88", emissive: "#00ff88", emissiveIntensity: 2.0 }
    @billboard
  }

  // ══════════════════════════════════════════════════════════════════
  // Desktop: Mouse/Keyboard 2D Overlay
  // ══════════════════════════════════════════════════════════════════

  @platform(desktop)
  object "DesktopToolbar" {
    type: ui_panel
    layout: "top-bar"
    width: 1200
    height: 48

    children: [
      { type: ui_button, text: "Pen (P)",    hotkey: "p", action: emit("tool:select", "pen") },
      { type: ui_button, text: "Eraser (E)", hotkey: "e", action: emit("tool:select", "eraser") },
      { type: ui_button, text: "Undo (Ctrl+Z)", hotkey: "ctrl+z", action: emit("tool:undo") },
    ]
  }

  // ══════════════════════════════════════════════════════════════════
  // Norms (some platform-specific)
  // ══════════════════════════════════════════════════════════════════

  norm "SpeakSoftly" @norm {
    lifecycle: constituted
    scope: global

    representation {
      audio: { maxVolume: 0.5 }
    }
  }

  @platform(automotive)
  norm "NoVisualWhileDriving" @norm {
    lifecycle: constituted
    scope: global
    priority: critical

    representation {
      visual: none
      audio: { maxLength: 5 }
    }

    sanction {
      violation: "visual_content"
      consequence: "suppress_and_queue"
      severity: critical
    }
  }

  // ── Logic (shared across all platforms) ─────────────────────────

  logic {
    on "tool:select" (tool) {
      state.activeTool = tool
    }

    on "shareplay:start" {
      agent.say("Starting SharePlay session...")
    }

    on "passthrough:toggle" {
      // Quest-specific runtime API
      xr.togglePassthrough()
    }
  }
}
```

### 6.2 Minimal Cross-Platform Example

A simple object with platform-specific materials:

```holoscript
composition "AdaptiveSphere" {

  object "Sphere" {
    mesh: sphere
    radius: 0.5
    position: [0, 1, -2]

    @platform(visionos)
    material: {
      color: "#4488ff"
      roughness: 0.2
      metalness: 0.8
      // RealityKit PhysicallyBasedMaterial
    }

    @platform(webxr)
    material: {
      color: "#4488ff"
      roughness: 0.4
      metalness: 0.5
      // Three.js MeshStandardMaterial (lower quality for perf)
    }

    @platform(quest3)
    material: {
      color: "#4488ff"
      roughness: 0.3
      metalness: 0.6
      // Vulkan PBR with foveated rendering optimization
    }
  }
}
```

### 6.3 Agent Embodiment Across Platforms

Demonstrates the cross-reality agent continuity pattern from the existing
perception test (`examples/perception-tests/07-cross-reality-agent-continuity.holo`):

```holoscript
composition "AdaptiveAgent" {

  @state {
    agentMood: "helpful"
    conversationHistory: []
  }

  // VR: Full 3D avatar with spatial gestures
  @platform(vr)
  object "Agent" @agent_identity @avatar_embodiment @hand_tracking {
    model: "avatars/guide_v2.glb"
    skeleton: humanoid
    position: [0, 0, -2]
    @spatial_audio { spatialize: true }
  }

  // AR: Semi-transparent spatial persona
  @platform(ar)
  object "Agent" @agent_identity @spatial_anchor {
    model: "avatars/guide_persona.glb"
    opacity: 0.85
    billboardMode: "y-axis"
  }

  // Phone/Desktop: Chat UI overlay
  @platform(mobile, desktop)
  object "Agent" @agent_identity {
    layout: "bottom-sheet"
    avatarThumbnail: "avatars/guide_2d.png"
    chatBubbleStyle: "modern"
  }

  // Car: Voice-only HUD
  @platform(automotive)
  object "Agent" @agent_identity {
    layout: "voice-hud"
    displayMode: "minimal"
    interruptible: true
  }

  // Watch: Haptic + glanceable
  @platform(wearable)
  object "Agent" @agent_identity {
    layout: "glance"
    hapticOnNotify: true
    maxTextLength: 80
  }
}
```

---

## 7. Implementation Roadmap

### Phase 1: Stabilize Existing Implementation (Current)

The core infrastructure is **already implemented**:

- [x] `PlatformConstraint` type in `HoloCompositionTypes.ts`
- [x] `parsePlatformConstraint()` in `HoloCompositionParser.ts`
- [x] `PlatformConditional.ts` with platform hierarchy, categories, capabilities
- [x] `PlatformConditionalCompilerMixin.ts` with `filterForPlatform()`
- [x] `matchesPlatformConstraint()` with include/exclude/category expansion
- [x] Platform aliases (`phone` -> `mobile`, `car` -> `automotive`)
- [x] Platform capability profiles per target
- [x] Existing example: `07-cross-reality-agent-continuity.holo`
- [x] Unit tests for `PlatformConditional`

**Remaining work**:

- [ ] Ensure all compilers call `filterForPlatform()` before compilation
- [ ] Add `@platform()` support for nested blocks (interactions, sub-objects)
- [ ] Add compile-time diagnostic for unknown platform names

### Phase 2: Pipe Union Syntax

- [ ] Add `|` (pipe) token handling in `parsePlatformConstraint()`
- [ ] Update tree-sitter grammar with `platform_decorator` rule
- [ ] Add tests for `@platform(quest3 | android-xr)` syntax

### Phase 3: LSP Platform Awareness

- [ ] Implement `activePlatformTarget` setting in LSP configuration
- [ ] Add `platformInactive` semantic token modifier
- [ ] Platform-aware trait completions (filter by target capabilities)
- [ ] `@platform()` argument completions
- [ ] Inlay hints showing expanded platform lists
- [ ] CodeLens for platform blocks

### Phase 4: VSCode Extension

- [ ] Status bar platform selector widget
- [ ] `HoloScript: Set Target Platform` command
- [ ] Custom TextMate scopes for platform decorators
- [ ] Block dimming/folding for non-active platform blocks

### Phase 5: Capability-Based Constraints (Future)

Extend the `@platform()` syntax to support capability requirements:

```holoscript
@platform(requires: handTracking, spatialAudio)
object "SpatialHandMenu" {
  // Compiled only for platforms where both capabilities are true
  // Resolves to: quest3, pcvr, visionos, android-xr
}
```

This would require extending `PlatformConstraint` with:

```typescript
export interface PlatformConstraint {
  include: string[];
  exclude: string[];
  requireCapabilities?: (keyof PlatformCapabilities)[]; // NEW
}
```

---

## 8. Appendix: Existing Architecture Reference

### 8.1 Key Files

| File                                                                        | Purpose                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/core/src/parser/HoloCompositionTypes.ts`                          | `PlatformConstraint` type definition                   |
| `packages/core/src/parser/HoloCompositionParser.ts`                         | `parsePlatformConstraint()` parser method              |
| `packages/core/src/compiler/platform/PlatformConditional.ts`                | Platform hierarchy, categories, capabilities, matching |
| `packages/core/src/compiler/PlatformConditionalCompilerMixin.ts`            | `filterForPlatform()`, `matchesPlatformConstraint()`   |
| `packages/core/src/compiler/CompilerBase.ts`                                | Base class all compilers extend                        |
| `packages/core/src/compiler/VisionOSCompiler.ts`                            | VisionOS/RealityKit target compiler                    |
| `packages/core/src/compiler/VisionOSTraitMap.ts`                            | VisionOS trait-to-RealityKit mapping                   |
| `packages/core/src/compiler/AndroidXRCompiler.ts`                           | Android XR/Jetpack XR target compiler                  |
| `packages/core/src/compiler/AndroidXRTraitMap.ts`                           | Android XR trait-to-Kotlin mapping                     |
| `packages/core/src/compiler/OpenXRCompiler.ts`                              | OpenXR/C++ target compiler (Quest, PCVR)               |
| `packages/core/src/compiler/platform/__tests__/PlatformConditional.test.ts` | Unit tests                                             |
| `examples/perception-tests/07-cross-reality-agent-continuity.holo`          | Full cross-reality example                             |

### 8.2 Compiler Registry

All compilers that support platform conditional compilation:

```typescript
// From CompilerBase.ts COMPILER_CLASS_TO_ANS_NAME
const COMPILERS = {
  VisionOSCompiler: 'visionos', // Swift / RealityKit
  AndroidXRCompiler: 'android-xr', // Kotlin / Jetpack XR
  OpenXRCompiler: 'openxr', // C++ / Vulkan
  R3FCompiler: 'r3f', // React Three Fiber
  BabylonCompiler: 'babylon', // Babylon.js
  WebGPUCompiler: 'webgpu', // WebGPU
  UnityCompiler: 'unity', // C# / Unity
  UnrealCompiler: 'unreal', // C++ / Unreal
  GodotCompiler: 'godot', // GDScript / Godot
  IOSCompiler: 'ios', // Swift / SceneKit
  AndroidCompiler: 'android', // Kotlin / Android
  WASMCompiler: 'wasm', // WASM
  URDFCompiler: 'urdf', // URDF (robotics)
  SDFCompiler: 'sdf', // SDF (simulation)
  DTDLCompiler: 'dtdl', // Digital Twins
  VRChatCompiler: 'vrchat', // VRChat
  PlayCanvasCompiler: 'playcanvas', // PlayCanvas
};
```

### 8.3 Platform Target to Compiler Mapping

| `PlatformTarget` | Default Compiler    | Notes                           |
| ---------------- | ------------------- | ------------------------------- |
| `visionos`       | `VisionOSCompiler`  | Swift + RealityKit              |
| `visionos-ar`    | `VisionOSCompiler`  | ARKit passthrough mode          |
| `android-xr`     | `AndroidXRCompiler` | Kotlin + Jetpack XR SceneCore   |
| `android-xr-ar`  | `AndroidXRCompiler` | ARCore passthrough mode         |
| `quest3`         | `OpenXRCompiler`    | C++ + OpenXR + Vulkan           |
| `pcvr`           | `OpenXRCompiler`    | C++ + OpenXR + Vulkan           |
| `webxr`          | `R3FCompiler`       | TypeScript + React Three Fiber  |
| `ios`            | `IOSCompiler`       | Swift + SceneKit                |
| `android`        | `AndroidCompiler`   | Kotlin + Android                |
| `windows`        | `WebGPUCompiler`    | TypeScript + WebGPU (or Unity)  |
| `macos`          | `WebGPUCompiler`    | TypeScript + WebGPU (or native) |
| `linux`          | `WebGPUCompiler`    | TypeScript + WebGPU             |
| `web`            | `BabylonCompiler`   | JavaScript + Babylon.js         |
| `android-auto`   | `AndroidCompiler`   | Kotlin + Android Auto           |
| `carplay`        | `IOSCompiler`       | Swift + CarPlay                 |
| `watchos`        | `IOSCompiler`       | Swift + WatchKit                |
| `wearos`         | `AndroidCompiler`   | Kotlin + Wear OS                |

---

_This RFC documents the design and specification of HoloScript's `@platform()`
conditional compilation system. The core infrastructure is implemented; this
document serves as the authoritative reference for extending and stabilizing the
feature across the compiler, LSP, and editor tooling._
