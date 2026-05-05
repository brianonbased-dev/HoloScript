# HoloMap Lab Composition Plan

**Status:** active lab plan, 2026-05-05  
**Objective:** turn Galaxy S23 Ultra capture, Studio scan sessions, HoloMap manifests, CAEL replay, and Quest 3 embodied validation into one repeatable experiment harness.

## Why This Exists

HoloMap does not need one perfect scanner before it becomes useful. The stronger move is to compose every partial truth source the ecosystem already has:

| Truth layer | Existing surface | What it contributes |
| --- | --- | --- |
| Capture truth | `packages/studio/src/app/scan-room/`, `packages/studio/src/app/api/reconstruction/session/route.ts` | QR session, phone connection, browser camera, upload metadata, completed scan state |
| Reconstruction truth | `packages/core/src/reconstruction/`, `packages/holomap/src/` | replay fingerprints, manifests, ingest-path profiles, paper harness probes |
| Semantic truth | `packages/core/src/traits/constants/holomap-reconstruction.ts`, room/point/splat traits | floor/wall/anchor/trajectory intent that survives compiler export |
| Evidence truth | `packages/engine/src/simulation/SimulationContract.ts`, CAEL traces | deterministic replay, provenance, deploy-class paper evidence |
| Embodied truth | `research/quest3-iphone-moment/`, `packages/studio/src/components/quest/QuestProbe.tsx` | Quest 3 reachability, WebXR, hand/passthrough validation |
| Dataset truth | `packages/framework/src/training/scripts/generate-spatial-dataset.ts`, `packages/trait-inference/` | learned scene composition and trait inference corpus generation |

The lab should wire these layers before inventing a new reconstruction stack.

## Implementation Paths To Keep Open

| Path | Use when | First adapter |
| --- | --- | --- |
| Browser-first Studio scan | We need the fastest UX loop and desktop confirmation | Current `scan-room` mobile route and reconstruction session API |
| S23 ARCore-native capture | Browser video lacks depth/pose quality | Android capture bridge that emits RGB, depth, pose, and calibration into the same manifest contract |
| Quest-first validation | We need to know whether the scan is inhabitable, not just visible | Quest probe plus HoloMap viewer/share route |
| Synthetic ground truth | We need known answers for papers 17-20 | HoloScript scene generator -> rendered/captured frames -> HoloMap reconstruction -> semantic diff |
| Splat/point-cloud first | Mesh quality blocks visible progress | `HoloMapScanViewer` and `worldSimulationBridge` asset kinds for point cloud / Gaussian splat |
| CAEL-contracted dataset | We need paper-grade evidence and repeatable training data | `SimulationContract` replay hash plus scan session manifest |

## Lab Cell 001: Same Room, Three Truths

**Experiment id:** `holomap-lab-cell-001`  
**Contract:** `benchmarks/holomap/lab-cell-001.contract.json`  
**Room:** Joseph lab room or another repeatable indoor room.  
**Devices:** Galaxy S23 Ultra, desktop Studio, Meta Quest 3.

### Required Runs

1. **Studio browser run**
   - Open `/scan-room`.
   - Start a QR session.
   - Phone reaches `/scan-room/mobile/:token`.
   - Desktop shows `Phone is connected`.
   - Phone records with the Studio camera overlay.
   - Desktop shows `Reconstruction complete` and renders `HoloMapScanViewer`.

2. **S23 depth/pose run**
   - Native ARCore path records RGB, depth, pose, camera intrinsics, and timestamps.
   - Output is normalized into the same HoloMap manifest envelope.
   - This run can be a planned row until the Android bridge lands.

3. **Quest embodied validation run**
   - Quest opens the scan viewer or share route.
   - Operator records whether scale, floor, walls, and navigation feel correct.
   - Validation result is stored alongside replay fingerprint and device profile.

### Acceptance Metrics

| Metric | Pass threshold |
| --- | --- |
| Phone connection | Desktop status advances from `pending-phone` to `phone-connected` within 2 seconds of mobile load |
| Camera link | Desktop status advances to `capturing` when the Studio camera opens |
| Capture receipt | Desktop sees `uploaded` with nonzero `videoBytes` and `frameCount` |
| Render asset | Desktop sees `done`, `replayFingerprint`, and a nonempty point-cloud viewer |
| Plane cues | Floor and wall cues accumulate independently; neither can erase the other |
| Room sweep | One wall cannot claim full room coverage; 8 heading buckets are required for full sweep |
| Replay | Same manifest inputs produce the same replay fingerprint |
| Embodied check | Quest validation records pass/fail for scale, floor, wall, and navigation |

## Blocker Ledger

| Blocker | Current state | Next action |
| --- | --- | --- |
| Knowledge-store direct query returned 502 earlier | `scripts/room-knowledge-search.mjs` succeeds in this session against the team store | Keep direct orchestrator endpoint on watch; use team search for RE-INTAKE until direct path is fixed |
| Local branch state | `origin/main` is already at the pushed scan stack; `C:/Users/josep/HoloScript` owns local `main` and is stale/diverged | Continue this worktree from detached `origin/main`; push commits via `HEAD:main` if needed |
| Mobile browser live camera | Web camera requires secure context on real phones | Prefer HTTPS Studio/prod/tunnel for Lab Cell 001; keep native fallback explicit |
| S23 ARCore bridge | Not yet wired into HoloMap manifest contract | Build as a separate adapter, not a replacement for Studio browser capture |
| Quest validation | Requires physical headset run | Use existing Quest feasibility probe and record observations as lab evidence |

## Immediate Build Order

1. Keep the current Studio scan flow as the control path.
2. Add lab-run persistence around the existing scan session manifest.
3. Add S23 ARCore capture as a second modality that writes the same contract.
4. Add Quest viewer validation as a third modality.
5. Feed all three outputs into CAEL/SimulationContract evidence for papers 17-20.

The rule for this lab is simple: every new scanner, model, or device path must terminate in the same HoloMap manifest and replay contract.
