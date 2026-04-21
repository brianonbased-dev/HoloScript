# @holoscript/engine — coverage audit (W4-T1)

**Generated:** 2026-04-22  
**Board:** W4-T1 (`task_1776812245944_dw77`)  
**Goal:** Run `pnpm exec vitest run --coverage` for `@holoscript/engine`, then list files **below 70% line coverage** with emphasis on **simulation / solvers / contract / CAEL** paths. Feeds **W4-T2** (adding tests).

## Command (authoritative)

```bash
cd packages/engine
pnpm exec vitest run --coverage
```

## Result: full-suite run did not yield a usable coverage table (this worktree)

A full `vitest run --coverage` **exits non-zero** in the current branch: multiple suites fail (examples observed: spatial/LOD, MQTT/traits, WebGPU/MLSMPM, Navier–Stokes, NAFEMS/SPR stress, physics triggers, constraint solver integration, and long-running bench files). Because the run is red, the **line-level coverage table is not a reliable product metric** for “what production code is exercised when tests pass.”

**Action:** Stabilize or quarantine failing tests, then re-run the command above and **replace** the “Status” section with the Vitest ` % Coverage report from v8` table. Until then, treat this file as a **blocker + methodology** record, not a final heat map.

## Static inventory (git-tracked, approximate)

| Metric | Count |
|--------|------:|
| `packages/engine/src/**` `*.ts` (excluding `__tests__` / `*.d.ts`) | **431** |
| `packages/engine` test / spec paths under `src` | **158** |

Raw ratio ≈ **0.37** test paths per source file (not 1:1; many tests cover multiple modules). The board’s note about **~40%** test-to-source scale is in the right **order of magnitude** for a **low coverage surface** on simulation-heavy code.

## Smoke: contract / CAEL hash path (isolated, green)

**Command (informational, not a substitute for the full run):**

```bash
cd packages/engine
pnpm exec vitest run --coverage src/simulation/__tests__/sha256.test.ts
```

For this run, `src/simulation/sha256.ts` reports **100%** line coverage. That is the right primitive to keep green for **provenance / contract hashing** (CAEL-related tooling).

## Hotspots to prioritize in W4-T2 (by architecture, not by % today)

When the full `vitest run --coverage` is green, re-check these areas first—they are the usual **highest impact** for correctness and security:

- **Simulation:** structural / FE solvers, stress recovery (SPR), Navier–Stokes, NAFEMS-style benchmarks, CAEL / provenance bridges.
- **Physics:** `ConstraintSolver`, PBD, triggers, `PhysicsWorld` integration, large integration tests.
- **Contract / security:** `simulation/sha256` and any **hash / signing** entry points used at compile or publish time.

## Next edit (when unblocked)

1. Run the authoritative command and paste the **“All files”** summary line plus **per-file** rows (or link to `coverage/lcov.info` in CI).  
2. List **every** file with **&lt;70%** line (or statement) coverage; bold **simulation/physics/contract** rows.  
3. Open **W4-T2** with the sorted list as the backlog.
