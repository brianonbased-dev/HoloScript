# Support Stack

The gauntlet is not only `.holo`, `.hsplus`, and `.hs`. Those files define the experiment, but other languages provide the measurement, rendering, replay, and hardening needed to move from "nice scene" to believable embodied simulation.

## Core Experiment Formats

| Format | Role | Current file |
| --- | --- | --- |
| `.holo` | Spatial stage, objects, lighting, capture markers, physical affordances | `humanoid-rock-throw.holo` |
| `.hsplus` | Behavior contract, state transitions, interaction events, segment receipts | `humanoid-rock-throw.hsplus` |
| `.hs` | Pipeline contract for gathering artifacts, scoring, and task filing | `humanoid-rock-throw.hs` |

## Support Languages

| Support type | Why it matters | First needed artifacts |
| --- | --- | --- |
| `.ts` | Main repo/runtime support: CLI harnesses, parser/compile tests, scorecard generation, HoloMesh task seeding, Three.js/R3F capture integration, deterministic replay orchestration | `run-gauntlet.ts`, `scorecard-writer.ts`, CLI integration tests |
| `.py` | Offline analysis where Python libraries are strongest: image comparison, contact-sheet generation, simple pose/trajectory scoring, report assembly, optional OpenCV/NumPy checks | `analyze_stills.py`, `make_contact_sheet.py`, `trajectory_score.py` |
| `.rs` | Deterministic and high-performance kernels: reference ballistic solver, collision/trajectory hash, WASM physics probes, future hot-loop validation | `trajectory_kernel.rs`, `replay_hash.rs`, optional WASM package |
| `.wgsl` / `.glsl` | Rendering stress and visual realness: trajectory glow, impact particles, debug overlays, post-processing checks | trajectory/impact shaders after screenshot path works |
| `.json` | Stable machine contracts: manifests, scorecards, event receipts, segment metadata, baseline comparisons | `manifest.json`, `scorecard.schema.json`, per-run scorecards |
| `.md` | Human/agent runbooks and interpretation: what worked, what failed, what to improve next | `README.md`, `setup-validation.md`, run reports |
| `.gltf` / `.glb` | Real avatar and prop assets: replace proxy primitives with inspectable humanoid, hands, rock, and target | avatar rig, hand mesh, rock mesh, target mesh |
| `.wav` / `.mp3` | Embodied feedback: grab, release, impact, failure cues | small local fixtures once audio checks begin |

## Legacy Bridge Only

| Support type | Why it is not primary | Use only when |
| --- | --- | --- |
| `.tsx` | It pulls review back into React component surfaces instead of proving the HoloScript/HoloLand spatial surface. For this gauntlet, `.holo` should be the canonical visual review environment. | An existing Studio or HoloLand React shell already owns a needed panel, and the `.tsx` component is only a temporary bridge around the `.holo` evidence room. |

## Support Work By Phase

### Phase 0: Scaffold And Contracts

Goal: all three HoloScript formats validate, stage compiles, and the support contract is visible.

Needed support:

- `.json`: manifest and scorecard schema.
- `.md`: setup validation and known gaps.
- `.ts`: future runner shape defined, not required yet.

Current status: complete enough to begin iteration.

### Phase 1: Automated Runner

Goal: one command runs parse, compile, screenshot/headless attempts, scorecard creation, and evidence packaging.

Needed support:

- `.ts`: `run-gauntlet.ts` CLI harness.
- `.ts`: `scorecard-writer.ts` to emit `format-realism-gauntlet-scorecard-v1`.
- `.ts`: board/task seed helper using the existing HoloMesh board seed contract.
- `.json`: per-run scorecards under `.bench-logs/format-stress/<date>/humanoid-rock-throw/`.

Acceptance:

- Runner exits nonzero only for harness failure, not for expected experiment gaps.
- Every failed command is preserved as evidence.
- The run always emits a scorecard.

### Phase 2: Still Capture And Contact Sheet

Goal: capture segmented stills or clearly record why each still cannot be captured.

Needed support:

- `.ts`: screenshot/camera integration once CLI screenshot API drift is fixed.
- `.py`: contact-sheet generator.
- `.py`: basic image checks for nonblank frame, object visibility proxy, and visual diff versus prior run.

Acceptance:

- At least one contact sheet per run.
- Still images are tied to segment ids.
- Nonblank/visibility checks are machine-readable.

### Phase 3: Behavior And Physics Receipts

Goal: turn "avatar throws rock" into measurable embodied simulation.

Needed support:

- `.ts`: event recorder and deterministic replay driver.
- `.rs`: reference ballistic solver or WASM trajectory probe for expected arc bounds.
- `.py`: trajectory scoring and chart/report generation.

Acceptance:

- Release velocity, arc samples, and impact event are recorded.
- Replay hash is stable for deterministic runs.
- Physics plausibility score is computed from evidence, not vibes.

### Phase 4: Real Assets And Visual Upgrade

Goal: replace proxy primitives with a real humanoid/avatar asset and better materials/lighting.

Needed support:

- `.gltf` / `.glb`: humanoid rig, hands, rock, target.
- `.ts`: asset loader and HoloScript/HoloLand integration helpers.
- `.tsx`: legacy bridge only if an existing React panel must host the evidence temporarily.
- `.wgsl` / `.glsl`: trajectory/impact visual effects if existing rendering path supports it.
- `.py`: perceptual image diffs and contact-sheet comparisons.

Acceptance:

- Visual plausibility score improves without breaking parse/compile/runtime coverage.
- Screenshots show humanoid pose changes, not only static proxies.

### Phase 5: HoloLand/HoloShell Adoption

Goal: make the experiment useful as a platform surface, not only a repo test.

Needed support:

- `.ts`: HoloShell command adapter and HoloMesh board/task adapter.
- `.holo`: HoloLand review/evidence room as the canonical inspection surface.
- `.tsx`: legacy bridge only if an existing React shell is unavoidable.
- `.holo`: evidence room that renders the scorecard and contact sheet as spatial panels.

Acceptance:

- A HoloLand/HoloShell user can inspect the run without opening raw logs first.
- Failed segments can become task seeds with reproduction commands.

## Do Not Hide Gaps

Support code should not flatten the experiment into a fake pass. If a helper has to mock a missing capability, the scorecard must mark that segment as `blocked` or `simulated`, with the exact missing runtime/compiler surface named.
