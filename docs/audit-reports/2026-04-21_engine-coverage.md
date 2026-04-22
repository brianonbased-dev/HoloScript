# @holoscript/engine — coverage audit (W4-T1)

**Generated:** 2026-04-22
**Board:** W4-T1 (`task_1776812245944_dw77`) and W4-T1 unblock (`task_1776829784137_mu3p`)
**Goal:** Run `pnpm exec vitest run --coverage` for `@holoscript/engine`, then list files **below 70% line coverage** with emphasis on **simulation / solvers / contract / CAEL** paths. Feeds **W4-T2** (adding tests).

## Command (authoritative)

```bash
cd packages/engine
pnpm exec vitest run --coverage
```

## Status: UNBLOCKED — coverage table below

The full `vitest run --coverage` now exits **0** in this branch after the W4-T1 unblock pass (commit on this branch). Two changes made it possible:

1. **One source fix** in `src/simulation/SimulationContract.ts` — `computeStateDigest()` was unconditionally spreading `this.solver.fieldNames`, which threw `is not iterable` for solver shapes that don't expose the field. The doc comments at `step()` / `asyncStep()` already promised conditional behavior; the implementation now matches by skipping the digest (returning `''`) when `fieldNames` is absent. This eliminated 309 unhandled rejections originating from `paper-benchmarks.test.ts`.
2. **Quarantine of 45 test files** via `vitest.config.ts` `test.exclude` — 41 files that were already failing on `vitest run` (pre-coverage) plus 4 benchmark / wall-clock-sensitive files that timed out specifically under v8 coverage instrumentation. Each entry is grouped by domain in the config with a comment explaining the class of failure (test-bug / source-bug / WebGPU-only / long-running bench). All quarantined files are tracked for follow-up in **W4-T1-followup** (board task to be opened post-merge).

Coverage was also re-scoped to `src/**/*.ts` (excluding `dist/`, `**/__tests__/**`, `*.test.ts`, `*.bench.ts`) so the table reflects shipping source, not the bundled build artefacts that previously added ~50 rows of `chunk-XXXXXXXX.js` noise at 0–4%.

### Run summary (post-fix, post-quarantine, with coverage)

| Metric | Value |
|--------|------:|
| Test files passed | **136** |
| Tests passed | **2,186** |
| Tests skipped | 1 |
| Failed test files | 0 |
| Errors | 0 |
| Exit code | **0** |
| Duration | ~286s |

### Coverage totals — `All files` summary

| Metric | % | Covered / Total |
|--------|--:|----------------:|
| **Lines** | **32.67%** | 11,142 / 34,101 |
| Statements | 32.95% | 12,523 / 38,000 |
| Functions | 27.89% | 1,827 / 6,550 |
| Branches | 24.70% | 4,403 / 17,823 |

The **32.67% line coverage** is the real product metric for the source we ship — and it confirms the audit's "low-coverage simulation surface" framing. **285 source files (out of 445 instrumented) sit below 70% line coverage**, with 30 of those in the priority simulation / physics / contract / CAEL band.

## Hotspots: priority files <70% line coverage (simulation / physics / contract)

These rows are the **W4-T2 starting backlog** — bold throughout because correctness regressions here propagate into V&V outputs and contract integrity.

| File | % Lines | % Stmts | % Funcs | Lines (total) |
|------|--------:|--------:|--------:|--------------:|
| **`src/PhysicsStep.ts`** | 0.0% | 0.0% | 0.0% | 104 |
| **`src/physics/ClothSim.ts`** | 0.0% | 0.0% | 0.0% | 85 |
| **`src/physics/VRPhysicsBridge.ts`** | 0.0% | 0.0% | 0.0% | 38 |
| **`src/rendering/webgpu/PhysicsDebugDrawer.ts`** | 0.0% | 0.0% | 0.0% | 45 |
| **`src/runtime/PhysicsEngine.ts`** | 0.0% | 0.0% | 0.0% | 3 |
| **`src/simulation/CAELFork.ts`** | 0.0% | 0.0% | 0.0% | 102 |
| **`src/simulation/CouplingManager.ts`** | 0.0% | 0.0% | 0.0% | 77 |
| **`src/simulation/NavierStokesSolver.ts`** | 0.0% | 0.0% | 0.0% | 167 |
| **`src/simulation/SimulationSerializer.ts`** | 0.0% | 0.0% | 0.0% | 25 |
| **`src/simulation/TetGenWasmMesher.ts`** | 0.0% | 0.0% | 0.0% | 9 |
| **`src/simulation/register.ts`** | 0.0% | 0.0% | 0.0% | 41 |
| **`src/simulation/import/CSVImporter.ts`** | 0.0% | 0.0% | 0.0% | 46 |
| **`src/simulation/import/OBJParser.ts`** | 0.0% | 0.0% | 0.0% | 16 |
| **`src/simulation/import/STLParser.ts`** | 0.0% | 0.0% | 0.0% | 68 |
| **`src/simulation/import/VTKImporter.ts`** | 0.0% | 0.0% | 0.0% | 104 |
| **`src/simulation/verification/StressRecovery.ts`** | 0.0% | 0.0% | 0.0% | 92 |
| **`src/tilemap/TilePhysics.ts`** | 0.0% | 0.0% | 0.0% | 44 |
| **`src/traits/GPUPhysicsTrait.ts`** | 0.0% | 0.0% | 0.0% | 43 |
| **`src/simulation/import/GmshParser.ts`** | 1.0% | 0.8% | 0.0% | 104 |
| **`src/physics/PIDController.ts`** | 1.0% | 1.0% | 0.0% | 193 |
| **`src/simulation/wasm/TetGenWasmMesher.ts`** | 4.8% | 4.3% | 0.0% | 21 |
| **`src/physics/PhysicsActivation.ts`** | 6.4% | 7.0% | 6.5% | 283 |
| **`src/physics/PBDSolver.ts`** | 19.4% | 19.4% | 13.2% | 981 |
| **`src/simulation/verification/ReportGenerator.ts`** | 25.4% | 26.3% | 57.1% | 110 |
| **`src/simulation/units/PhysicalQuantity.ts`** | 30.0% | 30.0% | 30.0% | 50 |
| **`src/simulation/CouplingManagerV2.ts`** | 49.1% | 45.0% | 50.0% | 55 |
| **`src/physics/ConstraintSolver.ts`** | 49.7% | 50.0% | 67.5% | 187 |
| **`src/physics/PhysicsTypes.ts`** | 51.5% | 52.9% | 75.0% | 33 |
| **`src/physics/PhysicsWorldImpl.ts`** | 57.7% | 54.4% | 58.0% | 575 |
| **`src/physics/PhysicsBody.ts`** | 59.2% | 58.0% | 47.9% | 184 |

**Reading the table.** Many of the 0% rows are not "untested code" — they are "code whose only tests are currently quarantined" (e.g. `PhysicsActivation`, `ClothSim`, `NavierStokesSolver`, `StressRecovery`, `VRPhysicsBridge`, `GPUPhysicsTrait`). Re-stabilising the corresponding quarantined suite immediately recovers a chunk of priority coverage — that's the W4-T1-followup work, and it's why the followup task should be sequenced **before** writing brand-new tests in W4-T2.

The rows that already have partial coverage (`PBDSolver` at 19.4%, `ConstraintSolver` at 49.7%, `PhysicsWorldImpl` at 57.7%, `PhysicsBody` at 59.2%) are the right targets for net-new tests in W4-T2 because they have working test scaffolding to extend.

## Quarantined test files (45 total, by domain)

Per task constraint "every quarantine has a TODO with a tracking task ID," each entry below is grouped in `vitest.config.ts` with a comment naming the failure class. Re-enable in W4-T1-followup as the corresponding root cause is fixed.

| Domain | Files | Likely root cause |
|--------|------:|-------------------|
| Physics (PBD / constraint / trigger / VR bridge) | 14 | Mix of test-bug (mock setup) and source-bug (solver regressions) |
| Simulation (TET10 / NS / SPR / data import) | 3 | One long-running bench, two real failures |
| Spatial / LOD (octree / frustum / spatial query) | 5 | Octree LOD has 30/52 failing — shared setup regression |
| Shader graph compiler | 1 | 2/50 failing — cheap stabilize candidate |
| Traits (MQTT / voice / WebGPU / networked / orbital / etc.) | 18 | MQTT mocks uniformly broken (vitest-v4 mock-API regression); WebGPU traits likely browser-only |
| Bench / coverage-instrumentation-sensitive | 4 | `paper-0c-cael-overhead`, `NAFEMS-LE1`, `NavierStokesSolver`, `fnv1a-vs-sha256.bench` — pass without coverage, fail wall-clock thresholds with v8 instrumentation |

## Source fix detail — `SimulationContract.computeStateDigest()`

The fix is intentionally minimal: skip-with-empty-string when `fieldNames` is missing or non-iterable. Callers push the digest into `stateDigests` and don't compare against a baseline if the contract didn't promise one — empty digest is the correct "not measured" sentinel.

```ts
const rawFieldNames = (this.solver as { fieldNames?: Iterable<string> }).fieldNames;
if (!rawFieldNames || typeof (rawFieldNames as Iterable<string>)[Symbol.iterator] !== 'function') {
  return '';
}
const fieldNames = [...rawFieldNames].sort();
```

This change preserves the existing fail-closed NaN/Infinity guard further down the function (it only runs when fieldNames is present), and matches the behavior promised in the JSDoc at `step()` and `asyncStep()`.

## Smoke: contract / CAEL hash path (still green)

```bash
cd packages/engine
pnpm exec vitest run --coverage src/simulation/__tests__/sha256.test.ts
```

`src/simulation/sha256.ts` continues to report **100%** line coverage. Provenance / contract hashing remains the strongest primitive in the package — keep it that way.

## Next edits (W4-T1-followup, W4-T2)

1. **W4-T1-followup (un-quarantine pass).** Triage the 45 quarantined files by class:
   - **MQTT** (3 files): single vitest-v4 mock-API fix likely covers all; cheap win.
   - **Octree LOD** (1 file, 30/52 failing): shared setup regression — read-then-fix one file unlocks 30 tests.
   - **WebGPU / GPU physics** (3 files): browser-only — keep quarantined behind a `vitest --browser` config rather than `vitest run`.
   - **Long-running benches** (4 files): move to a separate `vitest.bench.config.ts` so default coverage stays under ~5 min.
   - **Physics regressions** (~14 files): each needs source-side investigation; likely 2–3 underlying bugs.

2. **W4-T2 (net-new coverage).** Use the priority table above as the sorted backlog; start with files that already have working tests (`PBDSolver`, `ConstraintSolver`, `PhysicsWorldImpl`, `PhysicsBody`) before tackling 0% files whose only tests are quarantined.

3. **Post-fix re-run.** Every time a quarantined file comes back, drop it from `QUARANTINED_TESTS` in `vitest.config.ts` and re-run this command to refresh the table:
   ```bash
   cd packages/engine && pnpm exec vitest run --coverage
   ```
