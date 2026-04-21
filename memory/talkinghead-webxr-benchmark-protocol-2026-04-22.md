# TalkingHead + lip-sync — WebXR performance benchmark protocol

**Board:** `task_1776640937112_d9s8`  
**Source audit:** `2026-03-08_artist-vision-holoscript-studio-research.md`

## Goal

Measure whether **real-time lip-sync** driven from **Web Audio** can run inside a **WebXR** session **without** blowing the frame budget, **alongside** spatial audio / scene work. This memo defines **how** to measure — **no FPS numbers** are claimed here.

## HoloScript anchors (implementation paths)

| Component | Location | Role |
|-----------|----------|------|
| Lip-sync / viseme timing | `packages/engine/src/character/LipSyncEngine.ts` | Viseme weights from audio analysis method |
| Voice + emotion bridge | `packages/engine/src/traits/EmotionalVoiceTrait.ts` | TTS + lip-sync coordination |
| Audio engine (spatial) | `packages/core/src/audio/AudioEngine.ts`, `SpatialAudioSource.ts` | Mix with WebXR audio policies |
| XR embed | `packages/studio/src/embed/WebXRViewer.tsx` | Session lifecycle for in-headset tests |

## Target hardware matrix (record all rows)

- **Standalone VR** (e.g. Quest-class) at native **display refresh** (72 / 90 / 120 Hz depending on mode).  
- **PCVR** (optional) — note GPU + link/wireless.  
- **Flat WebGL smoke** — control only; do not substitute for XR claim.

## Metrics (per session)

| Metric | How to capture | Pass interpretation (set per product) |
|--------|----------------|----------------------------------------|
| **Frame time p95** | WebXR rAF + `XRFrame` timestamps or engine stats | Under budget vs `1000 / refreshRate` ms minus safety margin |
| **Long tasks** | `PerformanceObserver` `longtask` (main thread) | Near zero during speech peaks |
| **Audio render quantum load** | Chrome tracing / `AudioWorklet` diagnostics if used | No underruns / glitch counters |
| **Lip-sync latency** | Mic / click → viseme onset (ms) | Product SLO — e.g. roadmap cites `<200ms` for multi-user speech paths |

## Procedure (short)

1. Cold launch XR session with **static** scene (control). Record baseline frame time.  
2. Enable **TTS or looping speech buffer** + lip-sync path only.  
3. Add **spatial audio** panners / HRTF path (second run).  
4. Stress: **NPC count / bone count** stepped (1 → N) until p95 degrades — log N.

## Honest constraints

- **“90fps everywhere”** is **headset-mode-dependent**; publish **refresh rate** beside FPS.  
- Browser **main-thread** lip analysis competes with WebXR — prefer **AudioWorklet** / **off-thread** analysis when implemented.

## Results

Log JSON **outside** public git unless cleared for publication.
