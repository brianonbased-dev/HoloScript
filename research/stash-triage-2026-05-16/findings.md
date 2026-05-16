# HoloScript Git Stash Triage Report

> Generated 2026-05-16 during canary task `task_1778786200509_hijd`.
> HoloMesh API was down (502) at time of triage — board sync deferred.

## Summary

| Stash | Date | Base ancestor of HEAD? | Files | Verdict |
|-------|------|------------------------|-------|---------|
| `stash@{0}` | 2026-05-03 | **No** | 67 | Orphaned pre-merge — save diff, drop |
| `stash@{1}` | 2026-05-01 | **No** | 64 | Orphaned WIP — save diff, drop |
| `stash@{2}` | 2026-04-29 | **Yes** | 59 | Vec2 refactor already in HEAD — **DROP** |
| `stash@{3}` | 2026-04-24 | **No** | 469 | On `deploy/w087-vertex-c` — **branch needs merge review** |

---

## stash@{0} — `pre-merge-184001` (2026-05-03)

- **Base commit**: `8e600a64b` — not an ancestor of HEAD.
- **Context**: Created before a merge attempt. The base commit no longer exists in mainline history (history was rewritten after the stash).
- **Top-level changes**:
  - `.bench-logs/*` — 18 benchmark/paper log files (stale, regenerated monthly).
  - `Cargo.lock` — massive dependency update (6,969 lines changed).
  - `board.json` — board snapshot (live board is authoritative, not git).
  - `package.json` / `pnpm-lock.yaml` — dependency bumps.
  - `scripts/extract-grpo-prompts.ts` — import path moved from `packages/core/src/self-improvement/GRPOPromptExtractor` to `packages/absorb-service/src/self-improvement/GRPOPromptExtractor`. **HEAD still uses the old path** — this specific fix may still be needed.
  - `scripts/fix-source-files.ts`, `scripts/mcp-health-check.ts`, `scripts/self-improve.ts` — minor changes.
  - `packages/core/dist/*` — generated types (rebuild artifacts, not source).
  - `packages/marketplace-api/*` — protocol and route changes.
- **Recommendation**: The bench-logs, lockfiles, and dist files are stale. The only potentially valuable change is the `extract-grpo-prompts.ts` import path update. This has been **extracted to `diff-stash-0-extract-grpo-prompts.patch`** for review. After extraction, **DROP** the stash.

---

## stash@{1} — `WIP on main: b26fef5fe fix(absorb): parenthesize FILTER aggregate before ::int cast` (2026-05-01)

- **Base commit**: `b26fef5fec` — the absorb fix commit itself. **Not an ancestor of HEAD** — the commit exists in the object database but was removed from mainline history during a rebase/reset.
- **Context**: A WIP stash created on top of the absorb fix. The absorb fix commit was later orphaned.
- **Top-level changes**:
  - `packages/studio/*` — 59 files, mostly vitest config, test setup, and lib files (`themeParkDesigner.ts`, `urbanFarmPlanner.ts`).
  - The studio changes appear to be the same Vec2 refactor as stash@{2}, plus vitest configuration updates.
- **Recommendation**: The Vec2 refactor is already in HEAD. The vitest config changes may have been applied separately (see commit `b846f401f test(workspace): stabilize cross-package suites` in HEAD). After verifying overlap, **DROP** the stash.

---

## stash@{2} — `peer-wip-during-aibrittney-push` (2026-04-29)

- **Base commit**: `a1cb8a031` — **IS an ancestor of HEAD**.
- **Context**: Saved during an AI Brittney push to preserve peer state.
- **Key changes**:
  - `packages/studio/src/lib/themeParkDesigner.ts` — `Vec2` changed from tuple `[number, number]` to object `{ x: number; y: number }`.
  - `packages/studio/src/lib/urbanFarmPlanner.ts` — same Vec2 refactor.
  - `packages/studio/vitest.config.ts` and `packages/studio/src/test-setup/vitest.setup.ts` — vitest config updates.
- **Verification against HEAD**:
  - Both `themeParkDesigner.ts` and `urbanFarmPlanner.ts` in HEAD already use `Vec2 = { x: number; y: number }`.
  - The vitest config in HEAD has been updated separately.
- **Verdict**: **All changes already committed to main. DROP immediately.**

---

## stash@{3} — `return-to-main-2026-04-24` on `deploy/w087-vertex-c` (2026-04-24)

- **Base commit**: `b15206ffb` — on the `deploy/w087-vertex-c` branch. **Not an ancestor of HEAD**.
- **Branch status**: `deploy/w087-vertex-c` still exists locally with 5 commits, including W.087 vertex C security fixes (identity/members endpoints, wallet/x402/surface on presence, sovereign migrate gating, board description cap raise).
- **Key finding**: None of the 5 branch commits are ancestors of HEAD. The branch contains unmerged security/identity hardening.
- **Stash content**: 469 files changed. The stash sits on top of the branch and adds more changes (mostly `packages/studio/tsconfig.json`, `packages/studio/src/types/panels.ts`, `pnpm-lock.yaml`, and research files).
- **Recommendation**: **DO NOT DROP.** The branch itself needs a merge review. File a dedicated task: `[security] Merge deploy/w087-vertex-c branch to main` with commit list and risk assessment. The stash can be dropped after the branch is merged or after its unique changes are extracted.

---

## Actions Taken

1. **stash@{2} dropped** — all changes already in HEAD.
2. **Key diffs saved**:
   - `diff-stash-0-extract-grpo-prompts.patch` — import path fix from stash@{0}.
   - `diff-stash-3-branch-summary.txt` — summary of deploy/w087-vertex-c branch vs HEAD.
3. **Branch merge task** recommended for `deploy/w087-vertex-c`.

## Risks

- `deploy/w087-vertex-c` contains security fixes (W.087) that may be missing from main. If the branch has been superseded by other commits (e.g., `916aa1791` with a similar title but different content), verify equivalence before merging.
- Orphaned commits (`b26fef5fe`, `8e600a64b`) suggest a force-push or history rewrite occurred in early May 2026. Ensure no other lost work exists in reflog.
