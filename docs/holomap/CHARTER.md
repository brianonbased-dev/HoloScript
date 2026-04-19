# HoloMap v1.0 — Package charter

**Status:** Production v1.0 (native reconstruction path)  
**Companion path:** Compatibility ingest (Marble / Genie 3 manifests) stays in `WorldModelBootstrap.ts` — unchanged, supported, not second-class for operators.

## Placement decision

**Ship location:** `packages/core/src/reconstruction/` (compiled as `@holoscript/core/reconstruction`), with operator UX and ingest profiles in `@holoscript/holomap`.

**Rationale:** Reconstruction is a long-lived engine stage (WebGPU, contract tests, versioned weights). It belongs alongside other core subsystems. A separate `@holoscript/holomap` package holds **non-developer surfaces** (profiles, comparison reports, CAEL axis helpers) without pulling optional UI into core.

## v1.0 guarantees

1. **Outputs:** `ReconstructionManifest` version `1.0.0` with a **SimulationContract binding** block (`kind: holomap.reconstruction.v1`, replay fingerprint, HoloScript build id).
2. **Determinism:** For a fixed triple — model hash, seed, optional video hash, weight strategy — the **replay fingerprint** is stable across runs on the same HoloMap build (see contract tests).
3. **No silent science drift:** If WebGPU or the fused-attention path fails, the runtime throws; there is no quiet fallback that changes benchmark meaning.
4. **Observability:** Initialization, step, and finalize are structured for logging (`HoloMapRuntime` lifecycle).

## Explicitly deferred (not v1.0 blockers)

- Parity with external RGB→3D baselines on quality metrics.
- Full MCP tool surface for agents (tracked as follow-on; scaffold in RFC).
- OpenTimestamps anchoring in every CI run (fields exist on manifest; automation optional).
- **Absorb × HoloMap** — running native recon outputs through Absorb for knowledge-graph enrichment (**Q3 2026**; board OA4). Do not pull forward into Sprint 2.

## Supported inputs (v1.0)

- RGB or RGBA frames as `ReconstructionFrame` (width, height, stride3|4).
- Default target resolution in `HOLOMAP_DEFAULTS` (518×378) may be overridden; document overrides in runbooks when reporting paper numbers.

## Operator alignment

See [OPERATOR_GLOSSARY.md](./OPERATOR_GLOSSARY.md) and [RUNBOOK_PAPER_HARNESSES.md](./RUNBOOK_PAPER_HARNESSES.md).

**Sprint 2 status (I.008):** See [I008_SPRINT2_GROUND_TRUTH.md](./I008_SPRINT2_GROUND_TRUTH.md) — P0 WGSL ops are largely shipped; integration + weights + acceptance video are the critical path.

**Weights (path 3):** [DEPTHANYTHING_V2_IMPORT.md](./DEPTHANYTHING_V2_IMPORT.md) + `holoMapWeightLoader.ts` (`weightUrl` + `weightCid`).

## Golden replay fingerprint (CI)

Contract test: `packages/core/src/reconstruction/__fixtures__/GOLDEN_REPLAY_FINGERPRINT.txt` must match `computeHoloMapReplayFingerprint` for the canned inputs documented in `HoloMapGoldenFingerprint.test.ts`. Bump the file only when the fingerprint algorithm or canonical inputs change, with reviewer sign-off.
