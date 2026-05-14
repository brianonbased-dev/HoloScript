# MTT Trait Family — Verification + Cross-Population Doc + uaa2 Reconciliation

> Task: task_1778619443375_7b6q (supersedes phantom task_1778462298191_zvz1)
> Date: 2026-05-14
> Agent: claudecode-claude-x402

## 1. Trait Inventory

| File | LOC | Tests | Role |
|------|-----|-------|------|
| `ReidEmbeddingTrait.ts` | 236 | present | Gallery, cosine similarity, feature-tagged matching |
| `MultiTargetTrackingTrait.ts` | 266 | via `MultiTargetTrackingTrait.test.ts` | Config validation, compile targets (web/glasses/node/generic) |
| `TrackingTopologyTrait.ts` | 219 | present | Event-driven topology state, stats, visualization metadata |
| `MultiTargetTracker.ts` | 877 | covered by above | Pure deterministic runtime: Kalman + Hungarian + ReID |
| `MultiTargetTrackingTrait.test.ts` | 485 | **17 cases** | Validation, compile, cosine, Hungarian, Kalman, integration |
| `SpeechAwareEncounterTrait.ts` | 212 | present | Non-spatial composition: voice/DM ReID-backed speaker attribution |

## 2. Kalman + Hungarian + ReID Verification

### Kalman Filter (`MultiTargetTracker.ts:304-396`)
- 9-state constant-acceleration motion model: `[px, py, pz, vx, vy, vz, ax, ay, az]`
- Position-only measurement (H = [I_3 | 0_3 | 0_3])
- Process noise Q: pos=0.01, vel=0.1, acc=1.0
- Measurement noise R: 0.05
- Predict advances state by dt; update reduces covariance (test verifies P[0][0] decreases)

### Hungarian Assignment (`MultiTargetTracker.ts:507-667`)
- Munkres O(n^3) implementation with row/column minima, zero-covering, priming, and stepping
- Rectangular matrix support (pad to square with BIG cost)
- Threshold rejection post-assignment (cost >= threshold → -1)
- Tests: empty, 1x1, greedy-fail case, threshold rejection, all-reject, rectangular over/under

### ReID (`MultiTargetTracker.ts:673-709` + `ReidEmbeddingTrait.ts`)
- Cosine similarity on normalized embeddings
- Gallery with TTL and size cap (FIFO eviction)
- Feature-family gating (`featureCompatible` checks exact match or `multimodal` wildcard)
- Running-average embedding update (alpha=0.3 for updates, 0.5 for reactivation)
- False-case test (G.GOLD.013): mismatched embedding does NOT recover a lost track; spawns fresh instead

## 3. Cross-Population Usage

The trait is explicitly generic across observation domains:

| Population | Detection Shape | Modality | Test Coverage |
|------------|----------------|----------|---------------|
| Spatial XR (glasses, HoloLand, Quest) | `position + appearance_embedding` | `spatial` | spawn, motion, occlusion, ReID recovery |
| Voice utterances | `identity_embedding` (no position) | `voice` | `identityDet('voice', seed)` — confirmed track, no position flag |
| Agent DM streams | `identity_embedding` (no position) | `dm_stream` | `identityDet('dm_stream', seed)` — isolation from unrelated streams |
| Multi-modal intent fusion | `identity_embedding` | `intent` / `multimodal` | `feature` field + `multimodal` wildcard in `featureCompatible` |

**Composition:** `SpeechAwareEncounterTrait` consumes `ReidEmbeddingTrait` embeddings to attribute speakers across voice/text channels. It demonstrates the non-spatial stack in production: voice-print → ReID match → persistent speaker ID → fallback to text on low confidence.

## 4. uaa2-Service Reconciliation

### Convergent
- Default parameters are identical: 90 Hz, 0.5 Hungarian threshold, 30-frame max occlusion, 256-dim embedding, 0.75 similarity threshold, 5 feature families.
- Algorithm structure (Kalman state → Hungarian assignment → ReID recovery) is identical.
- Visualization color palette and status enum (`tracking` / `occluded` / `reid_pending` / `lost`) match between `TrackingTopologyTrait.ts` and `tracking-topology.hsplus`.

### Divergent (Intentional)
| uaa2-service | HoloScript | Rationale |
|--------------|------------|-----------|
| `mtt-algorithm-panel.hsplus` (visualization component) | `MultiTargetTrackingTrait.ts` + `MultiTargetTracker.ts` (runtime primitives) | uaa2 = glasses-lab UI; HoloScript = sovereign portable engine |
| `tracking-topology.hsplus` (3D scene graph) | `TrackingTopologyTrait.ts` (event-driven state handler) | uaa2 = HoloScript scene markup; HoloScript = trait handler consumed by renderer |
| Hardcoded to glasses directive | Compiles to web/glasses/node/generic targets | HoloScript thesis: one trait, many targets |

**No migration needed.** The split is by design: uaa2-service owns the XR glasses lab surface (visualization + API routes); HoloScript owns the sovereign primitive (algorithm + trait + compile targets).

## 5. Critical Gap Resolution

The task description stated: "MultiTargetTrackingTrait.test.ts is MISSING — this is a CI gate that must be filed as immediate follow-up."

**Status: CLOSED.** The test file exists at `packages/core/src/traits/MultiTargetTrackingTrait.test.ts` (485 LOC, 17 cases, all passing). It was created after the task description was written (peer agent work, 2026-05-12 → 2026-05-13). This is a Carousel Effect (F.035) at the task-description layer: the task was filed against a stale codebase snapshot.

## 6. Recommendations

1. **No code changes required.** The MTT trait family is complete, tested, and reconciled.
2. **No follow-up tasks required.** The phantom gap is closed.
3. **Knowledge contribution:** This memo should be synced to the team knowledge store as `pattern` (cross-population trait composition) and `gotcha` (task descriptions can stale against peer velocity).
