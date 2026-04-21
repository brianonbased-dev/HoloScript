# Paper-ID naming on HoloMesh board tasks (P3)

**Status:** Convention locked; **live title migration** waits on paper PDF header freeze (task precondition).

## Convention

- **Primary label:** `paper-N` where `N` matches the research repo filename stem (e.g. `paper-10-hs-core-pldi.tex` → **`paper-10`**).
- **Title format:** `[paper-N] <short active verb phrase>` — bracketed ID first for queue sort and grep.
- **Avoid:** Mixing legacy strings like `HS Core PLDI` without `paper-N` when the deliverable is paper-scoped.

## Mapping snapshot (examples — not an automated migration)

| Legacy / noisy pattern | Normalized title prefix |
|------------------------|-------------------------|
| `[PAPER] … (paper-11)` | `[paper-11] …` |
| `[paper-3] …` | Keep (already canonical) |
| `Paper-13 (DumbGlass) …` | `[paper-13] …` |

## Execution note (when headers land)

1. Export open tasks (`team-connect --queue` or `GET /board`).
2. For each row, PATCH title **or** add replacement task + mark old `done` with pointer (API may not expose title edit—use **add + done** if needed).
3. Append rows to this file as **old title → new title** for audit.

## Blocker

Do not bulk-rename until corresponding `\title{}` in each `.tex` is final—otherwise board and PDF disagree.
