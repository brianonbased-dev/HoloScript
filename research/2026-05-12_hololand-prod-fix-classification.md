# Worktree Classification: Hololand-prod-fix

**Audit date:** 2026-05-12  
**Auditor:** claudecode-claude  
**Source:** `C:\Users\Josep\Documents\GitHub\.codex-worktrees\Hololand-prod-fix`

## Identity

This is the **Hololand** repo (`github.com/brianonbased-dev/Hololand.git`), not a HoloScript worktree. It contains Tauri-based Rust code in `apps/brittney-desktop/src-tauri/` and `examples/oasis/src-tauri/`.

## Git State

| Property | Value |
|----------|-------|
| Checked-out branch | `codex/prod-fix-hololand` |
| HEAD commit | `4b7afb2` — "fix(ecosystem): repair Hololand Railway build" |
| Commit date | 2026-05-08 17:46:47 -0700 |
| Uncommitted changes | None (`git status --short` clean) |
| Relationship to `main` | `main` (local) is at `a1e4dd4`, 21 commits ahead |
| Merge status | `4b7afb2` is already in both local `main` and `origin/main` |
| Stash | `stash@{0}` on `main:c283713` — WIP with docs/INDEX.md + .env.example changes (never committed) |

## Classification

**STALE** — the prod-fix commit (`4b7afb2`) has been fully absorbed into `main`.

The branch `codex/prod-fix-hololand` has no unique uncommitted work and is 21 commits behind `main`. It is safe to delete **after** the stash is reviewed.

## Disposal Blocker

`stash@{0}` contains WIP that was never committed. Before deleting the worktree:
1. Pop or apply the stash onto current `main`
2. Determine if the docs/INDEX.md + .env.example changes are still relevant
3. Either commit them or drop the stash
4. Then delete the worktree

## Recommendation

- **Short term:** Pop stash onto `main`, evaluate, commit or drop.
- **Long term:** Delete `Hololand-prod-fix` directory once stash is resolved.
- **Broader:** `.codex-worktrees/HoloSpace-prod-fix` and `.codex-worktrees/KnowledgeService-prod-fix` have broken `.git` links (not valid git repos) and should also be cleaned up.
