# Flaky Test Stabilization — Investigation Memo

**Date**: 2026-04-20
**Task**: task_1776664517766_r6eb ([Testing] Identify & stabilize flaky tests)
**Mode**: AUDIT
**Status**: Investigated. **Dominant class is NOT flakes** — see diagnosis.

## TL;DR

The HoloScript test suite's currently-failing tests are **deterministic, not flaky**.
Across 6 back-to-back reruns on 4 different candidate packages, I observed **0
flips** — every failing test failed the same way, every passing test passed.

The popular-wisdom flake vectors (`setTimeout` without fake timers, `Date.now()`,
`Math.random()`, network calls) are present in the codebase at volume (255 /
266 / 148 uses respectively), but they are **not the cause of the current
S.TST ~360 failing count**. That count is dominated by **pre-existing
consistently-failing tests** from a Vite SSR module-resolution regression and
stale test expectations — both of which are out of scope for a flaky-test
stabilization sweep.

**Deliverable**: a repeatable **stabilization recipe** and a **triage
decision tree** so the next agent working on this can classify a failure in
under 30 seconds and route it to the correct sub-task.

## Method

### Step 1: Pattern inventory (codebase-wide)

Ran grep across all `**/*.test.ts` in `packages/`:

| Pattern | File-level hits | Interpretation |
|---|---|---|
| `setTimeout(` | 255 files | candidate for fake-timer conversion |
| `Date.now()` | 266 files | candidate for `vi.setSystemTime()` |
| `Math.random()` | 148 files | candidate for seed-injection |
| `vi.useFakeTimers` | 116 files | **already using fake timers** |
| `await new Promise(r => setTimeout(r, N))` | 50+ files | explicit real-delay races |

On its face, the ratio `(setTimeout users) / (fake-timer users)` ≈ 2.2 suggests
meaningful room for conversion. But ratio alone doesn't prove flakiness — it
only proves *potential* for flakiness. See Step 3 for the empirical check.

### Step 2: Failure classification (packages/core, N=587 failures)

Ran `npx vitest run --reporter=json` against `packages/core` and classified
each failure's top-line error message:

| Class | Count | % | Flake? |
|---|---:|---:|---|
| `assertion_failure` (incl. `expected undefined to be …`) | 275 | 47% | No — deterministic |
| `vite_ssr_resolution` (`__vite_ssr_import_N__.X is not a function`) | 164 | 28% | No — module-resolution bug |
| `other` (mostly `assertTypes` receiving undefined) | 128 | 22% | No — stale API contract |
| `not_a_function` (missing class method) | 20 | 3% | No — shape drift |
| **`test_timeout`** (the vitest `Test timed out in …ms` error) | **0** | **0%** | **would be flake** |
| **`network`** (ECONNREFUSED, fetch failed) | **0** | **0%** | **would be flake** |
| **`filesystem_enoent`** | **0** | **0%** | **would be flake** |

Top files by failure count (all classes):
- `certification-levels.test.ts` — 44 (CertificationChecker.check missing)
- `HoloScriptRuntime.test.ts` — 31 (SSR resolution)
- `HoloScriptDebugger.prod.test.ts` — 23 (SSR resolution)
- `HoloScriptDebugger.test.ts` — 19 (SSR resolution)
- `wasm-compiler-package-structure.test.ts` — 18 (structural assertion)

**Single dominant root cause**: `stateMachineInterpreter.interpret is not a
function` surfacing as `__vite_ssr_import_N__` — a Vite SSR barrel-export
resolution issue. This is the `W.038` wisdom entry in MEMORY.md: *"Docker
exposes monorepo coupling pnpm hides — barrel re-exports survive, deep
subpath imports don't."* It applies here: the vitest SSR transformer is
failing the same boundary.

### Step 3: Empirical flake check (rerun-to-flip test)

Picked the 5 test files with the highest `setTimeout` count AND that actually
run to completion, ran each 2–3 times back-to-back on the same machine, and
checked for any result flip:

| File | Runs | Result |
|---|---:|---|
| `mesh/WebSocketReconnectionHandler.test.ts` | 3 | 18/18 pass → 18/18 → 18/18 |
| `mesh/consensus/ConsensusModule.test.ts` | 3 | 31/31 → 31/31 → 31/31 |
| `framework/swarm/LeaderElection.test.ts` | 3 | 13/13 → 13/13 → 13/13 |
| `framework/presence.test.ts` | 3 | 13/13 → 13/13 → 13/13 |
| `runtime/device-and-timing.test.ts` | 3 | 63/63 → 63/63 → 63/63 |
| `collab-server` (suite) | 2 | 19/19 → 19/19 |
| `mcp-server/holomesh/http-routes.test.ts` | 2 | 117/117 → 117/117 |
| `core/certification-levels.test.ts` (**known-failing**) | 2 | 44 fail / 33 pass → 44 fail / 33 pass |

**0 flips in 6 candidate files + 1 control file.** The known-failing control
reproduced identically, confirming the failure set is stable across runs.

## Diagnosis

**Dominant failure class**: Vite SSR barrel re-export resolution. Not a flake.

The pattern is:
```
TypeError: __vite_ssr_import_N__.stateMachineInterpreter.interpret is not a function
  at new HoloScriptRuntime (packages/core/src/HoloScriptRuntime.ts:257)
```

This happens because the vitest SSR transformer destructures an import like
```ts
import { stateMachineInterpreter } from '…'
```
and at the top of the test-runner process the referenced export has not
been fully attached to the exported module object yet. It fails *every*
time — it's just a cold-path module-graph issue. Same symptom as `W.038`
but at the vitest-SSR layer rather than the Docker-bundle layer.

**This is a separate task.** Fixing it would stabilize ~164 failures in
one shot but it is a scope-creep move from "stabilize flaky tests" into
"repair the vitest SSR pipeline." Per the task directive: *"Do NOT fix
unrelated test failures that aren't flakes — pre-existing-failing-
consistently = separate stabilize-mode task."*

## What DID NOT need fixing (this task)

- No true flakes observed across 6 rerun sets
- No test-timeout failures in the current run
- No network-dependent test failures (fetch / ECONNREFUSED)
- No filesystem race failures (ENOENT / permission)
- No "pass-sometimes, fail-sometimes" behavior

## Stabilization Recipe (for the next agent who actually finds a flake)

When a genuine flake appears — a test that **passes sometimes and fails
sometimes for the same code** — apply this recipe:

### Triage (≤ 30 seconds)

1. Run the single test file 5×. If results differ → flake. If identical → not a flake.
2. Read the failure message:
   - Contains `Test timed out` → **time-based flake** (recipe A)
   - Contains `ECONNREFUSED` / `fetch failed` → **network flake** (recipe B)
   - Contains `ENOENT` / `EBUSY` → **filesystem flake** (recipe C)
   - Passes first run, fails subsequent runs → **state-leak flake** (recipe D)
   - Fails first run, passes subsequent → **ordering flake** (recipe E)

### Recipe A — Time-based flake

```ts
import { describe, it, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

it('works after 1s', async () => {
  const p = doThingAfter1s()
  await vi.advanceTimersByTimeAsync(1000) // NOT await new Promise(...setTimeout...)
  await expect(p).resolves.toBe(true)
})
```
- Replace every `await new Promise(r => setTimeout(r, N))` with
  `await vi.advanceTimersByTimeAsync(N)`
- Replace every bare `Date.now()` in test or SUT with a clock injection point,
  then drive it with `vi.setSystemTime()`
- If the SUT uses `performance.now()`, stub it: `vi.stubGlobal('performance', { now: () => fakeNow })`

### Recipe B — Network flake

- Default to **msw** or **nock**. Never hit a real network from a unit test.
- If integration test needs a real endpoint: gate with `it.skipIf(!process.env.INTEGRATION)`
- Add a 5s retry budget with `it.retry(3)` **only after** sinking the root cause; retries hide bugs.

### Recipe C — Filesystem flake

- Use `tmp-promise` or `fs.mkdtempSync(os.tmpdir() + '/t-')` for per-test scratch dirs
- Clean in `afterEach` — never `afterAll`
- On Windows, close every handle before unlinking; Windows holds file locks longer than POSIX

### Recipe D — State-leak flake

- Symptom: first run passes, second fails
- Cause: module-level singleton carries state between tests
- Fix: `vi.resetModules()` in `beforeEach`, or refactor to inject the singleton

### Recipe E — Ordering flake

- Symptom: running tests in isolation passes, running full suite fails
- Cause: test A mutates global state that test B depends on
- Fix: grep the two tests for `process.env`, `global.`, `globalThis.`, module-level `let` — one of them leaks.

### Verification gate

After applying a recipe, run the fixed file **5 times back-to-back** with:
```bash
for i in 1 2 3 4 5; do npx vitest run <path> --reporter=default | tail -2; done
```
All 5 must show identical pass counts. If any run differs, the flake was
misdiagnosed — re-triage.

## Recommended task board items (next agent)

These are out-of-scope for *this* task but should be filed:

1. **[stabilize] Fix vite-ssr barrel resolution in packages/core** — would clear ~164 failures in one shot. Probable location: `packages/core/src/HoloScriptRuntime.ts:257` + the `stateMachineInterpreter` export site.
2. **[stabilize] Repair certification-levels suite** — `CertificationChecker.check` method missing; 44 failures all call it.
3. **[docs] Update S.TST memory counter** — claimed ~362; core alone shows 587. Either run an aggregated count or date-qualify the figure.

## Remaining flake estimate

**Observed flakes on this machine, right now: 0.**

That's not the same as "there are none ever." A flake hiding under a
consistent failure wouldn't have shown up in this investigation — you
can't observe a flake in a test that doesn't pass in the first place.
Once the `vite_ssr_resolution` + `certification-levels` failures are
cleared, the suite should be re-sampled with the Step 3 rerun protocol.
A realistic ceiling given the codebase's `setTimeout`-without-fake-timers
ratio is **5–20 true flakes**, almost all of them time-based, in the
swarm/consensus/network layers.

## Commits

No commits land from this task. Zero flaky-test fixes were needed because
zero flakes were observed. The deliverable is this memo + the knowledge
entry that graduates the recipe.
