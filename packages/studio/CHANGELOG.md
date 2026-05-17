# @holoscript/studio

## 7.1.0

### Minor Changes

- c6e69b8: Stage 4 sovereign auto-rigger (BETA) — Pinocchio TS+WebGPU pipeline + Studio Auto-Rig tab.

  **@holoscript/engine** — new `Stage4` namespace export under `@holoscript/engine/character`:
  - `rigCharacter(glbBuffer, options)` — end-to-end: GLB → mesh → SDF → medial spheres → sphere graph → embedded skeleton → skin weights
  - `writeRiggedGlb(result, options)` — emit a spec-conformant glTF 2.0 binary with skin block, JOINTS_0, WEIGHTS_0, inverse-bind-matrices
  - 13 underlying modules: Stage4_MeshIO, Stage4_MeshRepair, Stage4_BVH, Stage4_SDF, Stage4_Voxelizer (CPU + GPU/WGSL paths), Stage4_MedialSurface, Stage4_SphereGraph, Stage4_DiscreteEmbedding, Stage4_ContinuousEmbedding, Stage4_SkinWeights, Stage4_Rigger, Stage4_RigWriter
  - 191 passing tests (3 WebGPU-gated, run via `pnpm test:stage4:gpu` Playwright lane)
  - Architecture: Pinocchio (Baran & Popović 2007) baseline on the existing 65-bone HumanoidSkeleton template; no model weights, no cloud, no Adobe dependency

  **@holoscript/studio** — new Auto-Rig tab in CharacterCreationModal:
  - Drag/drop GLB → click Auto-Rig → preview + per-stage timing → download rigged GLB
  - Dynamic import of `@holoscript/engine/character` (lean initial Studio bundle)
  - Strict rig-quality gate: blocks download with explicit warning when >70% of joints land outside the mesh (Stage 4 v1 algorithm limitation; see research/2026-05-16_stage4-rig-quality-critical.md)
  - Shows joints-outside-mesh, fallback ratio, weak-vertex ratio, full per-stage timing

  **Quality (v1.1 — after the U5c/U5d/minRadius fixes shipped same session)**:

  Live-asset validation across 3 Khronos Sample Asset fixtures at 32³:
  - RiggedSimple (160v, T-pose): **0/55 joints outside mesh** (perfect)
  - RiggedFigure (370v, T-pose stick figure): **3/55 joints outside** (5%)
  - CesiumMan (3273v, running pose): **43/55 joints outside** (78%) — still poor

  **Ships CLEAN for T/A-pose humanoids.** Action-pose meshes (running, jumping, sitting) still suffer the documented Pinocchio §3.1 bent-medial-axis limitation; the strict Studio rig-quality gate (>70% joints outside = download blocked) correctly catches these cases.

  Three algorithm fixes shipped this version:
  - `minRadius` default `voxSize * 1.5` → `voxSize * 0.3` (was filtering out 90% of medial-axis spheres at humanoid scale)
  - U5c: U5b refinement gains a project-to-interior pre-step + interiorWeight default 1.0→10.0
  - U5d: discrete-embedding fallback joints now project to mesh interior via SDF gradient walk

  Paper 30 PGSE neural augment (greenlit, queued, 4-6 weeks) is the long-term fix for action-pose meshes.

### Patch Changes

- Updated dependencies [c6e69b8]
- Updated dependencies [440e163]
  - @holoscript/engine@8.0.0
  - @holoscript/core@8.0.0
  - @holoscript/mesh@8.0.0
  - @holoscript/platform@8.0.0
  - @holoscript/r3f-renderer@7.0.1
  - @holoscript/absorb-service@8.0.0
  - @holoscript/framework@7.0.1
  - @holoscript/uaal@8.0.0

## 6.1.0

### Minor Changes

- <!--
  Changeset lane notes:
    - `@holoscript/core` is in the fixed-together group per `.changeset/config.json`:
      [core, cli, agent-protocol, holo-vm, snn-webgpu, uaal, vm-bridge].
      Listing `core` propagates the minor bump to all 7 synced packages; listing
      cli / snn-webgpu / agent-protocol / holo-vm / uaal / vm-bridge explicitly
      is redundant and has been removed.
    - `@holoscript/engine`, `@holoscript/mcp-server`, `@holoscript/studio` are
      in platform-v6 per `scripts/version-policy.json` but are NOT in the
      changesets `fixed` group, so they bump independently — listed explicitly.
    - `@holoscript/crdt` is in `services-v1`; independent versioning.

  Platform-v6 lane drift observed (not fixed in this changeset):
      core    6.0.4    snn-webgpu 6.0.3    holo-vm 6.0.3    agent-protocol 6.0.3
    After `pnpm changeset version` the fixed-7 will land at the same target
    (minor bump of core → all 7 at 6.1.0). Standalone platform-v6 members
    (engine 6.0.4, mcp-server 6.0.4, studio 6.0.3) bump via their own entries
    above. Studio lag is pre-existing from 2026-04-14 window; this changeset
    brings it current.
  -->

  ## 2026-04-21 — Option C security hardening, Route 2b/2d cross-adapter ε-tolerance, paper-program deliverables, recipe infrastructure

  A coordinated release consolidating the SECURITY-mode hardening wave, paper-3 Property 4 cross-adapter replay lift, several paper-driven features, and the initial lights-out recipe infrastructure. 325 commits across HoloScript + ai-ecosystem, 1 revert, zero chaos events.

  ### `@holoscript/core` — feature additions
  - **Option C: `useCryptographicHash` feature flag (`ContractConfig`)** — FNV-1a default, SHA-256 opt-in via immutable per-recorder flag. Covers CAEL hash chain, geometry hash, and state digests via single `hashBytes(bytes, mode)` dispatcher. Closes three of four named adversarial-peer weaknesses (FNV-1a collisions, trace forgery, unattested digests); attestation remains externally blocked on browser-vendor signing APIs.
  - **Route 2b — per-step canonical state projection** (`computeStateDigest()` + `stateDigests[]` in `ContractedSimulation`). `FIELD_QUANTUM_REGISTRY` with 8 field-family prefixes and characteristic-scale-derived quanta (`q_f = S_f × 10^-3`). Proof: Appendix A Lemmas 1-3 (research repo), contractivity under L ≤ 1.
  - **Route 2d — terminal canonicalization in `ContractedSimulation.solve()`** for steady-state (non-stepping) solvers. Shares per-field `FIELD_QUANTUM_REGISTRY` infrastructure with Route 2b.
  - **5b explicit dispatch in dispute resolution** — `sameAdapter()` predicate backed by `adapterFingerprint` in `cael.init.payload`. Same-adapter: strict digest enforcement; cross-adapter: fall through to end-to-end metric comparison.
  - **NaN/Infinity fail-closed guard** in `computeStateDigest` — non-finite state throws `StateIntegrityViolation` with field name + index rather than silently canonicalizing to zero. CAELReplayer inherits fail-closed semantics.
  - **Adapter-fingerprint privacy helper** (`computeAdapterFingerprint`) — SHA-256 of canonical vendor/device/driver tuple, reducing raw-hardware-info leakage from externally-shared traces.
  - **ZK commitment scheme for SimContract compliance proof** (paper-1 / capstone direction).
  - **`ProvenanceSemiring` extended to vector-valued properties** (stress tensors, velocity fields; paper-3 Limitation #1 closure).
  - **`SimContract` extended to verify WebGPU solver GPU outputs** (paper-4 Sandbox direction).
  - **Hierarchical workgroup SNN scaling to 10^6 neurons** (paper-2).
  - **STDP navigation task** with path-efficiency learning (paper-2).
  - **Distributed transform graph with CRDT-merged hashes** (paper-8 direction).
  - **`BuildCache` / `IncrementalCompiler` wired into provenance chain** (paper-10).
  - **Trait property-write annotations expanded** 37/2794 → 63/2800 with eval-subset manifest (paper-11).

  ### `@holoscript/crdt` — test hardening
  - **Paper-3 tiebreaker hardening** — agentId uniqueness tests + both-branches-valid-but-different scenario that exercises the `SemiringResolve` fallback path. Closes paper-3 evaluation gap.
  - **Paper-3 SHA-256 vs FNV-1a bench extension** to provenance source path.

  ### `@holoscript/engine` — paper-9 benchmarks
  - **Paper-9 5-category motion plausibility benchmark suite** with measured pass rates for `tab:bench`.
  - **IK latency benchmark harness** (paper-7).

  ### `@holoscript/mcp-server` — HoloMesh feed API
  - **Team hologram feed API** (`holo_hologram_publish_feed`, `holo_hologram_send`) + CDN-Cache-Control for SSE through edge networks.
  - Per-tool Prometheus metrics + structured JSON logging.
  - HoloMap tool dedupe; dev-tool + test stabilization.
  - `room-knowledge-search` CLI for precedent-query-first recipe (first step in lights-out capability; see `docs/team/`).

  ### `@holoscript/snn-webgpu` — async pipeline + Playwright
  - **Async WebGPU shader compilation pipeline**.
  - **Playwright browser harness for Paper-2 SNN WebGPU benchmark**.
  - Redundant `load()` await elimination in `WasmParserBridge` hot path.

  ### `@holoscript/cli` — create-holoscript `--go` companion
  - Minor cli changes coordinated with the `--go` / 30-second time-to-wow path (see `create-holoscript` changeset).

  ### `@holoscript/studio` — FirstRunWizard + a11y
  - **FirstRunWizard**: 5-minute onboarding path (GitHub → composition → deploy → live).
  - **MotivationStackPanel** in agent sidebar.
  - **WCAG 2.1 AA accessibility sweep**: label associations, keyboard navigation, ARIA labels.
  - **MediaRecorder MIME fallback** for R3F canvas capture.

  ### Security hardening (cross-package)
  - **Stale-shadow prevention**: `.js` / `.d.ts` emit artifacts locked to legacy allowlist in `packages/*/src/`; CI gate prevents silent recurrence of the 2026-04-21 Option C wiring incident.
  - **SEC-T11 CORS sweep**: 125 routes migrated, 12 marked-public (mcp-server).
  - **SEC-T15 prototype-chain pre-validation hardening** (defense-in-depth).
  - **RFC-028 PluginSandbox postMessage origin binding** hardened.
  - **Dependency-declared-version sync** with pnpm overrides (apollo-server, next).

  ### Recipe infrastructure (new)
  - **Lights-out recipe onboarding** (consolidated doc) describing the memory-rules + team-mode + peer-audit-loop pattern.
  - **Precedent-query-first recipe + CLI** — agent queries knowledge store before surfacing strategic decisions.
  - **Peer-drift detection recipe** — heuristic for multi-round peer collaboration quality.
  - **Action reversibility + blast-radius registry** — self-authorization for reversible low-blast actions.

  ### Paper-program deliverables (research-repo-side)

  Paper-3 Appendix A Lemmas 1-3 (formal ε-tolerance proof); paper-3 §5.2 5b dispatch pseudocode; paper-3 §Limitations adversarial-peer threat-model scoping; TBC Rev-1 bundle 5/5 patches (HELD for editor-contact); paper-0c / paper-1 / paper-2 / paper-capstone-uist Option C inheritance.

  ### Memory + vault
  - 3 new GOLD entries: W.GOLD.191 (audit-as-calibration), W.GOLD.192 (Route 2b pattern), W.GOLD.193 (threat-model-driven defaults). Companion triple tracing the one audit cycle at three layers (meta / technical / design-decision). Vault: 180 → 183 entries.
  - 3 Tier-2 knowledge-store graduations: `grad-commit-eagerly-multi-agent`, `grad-bench-deployed-path-not-proxy`, `grad-session-role-morph-emergent`. Store: 943 → 946.
  - MEMORY.md: F.023 (verify vault IDs before citing), W.072 (session role morph), W.073 (board task-creation endpoint shape), I.009 sharpened, D.010 17-paper reconciliation.

  ### Fixes (selected)
  - Author name sweep: Taxwise → Krzywoszyja normalization (revert of mis-sweep in c6ec823; residual corrections in cbce200).
  - Paper-9 `tab:bench` measured plausibility pass rates (was placeholder).
  - Paper-5 novelty citations vs LangChain / MS GraphRAG.
  - Paper-0c `entries-per-tick` corrected to match canon (4, not 5).
  - Paper-10 generalize compile-target set cardinality (no hardcoded counts).
  - `hashGeometry` signature stabilization; `TransformGraph` canonical `Transform3D` API.

### Patch Changes

- Updated dependencies
  - @holoscript/core@7.0.0
  - @holoscript/engine@7.0.0
  - @holoscript/absorb-service@7.0.0
  - @holoscript/framework@6.0.5
  - @holoscript/mesh@7.0.0
  - @holoscript/platform@7.0.0
  - @holoscript/r3f-renderer@6.0.4

## 6.0.3

### Patch Changes

- Updated dependencies [c330bbf]
  - @holoscript/engine@6.0.3
  - @holoscript/core@6.0.3
  - @holoscript/r3f-renderer@6.0.3
  - @holoscript/framework@6.0.3
