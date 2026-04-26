# Production-replica matrix (gated papers → code, GPU, agents)

**Status:** v1 seed — 2026-04-26. **Maintainer:** expand rows when a paper memo adds a new gate or code anchor; keep in sync with `docs/Definitions.md` and `ai-ecosystem/DEFINITIONS.md` (fleet / room columns).

**Purpose:** For each **active** gated-paper track, record where **production-replica** evidence is supposed to come from: **HoloScript code paths**, **shared-GPU / LLM profile**, and **agent** surfaces. This is the “paper cell” view described in Definitions — not a substitute for preregistration text inside each memo.

| Paper / track | Venue (target) | Primary code paths (HoloScript) | GPU / batch profile | Agent / automation surface | Prod-replica note |
|---------------|----------------|----------------------------------|---------------------|----------------------------|-------------------|
| 4 — SimulationContract, CAEL | TVCG (narrative) | `packages/engine/src/simulation/`, contract hashes in `hashes.ts` / CAEL pipeline | CPU-first benches; WebGPU only where the memo explicitly ties rendering | MCP compile/runtime tools; no special `agents.json` unless a study arms a fixed brain | Cite **deploy-class** engine build, not a stub scene — align with `SimulationContract` enforcement paths. |
| 5 — GraphRAG / codebase intel | ICSE (narrative) | Absorb client + core analysis; `packages/mcp-server` query bridges | Absorb & indexer jobs (server-side); label `PROFILE=graphrag` in fleet or batch | Agents using `holo_*` / absorb REST with production keys | Evidence must use **the same** Absorb deploy + auth tier the paper names. |
| 11 — Trait / rendering inference | ECOOP | `packages/core` traits, `TraitCompositionCompiler`, render benches referenced in memos | Trait-rendering GPU benches as cited in research notes | Studio + MCP trait tools for reproducible compiles | Bench command + git SHA in appendix; not one-off local-only numbers. |
| 17 — SESL (ML) | MLSys / venue TBD | Training harness TBD; core trait / scene generators feeding corpora | **Label** `PAPER=17` / `PROFILE=se-sl` on fleet GPU jobs | Dataset builders in-repo + agent-governed eval scripts | Preregister split + metric before scaling GPU. |
| 18 — Motion-SESL | same family | Same as 17 + motion / animation code paths in engine | Same labeling discipline | Same | Same. |
| 19 — Automated trait inference | ECOOP / OOPSLA | Inference evaluators + core trait registry | GPU for training runs; `gpu-job-queue.mjs` + `PAPER=19` | Eval automation via MCP/CLI | Held-out eval protocol — see `ml-experiments` skill. |
| 20 — Learned scene composition | venue TBD | Compositor + generator modules tied in memo | GPU for generative runs | Agent pipelines | Same as 17–19: metric + split first. |
| 21 — Adversarial trust injection | USENIX Sec | `scripts/fleet-adversarial/`, mesh/MCP trust surfaces, `packages/mcp-server` HoloMesh | Fleet cells for red-team; CPU for orchestration | Scripted adversaries + board-tracked eval waves | **Demonstrate** attack before defense stats — use prod-shaped MCP + mesh, not a toy HTTP stub. |
| 22 — Mechanized `SimulationContract` | CAV / FM | `research/papers-22-23-mechanization/` (+ Lean out-of-tree export) | CPU / Lean; no GPU | Formal agent + CI check of Lean | Links formal statements to **named** runtime obligations in engine (see mechanization memos). |
| 23 — HoloScript core formal semantics | POPL / TyDe | Parser/core typing artifacts referenced in memos | CPU | Lean + review agents | Keep compiler/runtime alignment explicit in the memo family. |

Rows **17–20** are intentionally thin until the corresponding memos pin exact packages and commands — the matrix still **names** the fleet-label and prod-replica **discipline** so work does not stay “laptop ad hoc.”

---

## Underutilized assets (short list, 2026-04-26)

Code or config that **exists** but is **not** on the hot path for a declared paper cell today. For each: **wire**, **document deferral**, or **retire** — not silent drift.

| Asset | Typical wire-in | If deferred |
|-------|-----------------|------------|
| `packages/snn-webgpu` (WebGPU SNN) | `scripts/gpu-jobs.local.json` + `PAPER` / `PROFILE` + `node scripts/gpu-job-queue.mjs` | One line in the relevant paper memo: “not in v1 evidence path because …” |
| `packages/llm-provider` profiles | Same queue with LLM eval jobs; align token/latency profiles to Studio deploy | State which profile (e.g. thinking/effort) the paper used |
| `scripts/fleet-adversarial/` | Paper 21 cells; `fleet/status` visibility | N/A for non-security papers — say “out of scope” |
| `packages/visual` / codegen | Papers touching Graph-to-code or IDE eval | Link bench or defer explicitly |

---

## Roadmap (not automated)

1. **Paper → profile matrix** — this doc is v1; next step is to attach **exact** `pnpm`/node commands and CI job names per row as memos solidify.
2. **Fleet job labels** — standardize `PAPER`, `PROFILE`, and (where applicable) `PHASE` on `scripts/fleet-*` and `gpu-jobs.*.json` so `fleet/status` and `gpu-job-log.jsonl` match.
3. **Underutilized pass** — quarterly: grep for packages with no paper row and no `DEFER` note; either add a row here or a one-line deferral in a memo.

---

## References

- `docs/Definitions.md` — room, board, fleet, shared GPU queue.
- `ai-ecosystem/DEFINITIONS.md` — full glossary; **Fleet, room & paper experiments** section.
- `scripts/gpu-jobs.example.json` — local queue format for shared GPU.
- `scripts/post-fleet-definitions-task.mjs` — task that this matrix **closes** on the HoloMesh board (research-ops deliverable).
