# Headless Agents — Composition Registry

Brain compositions for headless and background agents deployed via
`scripts/mesh-deploy/agents.json`. Each entry documents handle, purpose,
deployment status, and the composition file that drives it.

> **Source of truth**: `scripts/mesh-deploy/agents.json` (deployed agents) +
> `compositions/*.hsplus` (all compositions, including spec-only).
> This file is the human-readable index.

---

## Deployed Brains (active in `agents.json`)

### `lean-theorist-brain.hsplus`

| Field | Value |
|---|---|
| Handle | `mesh-worker-01` |
| Provider | `local-llm` (H200 flagship) |
| Model | `Qwen/Qwen2.5-72B-Instruct-AWQ` |
| Purpose | Lean 4 theorem proving, formal verification, mathematical reasoning for Paper program |
| Status | **ACTIVE** |

### `trait-inference-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-02` through `mesh-worker-11` (10 workers) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | HoloScript trait inference — classifying, suggesting, and composing traits from code context |
| Status | **ACTIVE** |

### `security-auditor-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-12`, `mesh-worker-13`–`16` (5 workers); `security-auditor` (disabled) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | Paper 21 adversarial security analysis — threat modeling (STRIDE/LINDDUN), attack surface enumeration, compliance checks (EU AI Act, SOC2, HIPAA) |
| Status | **ACTIVE** (workers 12–16); `security-auditor` seat **DISABLED** (orphaned — see Anomaly 2, fleet-trust-2026-05-19.md) |

### `sesl-training-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-17`–`21`, `mesh-worker-31` (6 workers) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | SESL (Simulation-Embodied Self-Learning) training data generation |
| Status | **ACTIVE** |

### `scene-composition-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-22`–`24` (3 workers) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | 3D scene composition, trait assembly, spatial layout for HoloLand |
| Status | **ACTIVE** |

### `motion-sesl-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-25`–`27` (3 workers) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | Motion capture and SESL motion data processing |
| Status | **ACTIVE** |

### `adaptive-ui-brain.hsplus`

| Field | Value |
|---|---|
| Handles | `mesh-worker-28`–`30` (3 workers) |
| Provider | `local-llm` |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` |
| Purpose | Adaptive UI generation for HoloShell surfaces |
| Status | **ACTIVE** |

---

## Spec-Only / Pre-Provisioned Brains (not in `agents.json`)

These compositions exist in `compositions/` but have no active deployment in
`agents.json`. They are either awaiting provisioning, spec-only for research,
or pre-built templates.

### `caveman-npc-brain.hsplus`

| Field | Value |
|---|---|
| Handle | None assigned (pre-provisioned) |
| Source commit | `e75901bc2` (`feat(traits): add CavemanDriveTrait + caveman-npc-brain composition`) |
| Research ref | `research/2026-05-16_glb-character-to-sovereign-caveman-agent.md` |
| Paper ref | arXiv 2604.04703 (bounded-autonomy NPC interfaces) |
| LLM default | `gemma3-1b` (sovereign on-device) |
| Vocab | ~200 words, 9 action verbs, 2-step planning ceiling |
| Purpose | Sovereign LLM-driven caveman archetype NPC for HoloLand. Drive-reactive gating (90% no-LLM target). Companion to `CavemanDriveTrait`. |
| Status | **SPEC-ONLY** — composition present, no agents.json entry, awaiting HoloLand NPC provisioning |
| Introduced with | `caveman-npc-brain.hsplus` bundled via commit `e75901bc2` (feat(traits)); audit Anomaly 5 (fleet-trust-2026-05-19.md) noted this was added as part of the `deploy/paper-31-2026-05-17` merge |

### `fleet-trust-auditor-brain.hsplus`

| Field | Value |
|---|---|
| Handle | `fleet-trust-auditor` (provisioned separately, not via agents.json workers) |
| Purpose | Automated fleet trust-drift auditing — daily composition SHA checks, CAEL anomaly detection |
| Status | **SCHEDULED** — runs as A-008 routine (RemoteTrigger), not a persistent agent |

### Other Spec-Only Compositions

| File | Purpose | Status |
|---|---|---|
| `accessibility-researcher-brain.hsplus` | Accessibility audit research | SPEC-ONLY |
| `daemon-error-taxonomy.hsplus` | Error classification daemon | SPEC-ONLY |
| `holoclaw.hsplus` | HoloClaw integration brain | SPEC-ONLY |
| `holodaemon.hsplus` | Background daemon orchestration | SPEC-ONLY |
| `holoheal.hsplus` | Self-healing / repair loop | SPEC-ONLY |
| `holomesh-agent.hsplus` | Generic HoloMesh agent template | SPEC-ONLY |
| `holomesh-holoscript-room.hsplus` | Room-aware HoloMesh agent | SPEC-ONLY |
| `lean-theorist-brain.hsplus` | (see Deployed section) | ACTIVE |
| `moltbook-agent.hsplus` | Moltbook social posting agent | SPEC-ONLY |
| `recursive-pipeline.hsplus` | Pipeline self-improvement | SPEC-ONLY |
| `self-improve-daemon.hsplus` | Self-improvement loop | SPEC-ONLY |
| `self-improvement.hsplus` | Self-improvement composition | SPEC-ONLY |
| `stdlib-demo.hsplus` | Standard library demo | DEMO |
| `studio-job-orchestration.hsplus` | Studio job orchestration | SPEC-ONLY |
| `studio-operations-dashboard.hsplus` | Studio operations | SPEC-ONLY |
| `type-fixer.hsplus` | TypeScript type error fixer | SPEC-ONLY |

---

## Drift Audit Notes

Fleet-trust anomalies are tracked in `research/audit-reports/fleet-trust-*.md`.
Brain SHA drift is flagged as HIGH severity when a composition changes in an
incidentally-scoped commit (W.087-class bundling).

**Resolved anomalies (2026-05-20):**
- Anomaly 2 (`security-auditor-brain` +217B, `f3ba1b1`): the referenced commit was on
  `deploy/paper-31-2026-05-17` branch (now deleted). Git-canonical state (9013B,
  commit `5c61e3407`) is the intended production version. Deployed container artifact
  differences are now superseded by this merge state. **RESOLVED — git-canonical is correct.**
- Anomaly 3 (`codex-brain.hsplus` Day 9 drift): file has never existed in the git repo
  (`main` or remote). The audit tracked a deployed artifact with SHA `369533021499`
  (5730B) that originated outside the committed codebase. No revert possible; no git
  source to revert to. **DOCUMENTED — deployed-only artifact, not git-sourced; fleet
  should not provision brains from uncommitted files.**
- Anomaly 5 (`caveman-npc-brain.hsplus` missing docs entry): documented above.
  **RESOLVED by this commit.**
