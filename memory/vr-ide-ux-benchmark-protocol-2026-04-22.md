# VR / IDE UX benchmarking — Studio vs Unity, Unreal, Blender

**Board:** `task_1776640937112_d68i`  
**Source audit:** `2026-03-01_holoscript-studio-ide-audit.md`

This file defines a **repeatable measurement protocol**. Raw numbers are **not** claimed here — runs are **operator + hardware gated** (record machine, HMD model, build versions).

## Scope

Compare **time + error count** on a fixed short task list across:

| Surface | Version pin | Notes |
|---------|-------------|--------|
| **HoloScript Studio** | `pnpm --filter @holoscript/studio` dev build; default port `3100` | Trait-first / composition workflow |
| **Blender** | LTS pin in results JSON | Direct modeling + export |
| **Unity** | Editor version + URP/HDRP tag | Editor UX, not runtime FPS |
| **Unreal** | Engine version | Same |

## Standard tasks (pick 4–6; keep under 30 min total per participant)

1. **Place primitive / root object** in an empty scene.  
2. **Apply a material or visual preset** (color + roughness sufficient).  
3. **Add a light** and verify shading.  
4. **Import a glTF** (same canonical asset hash for all runs).  
5. **Export** to glTF or documented HoloScript export path.  
6. *(Optional VR)* **Grab + move** one object in headset for Studio / engine builds that support it.

## Metrics (per task)

- **TTF** — time to first correct visual (seconds), stopwatch from “scene empty” to evaluator confirmation.  
- **Edits** — number of undo / destructive retries (self-reported + screen capture if feasible).  
- **Blockers** — hard failures (import crash, missing export).  
- **Subjective** — NASA-TLX lite 1–7 optional single question (“mental demand this minute”).

## Controls

- Same **display resolution** and **input mode** (mouse+keyboard) unless row is labeled VR.  
- Same **asset** bytes (content-hash logged).  
- **Warm-up** one practice task not scored.

## Results log (fill externally)

Store JSON under a private path or `packages/studio/benchmarks/` **only if** cleared for public release — default is **not** committed PII.

## Honest gap

Apples-to-oranges risk: Studio optimizes **trait composition**; Blender optimizes **mesh editing**. Keep narrative on **task fit**, not “Studio faster at everything.”
