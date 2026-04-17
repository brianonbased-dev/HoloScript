# Multi-Target Demo — the flagship "one source, five runtimes" demo

**Purpose**: The single artifact the rest of the marketing leans on. A 60-second video of `scene.holo` compiling to Three.js + R3F + Unity + Unreal + USD, all running side by side, is HoloScript's strongest pitch.

**Status**: Source + build harness + storyboard. Video recording is a separate step (see "Recording the video" below).

## The Pitch in 8 Seconds

> One `.holo` file. Five runtimes. Side by side. No configuration.

That's it. Whatever copy surrounds it, the video has to do the work.

## What's Here

| File | Purpose |
|---|---|
| `scene.holo` | The single source of truth. One rotating cube, one glow orb, one ground plane, one light, one camera. |
| `build.mjs` | Compiles `scene.holo` to all 5 targets. Produces `out/threejs/`, `out/r3f/`, `out/unity/`, `out/unreal/`, `out/usd/`. |
| `README.md` | This file. Storyboard + recording directions. |

## Running the Build

```bash
# From HoloScript repo root, after pnpm install + pnpm build
node examples/multi-target-demo/build.mjs

# Benchmark mode
node examples/multi-target-demo/build.mjs --time

# Single target
node examples/multi-target-demo/build.mjs --target usd
```

Expected output:

```
HoloScript Multi-Target Demo — build harness
Source: examples/multi-target-demo/scene.holo

  OK   threejs  -> out/threejs/scene.js              ~4KB   ~30ms
  OK   r3f      -> out/r3f/Scene.jsx                 ~3KB   ~25ms
  OK   unity    -> out/unity/Scene.cs                ~5KB   ~40ms
  OK   unreal   -> out/unreal/Scene.md               ~3KB   ~20ms
  OK   usd      -> out/usd/scene.usda                ~2KB   ~18ms

All 5 targets compiled successfully.
```

## Storyboard — 60-Second Video

Total runtime: **60 seconds** (45s visual + 15s voiceover wrap)

### 0:00 – 0:05 — Hook
- **Visual**: Text-only title card: "One .holo file. Five runtimes." — 3 seconds
- **Visual**: Cut to editor showing `scene.holo` open, highlighted — 2 seconds
- **VO**: "Here is one HoloScript file."

### 0:05 – 0:15 — Build
- **Visual**: Terminal. Type `node build.mjs --time`. Hit enter.
- **Visual**: Lines appear as each compiler finishes. Five OKs.
- **Visual**: "All 5 targets compiled in X ms" line bolds.
- **VO**: "One command. Five compile targets. Three.js, React Three Fiber, Unity, Unreal, and USD."

### 0:15 – 0:45 — The Proof (the money shot)
- **Visual**: 5-way split screen:
  - Top-left: Three.js in Chrome
  - Top-right: R3F in Chrome (different route)
  - Middle-left: Unity Editor play mode
  - Middle-right: Unreal Editor play mode
  - Bottom: Blender with USD import (or USDView)
- **Visual**: All 5 windows show the same spinning cube + glowing orb + ground plane rendering in real time. Camera angles identical.
- **Visual**: A narrator cursor highlights the cube, then each window.
- **VO**: "Same scene. Same camera. Same lighting. Five different runtimes, no configuration. The .holo file is the source of truth — everything else is a target."

### 0:45 – 0:55 — The Edit
- **Visual**: Cut back to `scene.holo`. Change `color: "#7b2ffa"` to `color: "#ff4136"`.
- **Visual**: Re-run build (or show hot reload in each viewer).
- **Visual**: All 5 windows turn red simultaneously.
- **VO**: "Edit the source. All five targets update."

### 0:55 – 1:00 — The Ask
- **Visual**: Text card: "Try it: npx create-holoscript my-world --go"
- **Visual**: Smaller text: "HoloScript — Spatial Sovereignty"
- **VO**: "Spatial Sovereignty, compiled. Try it in 30 seconds."

## Recording Checklist

To record the video, a real operator needs:

- [ ] Repo cloned + `pnpm install && pnpm build` done
- [ ] Node.js 18+ in PATH
- [ ] Unity Hub with a 3D URP project ready to load Scene.cs
- [ ] Unreal Engine 5.3+ with a blank project ready to load the Blueprint
- [ ] Blender 4.x or USDView for USD viewing
- [ ] Chrome for web targets (two tabs for Three.js and R3F)
- [ ] Screen recording tool (OBS, ScreenStudio, or similar)
- [ ] Terminal with dark theme + large font (18pt+)

### Recording order
1. Record the build step (terminal) separately — easier to compose
2. Record each runtime independently showing the same scene
3. Composite the 5-way split in post
4. Voice-over last

### Quality bar
- 4K capture source, 1080p or 720p final
- No stuttering in any runtime — pre-warm all of them
- All 5 runtimes visible simultaneously in the money shot
- Audio normalized; remove breaths and clicks

## Why This Demo Works

From the competitive brief (2026-04-17):

> **Babylon.js is a destination. HoloScript is a source that reaches every destination including Babylon.**

This video makes that abstract claim concrete. No competitor can produce a comparable video because:
- Babylon → Babylon only
- Three.js → Three.js only
- Unity → Unity only
- Omniverse → USD + Omniverse only
- SimScale → thin client in browser only

HoloScript is the only source that compiles to all of the above from one file.

## Follow-up Assets

Once the video exists, it anchors:

1. **Homepage hero** — autoplay the 15-45s money shot
2. **TVCG paper supplementary material** — extra evidence for the multi-target claim
3. **Cursor marketplace listing** — embed link in the HoloScript MCP server description
4. **Show HN launch** — the opening asset
5. **Conference talk** — opener for every 3D/spatial talk

See `docs/strategy/competitive-brief-2026-04-17.md` for the broader narrative this slots into.
