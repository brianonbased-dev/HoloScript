# HoloScript + HoloLand Video Tutorial Checklist

Tracks production status of all planned instructional videos.

**Total: 44 videos | Complete: 38 | Remaining: 6 (Series 3 CLI recordings)**

---

## Series 1 — Beginner (6 videos) ✅ COMPLETE

| Status  | Title                          | Composition ID          | Duration |
| ------- | ------------------------------ | ----------------------- | -------- |
| ✅ Done | HoloScript Syntax Introduction | `SyntaxIntroduction`    | ~33s     |
| ✅ Done | Traits Deep Dive               | `TraitsDeepDive`        | ~33s     |
| ✅ Done | State & Logic                  | `StateAndLogic`         | ~28s     |
| ✅ Done | Timelines & Animation          | `TimelinesAndAnimation` | ~28s     |
| ✅ Done | NPCs & Dialogue                | `NPCsAndDialogue`       | ~28s     |
| ✅ Done | Templates & Reuse              | `TemplatesAndReuse`     | ~28s     |

---

## Series 2 — Compiler Demos (15 videos) ✅ COMPLETE

| Status  | Title                          | Composition ID                | Output Language |
| ------- | ------------------------------ | ----------------------------- | --------------- |
| ✅ Done | Unity C# Compiler              | `UnityCompilerWalkthrough`    | C#              |
| ✅ Done | Godot GDScript Compiler        | `GodotCompilerWalkthrough`    | GDScript        |
| ✅ Done | Babylon.js Compiler            | `BabylonCompilerWalkthrough`  | TypeScript      |
| ✅ Done | Vision Pro Swift Compiler      | `VisionOSCompilerWalkthrough` | Swift           |
| ✅ Done | URDF Robotics Compiler         | `URDFCompilerWalkthrough`     | XML             |
| ✅ Done | VRChat UdonSharp Compiler      | `VRChatCompilerWalkthrough`   | C# (UdonSharp)  |
| ✅ Done | WebGPU Compiler                | `WebGPUCompilerWalkthrough`   | TypeScript/WGSL |
| ✅ Done | React Three Fiber Compiler     | `R3FCompilerWalkthrough`      | TSX             |
| ✅ Done | iOS UIKit Compiler             | `iOSCompilerWalkthrough`      | Swift           |
| ✅ Done | Android ARCore Compiler        | `AndroidCompilerWalkthrough`  | XML/Kotlin      |
| ✅ Done | OpenXR C++ Compiler            | `OpenXRCompilerWalkthrough`   | C++             |
| ✅ Done | DTDL IoT Compiler              | `DTDLCompilerWalkthrough`     | JSON            |
| ✅ Done | Unreal Engine Compiler         | `UnrealCompilerWalkthrough`   | C++             |
| ✅ Done | WebAssembly Compiler           | `WASMCompilerWalkthrough`     | JavaScript/WASM |
| ✅ Done | USD Scene Description Compiler | `USDCompilerWalkthrough`      | USDA            |

---

## Series 3 — CLI Terminal Demos (6 videos) 🔲 PENDING

> These require Asciinema recording. Scripts are in `scripts/record-cli-demo.py`.
> Run: `npm run record:cli -- --all` to generate GIFs for embedding.

| Status     | Title                       | Demo Key              | Duration |
| ---------- | --------------------------- | --------------------- | -------- |
| 🔲 Pending | Compile to Unity            | `unity-compile`       | ~12s     |
| 🔲 Pending | Compile to Multiple Targets | `multi-target`        | ~18s     |
| 🔲 Pending | Parse & Validate            | `parse-validate`      | ~10s     |
| 🔲 Pending | Trait Library Search        | `trait-search`        | ~12s     |
| 🔲 Pending | Project Init & Scaffold     | _(add to DEMOS dict)_ | ~15s     |
| 🔲 Pending | NPM Publish Workflow        | _(add to DEMOS dict)_ | ~20s     |

---

## Series 4 — Advanced (6 videos) ✅ COMPLETE

| Status  | Title                  | Composition ID         | Duration |
| ------- | ---------------------- | ---------------------- | -------- |
| ✅ Done | Python Bindings        | `PythonBindings`       | ~28s     |
| ✅ Done | MCP Server Integration | `MCPServerIntegration` | ~28s     |
| ✅ Done | LLM Provider SDK       | `LLMProviderSDK`       | ~28s     |
| ✅ Done | Security Sandbox       | `SecuritySandbox`      | ~28s     |
| ✅ Done | CI/CD Integration      | `CICDIntegration`      | ~28s     |
| ✅ Done | Custom Trait Creation  | `CustomTraitCreation`  | ~28s     |

---

## Series 5 — HoloLand Platform (11 videos) ✅ COMPLETE

> Located in `c:/Users/Josep/Documents/GitHub/Hololand/packages/devtools/video-tutorials/`
> Package: `@hololand/video-tutorials`

| Status  | Title                          | Composition ID                 | Duration |
| ------- | ------------------------------ | ------------------------------ | -------- |
| ✅ Done | Welcome to HoloLand            | `HoloLandIntro`                | ~28s     |
| ✅ Done | Building a VR Room             | `BuildingAVRRoom`              | ~28s     |
| ✅ Done | Babylon.js Adapter Demo        | `BabylonAdapterDemo`           | ~28s     |
| ✅ Done | Three.js Adapter Demo          | `ThreeAdapterDemo`             | ~28s     |
| ✅ Done | Adapter Comparison             | `AdapterComparison`            | ~28s     |
| ✅ Done | Physics Playground Walkthrough | `PhysicsPlaygroundWalkthrough` | ~28s     |
| ✅ Done | Brittney AI Demo               | `BrittneyAIDemo`               | ~28s     |
| ✅ Done | AR Spatial Anchors             | `ARSpatialAnchors`             | ~28s     |
| ✅ Done | VR Shop Example                | `VRShopExample`                | ~28s     |
| ✅ Done | Collaborative Building         | `CollaborativeBuilding`        | ~28s     |
| ✅ Done | Enchanted Forest Demo          | `EnchantedForestDemo`          | ~28s     |

---

## How to Render

### HoloScript videos (Series 1–4):

```bash
cd packages/video-tutorials

# Preview in browser
npm run dev

# Render all
npm run render

# Render by keyword filter
npm run render -- --filter syntax
npm run render -- --filter compiler
npm run render -- --filter python

# Render single composition
npm run render -- --composition GodotCompilerWalkthrough
```

### HoloLand videos (Series 5):

```bash
cd packages/devtools/video-tutorials  # in Hololand repo

npm run dev       # preview
npm run render    # render all 11
npm run render:intro
npm run render:brittney
npm run render:adapter
```

### CLI Terminal Demos (Series 3):

```bash
cd packages/video-tutorials

# Prerequisites: pip install asciinema-automation agg
npm run record:cli -- --all

# Output: public/terminal-demos/*.gif
```

### Add Narration (ElevenLabs):

```bash
# Requires ELEVENLABS_API_KEY
npm run narration -- --all

# Output: public/narration/*.mp3
```

---

## CI/CD

Videos render automatically on every GitHub Release via `.github/workflows/render-videos.yml`.
MP4 files are uploaded as release artifacts (90-day retention).

---

## Production Notes

- All compositions are 1920×1080, 30fps
- Compiler walkthroughs: ~32s (3s title + 4 steps × 6s + 5s summary)
- Beginner/Advanced compositions: ~28s (3s title + 5 steps × 5s)
- Series 3 CLI demos produce GIFs for embedding in docs, not standalone MP4s
- Series 5 uses HoloLand brand colors (purple `#7c3aed`) vs HoloScript blue (`#58a6ff`)
- Series 3 requires a real terminal session — run `npm run record:cli` on a machine with holoscript CLI installed
