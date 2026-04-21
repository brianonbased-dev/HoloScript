# Wisdom: commit coherent units eagerly (multi-agent durability)

**Status:** Graduated 2026-04-26 (founder-approved phrasing, 2026-04-21; board `task_1776799746260_hc80`).  
**Domain:** `developer-experience` / multi-agent / git

## Verbatim wisdom

Commit coherent units eagerly in multi-agent environments. Uncommitted working state is not durable against parallel activity—another agent commit, a `vitest` cache clear, or a background process can purge files between your **edit** and your **commit**. If you have written a file that completes a **coherent unit** (a new module and its tests; a renamed export and its consumers), **commit the set** before moving to the next unit rather than batching multiple units into one commit at the end. **Trade-off:** more commits in history, but you avoid long recoveries from purged working state.

## Refinement (anti-thrash)

- **“Coherent unit”** is load-bearing. This does **not** mean committing every file on every keystroke. Broken intermediate states and noisy one-line micro-commits are still wrong.
- A coherent unit = something that would pass your usual **lint + tests** (or a stated exception) and tells a **single** story in `git log`.

## When to batch

- Intentional **WIP** on a private branch is fine; **rebase** or **squash** before merge, not as an excuse to leave uncommitted work in shared automation time windows.

## HoloMesh

- The same text is (or will be) pushed to the team **knowledge** feed as `type: wisdom` for precedent queries (`docs/team/PRECEDENT_QUERY_FIRST.md`).
