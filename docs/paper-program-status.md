# Paper Program Status Dashboard

**Last regenerated**: 2026-05-01 (disk-grounded: structural grep of `.tex` files + audit-matrix snapshot)
**Author**: Claude (Wave C consolidation, task_1776816202153_3f88)
**Source of truth**: `ai-ecosystem/research/paper-audit-matrix.md` for audit dimensions; `.tex` files on disk for structural counts; this file is a *derived dashboard*, not a replacement for the audit matrix.

> **Zero hardcoded stats policy (W.030)**: Counts in this file are derived from `find` and `grep` at generation time. Re-generate from disk when counts drift. Verification commands are noted inline.

---

## Quick Reference

| Metric | Value | Verification |
|--------|-------|--------------|
| Main program papers | 14 main + TVCG + 2 capstones = 17 total | `ls research/paper-*.tex \| wc -l` + TVCG |
| Gated research tracks | 13 (+ Longitudinal RE-INTAKE) | Count rows in Gated Tracks table below |
| Program-wide compile-clean | 16/16 program papers pdflatex EXIT=0 (as of 2026-04-25) | See audit-matrix refresh |
| D.011 four-pillar closed | 11/15 program papers | See D.011 columns below |
| Dual-anchor (OTS+Base) | 17/17 program .tex + TVCG .tex | `ls research/*.ots \| wc -l` |
| Paper 7 status | RETIRED standalone, folded into Paper 8 | Founder ruling 2026-04-24 |
| TVCG paper status | HELD per I.009 (Revision-1 bundle, editor-gated) | Do not anchor until revision locks |

---

## Sources Consolidated

This dashboard consolidates four per-paper trackers and the gated-research-track outlines:

| # | Source | Location | What it tracks |
|---|--------|----------|----------------|
| 1 | Structural audit matrix | `ai-ecosystem/research/paper-audit-matrix.md` | Empirical claims, D.011 repro, citations, anchors, novelty, threat model, venue fit, cal story, twin test, decoder cost, scaling, staleness |
| 2 | D.011 four-gate checklist | `HoloScript/docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` | G1 Hardware, G2 N=12, G3 Full-loop demo, G4 Ablation |
| 3 | Benchmark reproducibility | `HoloScript/docs/paper-program/D011-benchmark-reproducibility.md` | Harness commands, env capture, seed, one-command rerun |
| 4 | P3-CENTER metrics integrity | `HoloScript/docs/paper-program/P3-CENTER-metrics-integrity.md` | Throughput/ops/latency honesty for papers 2, 3, 12, 13 |
| 5-8+ | Gated research track outlines | Per-track detail docs in `ai-ecosystem/research/2026-04-24_*.md` and `ai-ecosystem/research/paper-{17..29}*` | Gate conditions, target venues, phase status |

---

## Main Program Papers (14 + TVCG + 2 Capstones = 17)

<!-- VERIFY: re-run structural grep harness to refresh counts -->

| # | Paper | Short Title | Target Venue | LOC | \todo | Citations | Bib | Anchor | D.011 Status | Key Blockers |
|---|-------|-------------|--------------|----:|------:|------------|-----|--------|--------------|--------------|
| 0c | CAEL | Causal Agent-Environment Loops | AAMAS '26 | 1690 | 4 | 33 keys / 37 calls | inline | OTS+Base | COMPLETE | Camera-ready cross-paper consistency landed 2026-04-26 |
| 1 | MCP Trust | Trust by Replay | USENIX Sec '26 | 1594 | 4 | 19 keys / 24 calls | inline | OTS+Base | COMPLETE | Ship `.sty` alongside on submission |
| 2 | SNN Acceleration | Browser-Native Spiking Neural Networks | NeurIPS | 1613 | 0 | 23 keys / 29 calls | inline | OTS+Base | RTX+demo; ablation partial; user-study pending | Full-loop demo + user study needed |
| 3 | Spatial CRDT | Cross-Adapter Spatial CRDT | ECOOP '27 | 2142 | 0 | 33 keys / 42 calls | inline | OTS+Base | COMPLETE | Cross-adapter empirics (hardware-gated for Property 4) |
| 4 | Sandbox Contract | Sandboxed Embodied Simulation | USENIX Sec '27 | 2507 | 0 | 39 keys / 55 calls | inline | OTS+Base | COMPLETE (ablation pending) | Ablation section needed |
| 5 | GraphRAG | Provenance-Backed Codebase Intelligence | ICSE '27 | 1890 | 0 | 31 keys / 42 calls | inline | OTS+Base | COMPLETE | Bib migration to `\bibliography{holoscript}` |
| 6 | Verifiable Animation | Contracted Animation Retargeting | SCA '27 | 1450 | 4 | 15 keys / 16 calls | inline | OTS+Base | COMPLETE | 4 open `\todo{}` markers |
| 7 | Verifiable IK | IK Under Contract | ~~SIGGRAPH/I3D '27~~ | 372 | 0 | 9 keys / 13 calls | inline | OTS+Base | RETIRED | Folded into Paper 8 (founder ruling 2026-04-24) |
| 8 | Unified Phys/Anim | Provenance Across Transform Graph | SIGGRAPH '27 | 1024 | 0 | 22 keys / 28 calls | inline | OTS+Base | COMPLETE | `\Bbbk` guard + macro defs added; bib data bug |
| 9 | Verifiable Motion | Provenance for AI-Generated Animation | SIG Asia '27 | 1177 | 0 | 19 keys / 14 calls | hsbib | OTS+Base | GATED | ML motion subsystem not shipped (1 `\forcecode{}`) |
| 10 | HS Core | Contracted Compilation IR | PLDI '27 | 868 | 0 | 12 keys / 21 calls | inline | OTS+Base | COMPLETE | Scaling memo needed |
| 11 | HSPlus | Reactive Traits Under Contract | ECOOP '27 | 944 | 0 | 25 keys / 20 calls | inline | OTS+Base | RTX bench MISSING; inline bib regression | RTX harness needed; `thebibliography` → `\bibliography{holoscript}` |
| 12 | HoloLand | Scene Composition Without Grammar Extension | I3D '27 | 713 | 0 | 6 keys / 8 calls | inline | OTS+Base | COMPLETE | Low cite count (8); 2 `\todo{}` camera-ready measurement gates |
| 13 | DumbGlass | Rendering as Contracted Synthesis | SIGGRAPH '28 | 951 | 0 | 18 keys / 21 calls | inline | OTS+Base | COMPLETE | Scaling memo needed |
| TVCG | Trust by Construction | Simulation Contract for Reproducible Experiments | TVCG 2026 | 1624 | 0 | 38 keys / 40 calls | inline | OTS+Base | HELD (I.009) | Revision-1 bundle, editor-gated; do not anchor until revision locks |
| C2 | Capstone P2 | Trust by Construction in Motion | SIGGRAPH '27 | 1123 | 0 | 7 keys / 13 calls | inline | OTS+Base | COMPLETE | Base anchor unsigned (nonce 45) |
| UI | Capstone UIST | Full-Program User Study | UIST '27 | 2105 | 0 | 33 keys / 50 calls | inline | OTS+Base | COMPLETE (ablation partial) | Ablation section needed |

### Column Definitions

- **LOC**: Line count of `.tex` file (verify: `wc -l research/paper-<N>-*.tex`)
- **\todo**: Open `\todo{}` markers (verify: `grep -c '\\todo{' research/paper-<N>-*.tex`)
- **Citations**: Unique keys / `\cite{}` calls (verify: `grep -o '\\cite{[^}]*}' research/paper-<N>-*.tex`)
- **Bib**: `hsbib` = wired to `\bibliography{holoscript}`; `inline` = `\begin{thebibliography}` block
- **Anchor**: `OTS+Base` = both `.ots` and `.base.json` sidecars present (verify: `ls research/paper-<N>-*.tex.ots research/paper-<N>-*.tex.base.json`)
- **D.011 Status**: COMPLETE = all 4 pillars (novelty, RTX bench, full-loop demo, ablation) + user study present; GATED = ML subsystem or hardware dependency blocking; partial = some pillars missing
- **Key Blockers**: Top 1-2 items preventing submission-readiness

### D.011 Four-Pillar Detail

| # | Paper | Novelty | RTX Bench | Full-Loop Demo | Ablation | User Study | Overall |
|---|-------|---------|-----------|----------------|----------|------------|---------|
| 0c | CAEL | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 1 | MCP Trust | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 2 | SNN | Y | Y | Y | partial | Y (N=12) | NEAR COMPLETE |
| 3 | Spatial CRDT | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 4 | Sandbox | Y | Y | Y | pending | Y (N=12) | NEAR COMPLETE |
| 5 | GraphRAG | Y | Y | Y | Y | Y (N=3+12) | COMPLETE |
| 6 | Verifiable Animation | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 7 | Verifiable IK | Y | N | N | Y | Y (N=12) | RETIRED (folded into 8) |
| 8 | Unified Phys/Anim | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 9 | Verifiable Motion | Y | Y | Y | Y | Y (N=12) | GATED (ML subsystem) |
| 10 | HS Core | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 11 | HSPlus | Y | N | Y | Y | Y (N=12) | RTX bench MISSING |
| 12 | HoloLand | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| 13 | DumbGlass | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| TVCG | Trust by Construction | Y | Y | Y | Y | Y (N=12) | HELD (I.009) |
| C2 | Capstone P2 | Y | Y | Y | Y | Y (N=12) | COMPLETE |
| UI | Capstone UIST | Y | Y | Y | partial | Y (N=12) | NEAR COMPLETE |

---

## Engineering Readiness (W.310-W.317)

| # | Paper | Cal Story | Twin Test | Decoder Cost | Scaling Memo | Staleness |
|---|-------|-----------|-----------|--------------|--------------|-----------|
| 0c | CAEL | Y | partial | partial | Y | 4 todos / 4d |
| 1 | MCP Trust | Y | N | Y | N | 4 todos / 5d |
| 2 | SNN | Y | N | N | partial | 0 todos / 5d |
| 3 | Spatial CRDT | N | partial | Y | Y | 0 todos / 5d |
| 4 | Sandbox | Y | partial | Y | Y | 0 todos / 3d |
| 5 | GraphRAG | Y | N | Y | partial | 0 todos / 5d |
| 6 | Verifiable Animation | Y | N | N | N | 4 todos / 5d |
| 7 | Verifiable IK | Y | N | N | N | 0 todos (RETIRED) |
| 8 | Unified Phys/Anim | N | N | partial | partial | 0 todos / 5d |
| 9 | Verifiable Motion | N | N | partial | partial | 0 todos / 5d |
| 10 | HS Core | N | N | partial | N | 0 todos / 5d |
| 11 | HSPlus | N | N | N | N | 0 todos / 5d |
| 12 | HoloLand | N | N | N | N | 0 todos / 5d |
| 13 | DumbGlass | Y | partial | partial | N | 0 todos / 5d |
| TVCG | Trust by Construction | N | N | N | N | 0 todos / 5d |
| C2 | Capstone P2 | Y | partial | partial | partial | 0 todos / 5d |
| UI | Capstone UIST | Y | partial | partial | partial | 0 todos / 5d |

Legend: Y = present with heading + automation; partial = heading without automation, or cross-platform without equivalence assertion; N = missing. Staleness = `<open-todo-count> / <days-since-last-commit>`.

---

## Gated Research Tracks (13 + Longitudinal)

Tracks not yet committed to a venue slot. Gate condition must clear before the paper branch opens.

| # | Track | Short Title | Status | Gate Condition | Target Venue | Detail Doc |
|---|-------|-------------|--------|----------------|--------------|------------|
| 17 | SESL | Semantic Embodiment Self-Bootstrapping Loop | Gated (Phase 1 smoke harness emitted; see `research/paper-17-sesl-pairs/INDEX.json`) | >=5k CAEL-verified pairs; >=60% SimContract pass rate; fine-tuned checkpoint >=5% better | NeurIPS/ICML workshop | `research/2026-04-24_sesl-brittney-sovereign-training.md` |
| 18 | Motion-SESL | Verifiable motion via SESL feedback | Gated (Paper 9 ML subsystem not shipped) | Paper 9 ships + >=10k CAEL motion traces + generator beats kinematic baseline | SIGGRAPH/SCA 2028 | `research/2026-04-24_motion-sesl-verifiable-motion-synthesis.md` |
| 19 | Trait Inference | Automated `.hsplus` annotation from NL | Gated (novelty undefined vs LLM baselines) | >=80% F1 on held-out + production corpus | ECOOP/OOPSLA | `research/2026-04-24_trait-inference-automated-hsplus.md` |
| 20 | Learned Scene Composition | Generative spatial layouts from HoloLand traces | Gated (HoloLand unproven at scale) | >=70% user preference (A/B) + >=500 training compositions | I3D/CHI 2028 | `research/2026-04-24_learned-scene-composition-hololand.md` |
| 21 | Adversarial Trust Injection | Attack/defense of MCP trust chains | **Phase-1 scaffold shipped** (875 LOC, 29 `\todo{measure:...}`) | Formal threat model + >=5 attack vectors + >=1 defense with measured efficacy | USENIX Sec/IEEE S&P 2027 | `research/paper-21-adversarial-trust-injection-usenix.tex` |
| 22 | Mechanized SimulationContract | Lean 4 proofs of invariants | **Phase 2 GREEN** (kernel-check exit 0, 0 sorry) | Lean encoding + >=3 invariant proofs + collaborator (lean-theorist Silver) | CAV/FM | `research/papers-22-23-mechanization/` |
| 23 | Formal Semantics | Type-theoretic foundations, soundness | **Phase 1 GREEN** (2/4 theorems proved, 0 sorry) | Lean encoding + soundness proof + collaborator | POPL/TyDe | `research/papers-22-23-mechanization/HSCore/` |
| 24 | Adaptive Interface Generation | CAEL-logged traces to personalized spatial UI | Gated (depends on UIST study) | UIST study CAEL-logged (>=30 participants) + generator + >=15% improvement | CHI 2028 | `research/2026-04-24_adaptive-interface-generation-uist.md` |
| 25 | Coordinated Multi-Brain | Specialized agent topologies under budget | Gated (fleet activated, trusted corpus not started) | >=7 handle-days continuous + audit-log 100% + brain agreement matrix + <=$50/day | AAMAS/NeurIPS 2027 | `research/2026-04-25_paper-25-fleet-multi-brain-aamas.md` |
| 26 | Brain-Composed LLM Agents | Anti-pattern discipline as capacity multiplier | Gated (Phase 1 shipped; 26-BIC measurement arm opened) | >=3 end-to-end paper deliverables + honest-refusal cases + Brain Intent Closure receipts + cost-bound study | HotOS/NSDI/OSDI workshop | `research/paper-26-bcla/README.md` |
| 27 | Founder-Skill Pattern | Decision-proxy architecture for autonomous teams | Gated (Phase 1 skill shipped) | >=10 `/founder` invocations across >=3 papers + retrospective + refusal-pattern catch | CHI/CSCW 2028 | `research/paper-27-fsdp/README.md` |
| 28 | Mesh-as-Producer | Headless x402-verified agents on spot GPUs | Gated (Phase 1 shipped, ~30 instances peak) | >=100 tasks end-to-end + >=3 papers progressed + sandbox-escape test 0/10 + <=$10/deliverable | SOPS/EuroSys 2027 | `research/paper-28-mesh-substrate/README.md` |
| 29 | Algebraic Trust + Tool-Use Sandbox | Composing sandboxed agent capabilities | Gated (algebra exists W.GOLD.037/189) | Composition theorem + >=3 brain demonstration + Lean 4 mechanization + connection to >=3 program papers | TVCG/PLDI/LICS 2028 | `research/paper-29-algebraic-trust-toolsandbox/README.md` |
| Future | Longitudinal RE-INTAKE | Cross-paper knowledge synthesis | Gated (depends on Capstone + >=50 sessions) | Capstone ships + >=50 longitudinal sessions | NeurIPS/ICLR/Nature MI TBD | `research/paper-future-longitudinal-reintake.md` |

### Paper 26 Internal Measurement Arms

These do not increase the main paper count. They are scoped evidence tracks
inside Paper 26 until their own promotion gates close.

| Arm | Status | Evidence | Promotion rule |
|-----|--------|----------|----------------|
| 26-BIC Brain Intent Closure | Open | `research/paper-26-bcla/brain-intent-closure.md`; `research/brain-intent-eval/` | Keep inside Paper 26 until it has multi-brain coverage, negative controls, strict receipts, a runtime bridge, ablation, and cost data. |

---

## Venue Deadline Reference

Venue deadlines for paper targeting. Dates are approximate submission windows; verify with official CFP before committing.

| Venue | Deadline (approx) | Papers Targeting | Notes |
|-------|-------------------|-----------------|-------|
| AAMAS 2026 | Passed (2026-02) | 0c | Submitted; camera-ready phase |
| TVCG 2026 | Rolling | TVCG | HELD per I.009; revision gated by editor |
| USENIX Sec 2026 | 2026-01 (passed) | 1 | Submission window closed |
| NeurIPS 2026 | 2026-05 | 2, 17 | Abstract deadline ~May; full ~May |
| USENIX Sec 2027 | 2026-08 / 2027-01 | 4, 21 | Two cycles per year |
| ICSE 2027 | 2026-07 | 5 | Abstract ~Jul |
| ECOOP 2027 | 2027-01 | 3, 11 | |
| SCA 2027 | 2027-03 | 6 | |
| SIGGRAPH 2027 | 2027-01 | 8, C2 | Papers + Tech Papers |
| SIG Asia 2027 | 2027-04 | 9 | |
| PLDI 2027 | 2026-11 | 10 | |
| I3D 2027 | 2026-11 | 12 | |
| SIGGRAPH 2028 | 2027-12 | 13 | Long runway |
| UIST 2027 | 2027-04 | UI | |
| CAV 2027 | 2027-01 | 22 | |
| AAMAS 2027 | 2026-09 | 25 | |
| CHI 2028 | 2027-09 | 24, 27 | |
| SOSP/EuroSys 2027 | 2027-01 | 28 | |
| POPL 2028 | 2027-07 | 23 | |
| LICS 2028 | 2027-11 | 29 | |

---

## Program-Level Blockers

Sorted by (deadline proximity x leverage x effort):

1. **[P0] Paper 9 ML motion subsystem** -- Verifiable Motion is gated on `NeuralAnimationTrait.onUpdate` + `MotionMatchingEngine` shipping. BUILD-1 present on `main` (commit `292b47e4c`). Paper-9 subsystem candidate explicit; needs final wiring and benchmark integration.
2. **[P0] Paper 11 RTX bench + bib regression** -- No GPU benchmark harness; `thebibliography` block instead of `\bibliography{holoscript}`. Both block D.011 closure.
3. **[P1] Paper 2 full-loop demo + user study** -- NeurIPS deadline imminent; ablation partial.
4. **[P1] Papers 4, UI ablation** -- Ablation sections not yet in `.tex`.
5. **[P2] Paper 12 low cite count (8 keys)** -- May need cross-program enrichment.
6. **[P2] Bib migration** -- Founder ruling (2026-04-24): all 15 papers migrate to `\bibliography{holoscript}`. Paper 9 is already done; Paper 11 regressed. 13 remaining.

---

## Cross-Paper References

- **Provenance anchoring**: `docs/provenance-anchoring.md` + `scripts/anchor_ots.py` / `scripts/anchor_base.py` / `scripts/verify_provenance.py`
- **Bibliography**: `research/holoscript.bib` (225 entries, 64 UNVERIFIED per audit matrix)
- **Benchmark canon**: `research/benchmark-canon.md`
- **D.011 gate**: Memory D.011 + `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md`
- **Metrics integrity**: `docs/paper-program/P3-CENTER-metrics-integrity.md`
- **Benchmark reproducibility**: `docs/paper-program/D011-benchmark-reproducibility.md`
- **Structural audit matrix** (authoritative): `ai-ecosystem/research/paper-audit-matrix.md`
- **Multi-mode plan**: `ai-ecosystem/research/2026-04-21_multi-mode-plan.md`

---

## How to Update This Dashboard

1. **Structural counts**: Re-run grep harness (LOC, `\todo{}`, `\cite{}`, bib type, anchor sidecars) from disk.
2. **D.011 status**: Check each `.tex` for the four pillar headings + N=12 user study.
3. **Gated track status**: Read the per-track detail docs for phase/gate updates.
4. **Venue deadlines**: Verify with official CFP before committing.
5. **After touching any paper**: Update the row; re-anchor `paper-audit-matrix.md` per its update protocol.
6. **When a gap closes**: Change cell from missing to present + add commit reference.
7. **Graduate significant closures** to knowledge store (e.g. "paper-1 bibliography wired" -> pattern).
8. **Do not hardcode ecosystem counts** (W.030): use verification commands, not inline numbers.
