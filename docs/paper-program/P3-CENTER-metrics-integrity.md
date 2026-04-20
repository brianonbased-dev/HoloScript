# P3-CENTER — empirical metrics integrity (papers 2, 3, 12, 13)

**Source:** empirical-claims task pack (Task 3).  
**Purpose:** Keep **throughput**, **ops**, and **latency-class** claims for the center of the paper program **honest and rerunnable**: every number ties to a **dated artifact** or is explicitly marked as **extrapolation / hypothesis**.

This repo clone may not ship LaTeX; when `.tex` lives in the full monorepo, use the paths below as canonical filenames.

## In-scope papers and files

| Paper | Theme (short) | Canonical TeX path (full monorepo) |
|-------|----------------|--------------------------------------|
| P2 | SNN / spatial neural | `research/paper-2-snn-neurips.tex` |
| P3 | Spatial CRDT | `research/paper-3-spatial-crdt-ecoop.tex` |
| P12 | HoloLand ecosystem | `research/paper-12-hololand-ecosystem-i3d.tex` |
| P13 | Dumbglass / display | `research/paper-13-dumbglass-siggraph.tex` |

## Reviewer checklist (acceptance gates)

1. **Provenance** — Each throughput / ops / “average” timing claim cites a **bench log, JSON, or trace path** with a **date or commit** (same bar as [D.011 benchmark reproducibility](./D011-benchmark-reproducibility.md)).
2. **Extrapolation** — Projected or modeled values appear in their **own sentence or table column**, labeled *extrapolated* or *modeled*, never mixed into a “measured” column without separation.
3. **Variance** — Where a mean is stated, the artifact should support **spread** (stdev, IQR, or n runs) or the prose must state a **single-run / pilot** limitation.
4. **Camera-ready hygiene (esp. P12)** — Placeholder figures/tables are either **final** or moved to an explicit **“Remaining work”** block with owner + target date (no silent `TODO` in camera-ready text).

## Common failure modes to fix

- Qualifiers such as **“typical”**, **“approximately”**, **“expected”** next to a number **without** a cited harness → rewrite or attach artifact.
- **Single sample** presented as representative → label as pilot or add n≥2 with spread.
- Numbers duplicated across papers → use one **canonical** artifact (see cross-paper sync in your task pack §5).

## When editing is done

- Add the **artifact path + commit** to the [eight-paper tracker](./D011_FOUR_GATE_CHECKLIST.md#eight-paper-program-tracker-milestones--d011-gates) row for P2 / P3 / P12 / P13.
- Do **not** paste fresh ecosystem counts into TeX without [NUMBERS.md](../NUMBERS.md) verification commands.

## Related

- [D.011 benchmark reproducibility](./D011-benchmark-reproducibility.md)
- [D.011 four-gate checklist](./D011_FOUR_GATE_CHECKLIST.md)
- [NUMBERS.md](../NUMBERS.md)
