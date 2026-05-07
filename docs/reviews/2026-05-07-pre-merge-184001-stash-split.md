# Pre-Merge 184001 Stash Split - 2026-05-07

Task: `task_1778130187138_xlvv` (`[capability][git] Split pre-merge-184001 mega-stash`)

## Source

The task description named `stash@{2}=eba3ba8f5027`, but the local stash indices have shifted since the 2026-05-06 triage. Current state:

| Current ref | SHA | Original ref | Subject |
| --- | --- | --- | --- |
| `stash@{0}` | `eba3ba8f50277ea86a85bec5ce98039505134bf5` | `stash@{3}` in the original manifest | `On main: pre-merge-184001` |

The stash has three parents:

| Parent | SHA | Meaning |
| --- | --- | --- |
| `stash@{0}^1` | `8e600a64b010bb21845c8572ff98f8ad40919756` | base commit |
| `stash@{0}^2` | `a8546cf2490c0d808294cb5978acce00301e8654` | index snapshot |
| `stash@{0}^3` | `0a24b33adbcd661158468fa7ebeee9b30fc4f17f` | untracked-file snapshot |

## Measured Shape

Tracked stash-local diff:

```text
git stash show --stat 'stash@{0}'
# 67 files changed, 7417 insertions(+), 1491 deletions(-)
```

Untracked payload:

```text
git ls-tree -r --name-only 'stash@{0}^3' | Measure-Object
# Count: 140
```

Current-main staleness check:

```text
git diff --shortstat HEAD 'stash@{0}' --
# 973 files changed, 29231 insertions(+), 92690 deletions(-)
```

That last number is the key result: the stash tree is far behind current `HEAD`. Applying it whole, or even applying broad subtrees, would delete current mainline work.

## Split Buckets

| Bucket | Paths | Readout | Action |
| --- | --- | --- | --- |
| Generated and local artifacts | `.bench-logs/**`, `packages/.bench-logs/**`, `packages/*/vitest*.json`, `packages/*/coverage*.txt`, `packages/core/dist/**`, `packages/core/src/reconstruction/__tests__/holomap-perf-report.json`, `Cargo.lock`, `pnpm-lock.yaml`, `board.json` deletion | Benchmark/test output, generated declarations, lock drift, and a stale board snapshot deletion. | Do not recover from stash. Regenerate from current commands when a paper or release task needs them. |
| Local agent/config payload | `.agents/**`, `.codex/**`, `.git-history-corpus/**` from `stash@{0}^3` | Local skill/config/history material, not product source. | Do not commit into HoloScript main from this stash. |
| Retired CLI archive | `packages/holoscript-cli/**` from `stash@{0}^3`; tracked `packages/cli/**` hunks | The untracked package is a retired CLI tree. Tracked hunks include risky behavior changes (`holoscript` bin removed, `runtime.executeProgram` changed to `runtime.execute`, BM25 embedding fallback). | Keep as archive. Open a fresh CLI bug task only if current `packages/cli` fails a concrete command. |
| Core type/runtime backfill | `packages/core/scripts/generate-types.mjs`, `packages/core/dist/**`, `packages/core/src/runtime/**` from `stash@{0}^3` | Typegen and runtime snapshots are mixed with generated declarations. Current main has a different `HeadlessRuntime` signature and live tests. | Do not apply. If type exports are missing, rerun type generation or patch source exports against `HEAD`. |
| HoloMesh 2FA / identity export | `packages/mcp-server/src/holomesh/routes/*identity*`, `custodial-wallet-routes.ts`, `identity/audit-log.ts`, plus untracked `identity/two-factor-auth.ts` and tests | This is a real feature-shaped bundle: TOTP, rate limiting, and audit events. It is security-sensitive and incomplete if only tracked hunks are applied. | Split to a dedicated mesh/security task. Re-implement against current `HEAD`; do not apply stale stash hunks. |
| Marketplace / x402 / web3 | `packages/marketplace-api/**` | Small route/protocol/web3 edits mixed with API surface changes. | Marketplace owner should re-derive only failing-current behavior. No direct recovery. |
| Studio smart proxy | `packages/studio/src/app/create/page.tsx`, `SceneRenderer.tsx`, `panelVisibilityStore.ts`, plus untracked `components/smart-proxy/**`, `contexts/SmartProxyContext.tsx`, `lib/smart-proxy/**`, `app/api/smart-proxy/route.ts` | Tracked hunks import files that do not exist on current `HEAD` unless the untracked bundle is also restored. | Split as a Studio feature task if still wanted. Apply as a designed feature, not stash surgery. |
| Emergent spacetime WebGPU | untracked `benchmarks/webgpu-compute/emergent-spacetime-benchmark.ts`, `packages/snn-webgpu/src/emergent-spacetime/**`, `scripts/run-emergent-spacetime-benchmark-real.mjs`, research artifacts | Current `HEAD` already has an emergent-spacetime benchmark path under `packages/studio/src/__benchmarks__` and `scripts/run-emergent-spacetime-benchmark.mjs`. | Treat as research archive. Compare only if a current paper-3 evidence task asks for it. |
| MCP tool surfaces | `packages/mcp-server/src/compiler-tools.ts`, `generators.ts`, `holo-reconstruct-*`, `world-generator-tools.ts`, `trait-tools.ts`, `ops/tool-ops-status.ts` | Multiple independent tool-surface edits. | Split by failing MCP test or issue; no bulk apply. |
| Small one-off edits | `packages/framework/**`, `packages/engine/src/animation/paper/benchmarks/paper-8-crdt-compose.ts`, `packages/vscode-extension/**`, `scripts/**` | Mixed one-file tweaks. Some may be valid, but there is no current failing command tying them together. | Keep archived until a targeted owner asks for one path. |

## Direct Checks

Smart-proxy tracked hunks are incomplete without untracked files:

```text
Test-Path packages\studio\src\components\smart-proxy\SmartProxyPanel.tsx
# False
Test-Path packages\studio\src\components\scene\SmartProxyRenderer.tsx
# False
```

TOTP support is also not present on current `HEAD`; current routes still use the documented stub:

```text
rg -n "two-factor-auth|generateTOTP|verifyTwoFactorToken" packages\mcp-server\src\holomesh
# identity-export-routes.ts and custodial-wallet-routes.ts contain only stub verifyTwoFactorToken paths
```

The emergent-spacetime script intent is already represented by a current, differently located runner:

```text
Test-Path benchmarks\webgpu-compute\emergent-spacetime-benchmark.ts
# False
rg -n "emergent-spacetime" scripts packages\studio\src\__benchmarks__ research\paper-3-evidence
# current runner: scripts/run-emergent-spacetime-benchmark.mjs
# current harness: packages/studio/src/__benchmarks__/emergent-spacetime-rtx-benchmark.ts
```

## Decision

No files were recovered and no stash was dropped.

Keep `eba3ba8f50277ea86a85bec5ce98039505134bf5` as an archive. The only credible recovery path is targeted re-implementation against current `HEAD`, using this stash as a reference source. For future work, use:

```text
git diff 'stash@{0}^1' 'stash@{0}' -- <path> | git apply --3way --check
git show 'stash@{0}^3:<untracked-path>' > <scratch-copy>
```

Do not run `git stash apply stash@{0}`.
