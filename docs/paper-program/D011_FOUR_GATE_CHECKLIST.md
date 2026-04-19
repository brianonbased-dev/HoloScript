# D.011 — Four-gate reproducibility checklist (per paper)

Use when a paper claims benchmark numbers or user-facing performance. Each **claiming** paper should eventually show **all four** rows as ✅ in the program tracker.

| Gate | Meaning | Artifact |
|------|---------|----------|
| **G1 Hardware** | Fixed machine class (e.g. RTX 3060) + driver note | `benchmarks/HARDWARE.md` row or env capture |
| **G2 N=12** | User study protocol + n≥12 **or** explicit waiver | Study packet / IRB summary link |
| **G3 Full loop demo** | Scripted walkthrough + recording | `docs/demos/…` or video hash |
| **G4 Ablation** | At least one controlled ablation or alternate venue package | `experiments/…` or appendix |

**Process:** Copy this table into the paper’s internal tracker; link commits that add harness JSON/logs. Do not paste hardcoded ecosystem counts into prose (W.030).

**Status:** This HoloScript clone may omit LaTeX sources; gate completion is tracked where papers live in the full monorepo.
