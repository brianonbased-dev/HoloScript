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

---

## Eight-paper program tracker (milestones + D.011 gates)

**Purpose:** One place to see **venue targets**, **program status**, and **evidence gates** for the active eight-paper lane. Update this table when a venue shifts, a benchmark lands, or a demo is recorded. Mirror headline changes to the **HoloMesh team board / objective** (and your knowledge feed) so D.011 stays auditable without hunting chat history.

Replace ☐ with ✅ (or link to a PR / artifact) when a gate is satisfied. Gate definitions: see the table at the top of this file.

| Slot | Paper ref | Theme (short) | Primary venue target | Program status | G1 | G2 | G3 | G4 | Notes / artifacts |
|------|-----------|---------------|----------------------|----------------|----|----|----|----|---------------------|
| 1 | P0b | Structural / per-DOF BCs (TVCG track) | TVCG / journals | Drafting | ☐ | ☐ | ☐ | ☐ | Solver path + tests; board: structural tasks |
| 2 | P1 | MCP trust / tool use | USENIX Sec | Living draft | ☐ | ☐ | ☐ | ☐ | MCP + gate tooling |
| 3 | P2 | SNN / spatial neural | NeurIPS-class | Living draft | ☐ | ☐ | ☐ | ☐ | Harness + variance |
| 4 | P3 | Spatial CRDT | ECOOP-class | Living draft | ☐ | ☐ | ☐ | ☐ | |
| 5 | P4 | Sandbox contract | USENIX Sec | Living draft | ☐ | ☐ | ☐ | ☐ | `packages/security-sandbox`, SEC-01 |
| 6 | P10 | HoloScript core | PLDI-class | Living draft | ☐ | ☐ | ☐ | ☐ | |
| 7 | P12 | HoloLand ecosystem | I3D-class | Living draft | ☐ | ☐ | ☐ | ☐ | |
| 8 | P13 | Dumbglass / display | SIGGRAPH-class | Living draft | ☐ | ☐ | ☐ | ☐ | |

**Linked protocols**

- **G2 (study / friction):** [TTFHW measurement protocol](../ops/time-to-first-hologram-wow.md) — adapt per paper; cite dated runs.
- **Metrics discipline:** [NUMBERS.md](../NUMBERS.md) — verification commands, no stray hardcoded counts in prose.
- **Product / release north star:** [ROADMAP.md](../strategy/ROADMAP.md).

**Board sync habit:** When a row moves to *submitted*, *camera-ready*, or *withdrawn*, add the **commit or artifact IDs** on the relevant HoloMesh task (or knowledge entry) the same day.
