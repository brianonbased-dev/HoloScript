# D.011 — Ablation study + secondary venue package (planning outline)

**Purpose:** Satisfy **gate G4** (*Ablation / alternate venue package*) from `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` with a repeatable pattern: one controlled ablation **or** a shortened alternate submission derived from the same assets.

**Scope:** Planning only — wire actual `experiments/…` harnesses and venue-specific LaTeX in the research repo when each paper’s deadline approaches.

---

## 1. Ablation dimensions (align to main claims)

Pick **one primary** and **one secondary** ablation per paper so reviewers see intentional science, not ad-hoc toggles.

| Pattern | What to remove / vary | Typical artifact |
|---------|----------------------|------------------|
| **Feature drop** | Disable one subsystem (e.g. contract hash, absorb graph, GPU path) | Bench JSON A vs B same seed |
| **Budget** | Halve iterations, smaller N, fewer traits | Latency vs quality curve |
| **Baseline swap** | Replace SOTA baseline with naive or random | Same metric table |
| **Hardware tier** | Run G1 row on two machine classes | Two `benchmarks/HARDWARE.md` rows |

**Evidence:** store under a dated path (e.g. `.bench-logs/` with paper tag + commit SHA); cite in appendix, not inline invented numbers (`docs/NUMBERS.md` discipline).

---

## 2. Secondary venue package (shared assets)

Reuse **figures, tables, and abstract** from the primary submission; produce a **short package** without duplicating full proofs.

| Venue type | Typical length | Adaptation |
|------------|----------------|------------|
| **Workshop** (e.g. systems / ML / HCI collocated) | 4–6 pages | Problem + result + limitation; drop long theory |
| **Extended abstract / poster** | 2 pages | One key figure + benchmark strip |
| **Journal short communication** | Journal limits | Emphasize reproducibility + D.011 gates |
| **arXiv-only companion** | Variable | Negative results, extra ablations not in main |

**Checklist before submit:** G1/G4 references consistent; no new numbers without new harness run; abstract text not copy-pasted from primary (venue plagiarism rules).

---

## 3. Execution order (recommended)

1. Lock **primary** venue scope and benchmark row (G1 hardware note).
2. Run **one** prespecified ablation with preregistered script revision.
3. Snapshot **artifact hashes** + link commit on HoloMesh task.
4. Derive **workshop PDF** from same `.tex` sources with `\ifworkshop` switches or a separate root file that `\input{}`s shared sections.

---

## Status

Outline shipped in HoloScript repo for **team + author alignment**; per-paper LaTeX and bench runs remain in the research lane and CI.
