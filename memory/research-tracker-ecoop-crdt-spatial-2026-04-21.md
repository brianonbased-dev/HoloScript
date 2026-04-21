# Research tracker — CRDT spatial state (ECOOP Jan 2027)

**Board:** `task_1776383022431_vnvi`  
**Venue:** ECOOP (Jan 2027) — *living draft, pre-submission*  
**Checklist discipline:** Align execution with `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` and `docs/NUMBERS.md` (no invented counts in prose).

## D.011 criteria — status (rolling)

| Criterion | Repo / owner | Status |
|-----------|----------------|--------|
| Run the product like a user (Studio, MCP, holosim paths) | Founder + Release | Not signed off in this file — repeat before any submission freeze. |
| Refresh benchmarks on a cadence (hardware + code drift; e.g. RTX 3060 class) | Benchmarks + `packages/comparative-benchmarks` | Tie to CI benches + dated capture logs when claiming numbers. |
| Recorded full-loop demo (capstone) | Studio + narrative owner | Pending; script in `docs/planning` or daily digest when captured. |
| Absorb provider re-run as models change | Absorb pipeline | On model or major `@holoscript/crdt` semver change, re-run ingest + diff. |
| Preempt reviewers (user study *N*, determinism ε) | Paper + stats owner | Cross-link Paper-3 WebGPU hardware queue + semiring benches; user study plan separate. |

## Codebase anchors (avoid hand-wavy claims)

- **CRDT package:** `packages/crdt/` — merge semantics, wire formats.
- **Spatial integration:** `packages/crdt-spatial/` — mesh / spatial overlap with CRDT ops (see exports + integrators).
- **Paper-3 determinism (hardware-gated):** `memory/paper-3-webgpu-determinism-hardware-queue.md` — cross-adapter empirical rows remain **queue**, not assumed done.

## Narrative spine (draft bullets)

- Spatial state replicated via CRDTs must preserve **ordering** and **conflict freedom** assumptions stated in code for RGA / lattice join used in production paths.
- **Separation:** protocol paper claims vs **measured** ε/determinism — cite benches or label “protocol only.”

## Next board-friendly steps (when funded)

1. Child task: “ECOOP — benchmark table refresh” with exact Vitest bench names + date.
2. Child task: “ECOOP — Studio demo script” with recording path + hash.
3. Close this tracker when a `docs/paper-program/*` draft references this file as the **living** research pointer (not before).
