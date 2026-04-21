# TalkingHead + **WebXR** performance: benchmark methodology (checklist)

**Date:** 2026-04-25  
**Scope:** The board asked to **verify** whether lip-sync (often via **Web Audio API**) can coexist with **spatial audio** and still hit **90 fps** in VR. This file is a **measurement** recipe; it does not claim measured numbers.

## Test matrix (minimum)

- **Headsets / browsers:** 2+ devices (e.g. Quest browser + desktop WebXR) at **90 Hz** and **120 Hz** if available.  
- **Scenes:** (a) head-only, (b) head + 8 spatialized sources, (c) head + reverb + animation.  
- **TalkingHead** configuration: viseme count, **audio buffer size** (latency vs glitch tradeoff), update rate.  
- **Baselines:** no lip-sync, lip-sync on **main thread** vs **AudioWorklet** (if used).

## Metrics to log

- **rAF / XR frame** time percentiles (p50, p95, p99) per session.  
- **Dropped frames** / **missed** `requestAnimationFrame` (if API exposes).  
- **Audio** callback jitter (if accessible); **underrun** count.  
- **CPU** and **GPU** time via system profiler; **thermals** on standalone headsets (can throttle).

## Pass / fail (proposal)

- **“VR-ready”** = p95 **frame time** ≤ 11.1 ms (90 Hz) for **continuous** 60 s in scene (c) with spatial audio, **or** document **ASW** if platform uses reprojection.  
- If p95 &gt; budget: file issues against **(1)** viseme work placement, **(2)** audio graph depth, **(3)** Three.js / renderer cost.

## Implementation notes (engineering)

- Prefer **viseme** updates **driven** by audio **time domain** in a path that does not **block** XR’s render loop.  
- **Debounce** material morph targets if the rig allows (profile first).

## Outcome of this task

- First **artifact** is a **repeatable** script or Studio scenario that **logs** the metrics; **numbers** are a **separate** run on hardware the team approves for benchmarks.

## Related

- `packages/studio` / avatar viewer components when **TalkingHead** is integrated.
