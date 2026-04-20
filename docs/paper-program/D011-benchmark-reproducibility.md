# D.011 — Benchmark reproducibility (harness + N=12)

**Purpose:** Satisfy D.010/D.011 expectations for **repeatable numbers**: same command → same artifact shape, with **environment and seed** captured so reviewers can rerun or diff.

## What to capture every time

| Field | How to record |
|--------|----------------|
| **Git revision** | `git rev-parse HEAD` (HoloScript + any sibling repos touched) |
| **Runtime** | `node -v`, `pnpm -v` (or `npm -v` if that’s the documented path) |
| **OS / GPU** | One line: OS version, discrete vs integrated GPU if relevant to timing |
| **Seeds** | If the harness uses RNG, print or export `SEED=` in the log header |
| **One-command rerun** | Exact shell command from repo root (copy-paste safe) |

## Artifact layout

- Prefer writing under **`.bench-logs/`** (gitignored) or **`benchmark-results-*.md`** at repo root when the harness already does.
- Each run: **dated filename** or ISO timestamp in JSON (`run_2026-04-20T12-00-00Z.json`).
- **No hand-edited medians in TeX** without pointing at the JSON/log path (see [NUMBERS.md](../NUMBERS.md)).

## N=12 / user-study side

- For **cold-start / UX** claims, use the [TTFHW protocol](../ops/time-to-first-hologram-wow.md): **n ≥ 12** when comparing two flows.
- For **benchmark-only** claims, n≥12 refers to **repeated harness trials** (or justify fewer with variance bars and a waiver note in the paper tracker).

## Paper tracker

- When a number ships, add the **artifact path + commit** to the row in [D011 eight-paper tracker](./D011_FOUR_GATE_CHECKLIST.md#eight-paper-program-tracker-milestones--d011-gates).

## Related

- [D.011 four-gate checklist](./D011_FOUR_GATE_CHECKLIST.md)
- [TTFHW measurement protocol](../ops/time-to-first-hologram-wow.md)
- [NUMBERS.md](../NUMBERS.md)
