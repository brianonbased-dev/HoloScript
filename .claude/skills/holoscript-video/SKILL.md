---
name: holoscript-video
description: >
  Generate instructional video components using Remotion and Code Hike for
  HoloScript and HoloLand repositories. Use when asked to: create tutorial
  videos, build code walkthroughs, demo compiler outputs, explain .holo syntax,
  showcase export targets, or produce any educational video content about
  HoloScript. Auto-triggers on phrases: "create a video", "make a tutorial",
  "walkthrough", "demo video", "instructional", "screencast".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# HoloScript Video Tutorial Skill

## Your Mission

You create professional animated instructional videos for HoloScript and HoloLand
using Remotion (React-based programmatic video) + Code Hike (animated syntax).
Every video you generate should be accurate, visually polished, and rendereable
headlessly via `npm run render` without human intervention.

---

## HoloScript Architecture (Always Authoritative)

### Repository Structure

- Monorepo at `packages/*` (pnpm workspaces, pnpm@8.12.0)
- Video package: `packages/video-tutorials/` (new — created by this skill)
- TypeScript 5.3.3, Vitest, tsup, ESLint

### Core Types (`@holoscript/core`)

- `HoloComposition` — root scene container (28 major properties)
- `HoloObjectDecl` — scene objects with traits, position, children
- `HoloLight` — 6 types: directional, point, spot, hemisphere, ambient, area
- `HoloCamera` — perspective, orthographic, cinematic
- `HoloUI`, `HoloZone`, `HoloTimeline`, `HoloLogic`
- `HoloNPC`, `HoloQuest`, `HoloAbility`, `HoloDialogue`
- `HoloStateMachine`, `HoloAchievement`, `HoloTalentTree`
- `HoloEnvironment`, `HoloEffects`, `HoloParticleSystem`

### Compiler Targets (18 total)

| Target     | Output Type                                          | Use Case                            |
| ---------- | ---------------------------------------------------- | ----------------------------------- |
| Unity      | string (C# MonoBehaviour)                            | Unity game engine                   |
| Unreal     | { headerFile, sourceFile }                           | Unreal Engine (C++ header + source) |
| Godot      | string (GDScript)                                    | Godot game engine                   |
| Babylon    | string (TypeScript)                                  | Babylon.js WebGL                    |
| WebGPU     | string (TypeScript)                                  | Raw WebGPU API                      |
| VRChat     | { mainScript, avatarDescriptor, animatorController } | VRChat worlds                       |
| URDF       | string (XML)                                         | Robot description for ROS           |
| SDF        | string (XML)                                         | Simulation Description Format       |
| PlayCanvas | string (JS)                                          | PlayCanvas engine                   |
| DTDL       | string (JSON)                                        | Digital Twin Definition Language    |
| VisionOS   | string (Swift)                                       | Apple Vision Pro                    |
| iOS        | { viewFile, controllerFile }                         | iOS/iPadOS UIKit                    |
| Android    | { activityFile, layoutFile }                         | Android XML + Java                  |
| Android-XR | string                                               | Android XR platform                 |
| OpenXR     | string (C++)                                         | OpenXR cross-platform XR            |
| R3F        | string (TypeScript)                                  | React Three Fiber                   |
| WASM       | { wasmModule, jsBindings }                           | WebAssembly                         |
| USD        | string                                               | Universal Scene Description         |

### .holo File Format

```holo
scene SceneName {
  object ObjectName {
    mesh: MeshType { property: value }
    material: MaterialType { color: #hex }
    position: [x, y, z]
    rotation: [x, y, z]
    scale: [x, y, z]
    traits: [TraitName, AnotherTrait]
  }
  light: DirectionalLight { intensity: 1.0, direction: [0, -1, 0] }
  camera: PerspectiveCamera { fov: 60, position: [0, 5, 10] }
}
```

---

## Video Package Structure

```
packages/video-tutorials/
├── package.json              (@holoscript/video-tutorials)
├── remotion.config.ts
├── tsconfig.json
├── src/
│   ├── index.ts              (registerRoot)
│   ├── Root.tsx              (all Composition registrations)
│   ├── compositions/         (one file per tutorial video)
│   ├── content/              (Code Hike markdown files)
│   ├── components/           (reusable video components)
│   └── utils/theme.ts        (brand colors, fonts)
├── scripts/
│   ├── render-all.ts         (headless renderMedia runner)
│   ├── generate-narration.ts (ElevenLabs TTS pipeline)
│   └── record-cli-demo.py    (Asciinema automation)
└── out/                      (rendered MP4 output — gitignored)
```

---

## Video Generation Workflow

### Step 1: Plan the storyboard

Every video follows this structure:

1. **Title card** (3s): video title + HoloScript logo background
2. **Problem statement** (5-10s): what we're building / why
3. **Code walkthrough** (main): step-by-step with Code Hike annotations
4. **Output demo** (10-15s): show the compiled result
5. **Summary** (5s): recap + "learn more" pointer

### Step 2: Write Code Hike markdown

Create `src/content/{video-slug}.md`:

````markdown
## !!steps Start with a scene

We define the root scene container.

```holo !
// !focus
scene VirtualGarden {
}
```
````

## !!steps Add the first object

Objects have mesh, material, and position.

```holo !
scene VirtualGarden {
  // !focus
  object FlowerBed {
    mesh: Plane { scale: [4, 1, 4] }
    material: StandardMaterial { color: #7CFC00 }
    position: [0, 0, 0]
  }
}
```

````

### Step 3: Create Remotion composition
Create `src/compositions/{VideoName}.tsx`:
- Import the parsed markdown steps
- Use `<Sequence>` for each step
- Use `interpolate(frame, ...)` for smooth transitions
- Duration: 30fps × (desired seconds) = durationInFrames

### Step 4: Register in Root.tsx
Add `<Composition id="VideoName" component={VideoName} ... />` to Root.tsx

### Step 5: Preview
```bash
cd packages/video-tutorials
npm run dev
# Open http://localhost:3000
````

### Step 6: Render

```bash
npm run render
# Or for a single composition:
npx remotion render --composition=UnityCompilerWalkthrough
# Output: out/unity-compiler-walkthrough.mp4
```

---

## Code Hike Annotation Reference

| Annotation                 | Effect                                    |
| -------------------------- | ----------------------------------------- |
| `// !focus`                | Dims all other lines, highlights this one |
| `// !mark`                 | Yellow highlight box around line          |
| `// !mark[/regex/]`        | Highlight matching text inline            |
| `// !callout[/text/]` text | Speech bubble callout                     |
| `// !add`                  | Green "added line" diff style             |
| `// !remove`               | Red "removed line" diff style             |
| `// !collapse`             | Collapses block to single line            |

---

## Narration Script Pattern

When creating narrated videos:

1. Write narration script alongside Code Hike markdown
2. Format: `[TIMING] Narration text`
3. Save to `src/content/{video-slug}-narration.txt`
4. Generate audio: `tsx scripts/generate-narration.ts --script {video-slug}`
5. Audio saved to `public/narration/{video-slug}.mp3`
6. Reference in Remotion: `<Audio src={staticFile('narration/{video-slug}.mp3')} />`

---

## Brand Guidelines

```ts
// src/utils/theme.ts
export const theme = {
  bg: '#0d1117', // GitHub dark background
  surface: '#161b22', // Card/panel background
  accent: '#58a6ff', // HoloScript blue
  accentGlow: '#1f6feb', // Glow effect color
  text: '#e6edf3', // Primary text
  textMuted: '#8b949e', // Secondary text
  success: '#3fb950', // Green (output/success)
  warning: '#d29922', // Yellow (warning)
  font: 'JetBrains Mono, Fira Code, monospace',
  titleFont: 'Inter, system-ui, sans-serif',
};
```

---

## Quality Checklist

Before marking a video complete:

- [ ] Video is 1920×1080 at 30fps
- [ ] All code shown is syntactically valid .holo
- [ ] Compiler outputs shown match actual package behavior
- [ ] Steps are evenly paced (not too fast for viewer to read)
- [ ] Title card includes video title and "HoloScript" branding
- [ ] Output renders without error: `npm run render`

---

## Compiler Target Coverage Plan (15 videos)

Generate these in order of community interest:

1. `unity-compiler` — Most requested (game dev audience)
2. `godot-compiler` — Second most popular (open source community)
3. `babylon-compiler` — Web3D audience
4. `visionos-compiler` — High novelty factor
5. `urdf-compiler` — Robotics audience
6. `vrchat-compiler` — VR creator community
7. `webgpu-compiler` — Web performance audience
8. `r3f-compiler` — React developer audience
9. `ios-compiler` — Mobile audience
10. `android-compiler` — Mobile audience
11. `openxr-compiler` — XR enterprise
12. `dtdl-compiler` — IoT/digital twin audience
13. `unreal-compiler` — AAA game dev
14. `wasm-compiler` — Performance-critical web
15. `sdf-compiler` — Simulation/robotics

---

## Quick Prompt Templates

**"Create a compiler demo video":**

> "Using the holoscript-video skill, create a Code Hike walkthrough video for the [TARGET] compiler.
> Show: (1) a .holo scene with a mesh object, (2) the compiler invocation in TypeScript, (3) the compiled output.
> Use 5 !!steps. Duration: 90 seconds at 30fps. Include a narration script."

**"Create a syntax tutorial":**

> "Using the holoscript-video skill, create a beginner syntax introduction video.
> Cover: scene declaration, objects, meshes, materials, lights, and camera.
> Use 8 !!steps. Duration: 3 minutes."

**"Create a full release tutorial":**

> "Using the holoscript-video skill, create a comprehensive tutorial video for the v{VERSION} release.
> Cover all new features. Use multi-agent pattern: first plan the storyboard, then generate components, then review."
