# HoloLand — “scan room 90s → walk in VR” (U.001 runbook)

**Founder bar:** No terminal, Unity, or SDK in the **user** loop. **Quest 3** is the daily driver; phone captures video; browser runs HoloMap; world appears in VR.

## Loop (target)

1. **Phone:** Record ~90s handheld room walk (1080p+, stable exposure).
2. **Browser (desktop or Quest Browser if perf allows):** `HoloMapRuntime` WebGPU path, `weightUrl` + `weightCid` set, process full clip → `ReconstructionManifest` + `.holo` export.
3. **Cloud none required** for core recon (perception sovereignty narrative).
4. **HoloLand:** Ingest `.holo` / manifest; user **teleports or walks** the reconstruction.

## Engineering gates (checklist)

| Gate | Status | Owner |
|------|--------|-------|
| WebGPU forward pass on acceptance video (not micro-encoder only) | Open | core/reconstruction |
| Weight blob + GPU bind (beyond fetch+verify) | Open | core/reconstruction |
| `.holo` export from manifest (trait composition) | Open | core + studio |
| HoloLand ingest of emitted composition | Open | hololand |
| Quest-native capture **or** one-tap “send to HoloMap tab” | Open | product |

## Demo risks

- **Quest Browser WebGPU** limits — may require phone capture + **desktop** HoloMap tab + cloud handoff of `.holo` only (still no Unity in user loop).
- **Latency** — target <45s post-capture for 2k frames per RFC SLOs.

## References

- `RFC-HoloMap.md` Sprint 3
- `DEPTHANYTHING_V2_IMPORT.md` (weights)
- `MODALITY_WEIGHTS.md` (mobile vs desktop checkpoints)
