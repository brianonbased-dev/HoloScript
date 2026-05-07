# Stash Backlog Triage - 2026-05-06

Task: `task_1778105792227_1827` (`[capability][git] Triage stale stash backlog on main`)

## Summary

`git stash list --date=iso` showed 8 local stashes on `main` / adjacent branches. The backlog contained two small recoverable/superseded changes and six broad archives that should not be applied directly to `main`.

Current policy:

- Recover narrowly-scoped fixes into normal commits.
- Drop only stashes that are either recovered or clearly superseded by current `main`.
- Leave broad multi-scope stashes named and documented until a human or owning agent splits them.

## Manifest

| Ref | Commit | Date | Subject | Files | Classification | Action |
| --- | --- | --- | --- | ---: | --- | --- |
| `stash@{0}` | `1c39e6de07f4` | 2026-05-05 00:34 -0700 | generated benchmark and dev artifacts 2026-05-05 | 9 | generated-artifact archive | Keep named. Do not apply whole stash; rerun benchmarks instead. |
| `stash@{1}` | `7c8c7c1e6529` | 2026-05-04 16:08 -0700 | in-flight PipelineNodeCompiler edits before cherry-pick recovery | 1 | recovered | Recovered as fail-fast unsupported source/sink handling in `PipelineNodeCompiler`; dropped after recovery commit. |
| `stash@{2}` | `a81225fa1118` | 2026-05-04 14:39 -0700 | wip-pattern-gamma-push-2026-05-04 | 11 | generated-artifact archive | Keep named. Mostly benchmark logs plus `packages/holoscript-cli/package.json` / lockfile drift; split only if CLI dependency intent is still needed. |
| `stash@{3}` | `eba3ba8f5027` | 2026-05-03 18:40 -0700 | pre-merge-184001 | 67 | unsafe mega-stash | Keep named. Do not apply whole stash: includes generated `dist`, `generate-types.mjs`, `board.json` deletion, marketplace, MCP, Studio, and scripts. Split by owner. |
| `stash@{4}` | `4ceb4f054cc8` | 2026-05-01 17:41 -0700 | absorb FILTER aggregate WIP | 64 | unsafe mixed stash | Keep named. Do not apply whole stash: includes `.claude/settings.json`, deleted `packages/fs`, deleted playground configs, broad test-config edits, and Studio changes. |
| `stash@{5}` | `e972d5837e16` | 2026-04-29 13:28 -0700 | peer-wip-during-aibrittney-push | 59 | unsafe mixed stash | Keep named. Similar to `stash@{4}` without the large deletion block; split if trait/test-config work is still relevant. |
| `stash@{6}` | `57f2ee167015` | 2026-04-24 11:24 -0700 | return-to-main-2026-04-24 | 469 | branch archive | Keep named. Originated on `deploy/w087-vertex-c`; too broad for direct main apply. Recover by subsystem only. |
| `stash@{7}` | `4821660fef01` | 2026-04-16 12:56 -0700 | temp: main local NodeGraph overlay | 1 | superseded | Current `NodeGraphPanel` already has execution result callback, execution bridge, `Play`, and `ChevronDown`; dropped after manifest commit. |

## Recovered Work

Recovered from `stash@{1}`:

- `packages/core/src/compiler/PipelineNodeCompiler.ts` now emits runtime throws/raises for unsupported source and sink types instead of silently producing `[]` or comments.
- `packages/core/src/compiler/__tests__/PipelineNodeCompiler.test.ts` covers unsupported node and python source/sink outputs.

Validation:

```text
pnpm --filter @holoscript/core exec vitest run src/compiler/__tests__/PipelineNodeCompiler.test.ts
```

Result: 1 file passed, 7 tests passed.

## Cleanup Performed

Dropped:

```text
git stash drop stash@{1}  # 7c8c7c1e6529, recovered PipelineNodeCompiler fix
git stash drop stash@{6}  # 4821660fef01, superseded NodeGraph overlay after first drop shifted indices
```

Post-cleanup `git stash list` contains 6 named stashes.

## Remaining Work

- File follow-up split tasks for the broad stashes if owners still need the work:
  - benchmark artifact regeneration (`stash@{0}`, `stash@{2}`)
  - Pipeline/marketplace/MCP mega split (`stash@{3}`)
  - trait/test-config mixed split (`stash@{4}`, `stash@{5}`)
  - deploy branch archive split (`stash@{6}`)
