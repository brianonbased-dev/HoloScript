# HoloScript Strategic Roadmap

> Describe what you want. It runs everywhere.
>
> _The declarative language for the spatial and autonomous web._

> **Current release marker: HoloScript 6.x** — package manifests and public docs are aligned to the 6.x line. See [CHANGELOG.md](../../CHANGELOG.md) for release-line corrections and full history.
> **V6 vision document:** [docs/strategy/vision/VISION_V6.md](./vision/VISION_V6.md) (realized).
> **Historical milestones:** v3.x to v5.0 archived at [docs/archive/ROADMAP_v3_to_v5_ARCHIVED.md](../archive/ROADMAP_v3_to_v5_ARCHIVED.md).
> **Metrics policy:** live counts belong in [docs/NUMBERS.md](../NUMBERS.md), not in this roadmap.

---

## Current State (6.x line, refreshed 2026-05-18)

6.x is the current outward-facing platform line. The active roadmap is no longer "finish the v5/v6 feature list"; it is verification, adoption, and physical-world closure over the substrate that already shipped.

| Surface | Current state | Evidence |
| ------- | ------------- | -------- |
| Platform release | Current public release story stays on 6.x while generated v7/v8 metadata is treated as drift. Option C security plus Route 2b/2d cross-adapter verification remain part of the 6.x continuation evidence. | [CHANGELOG.md](../../CHANGELOG.md) |
| Live metrics | Counts are dynamic and must be re-derived before citation. | [docs/NUMBERS.md](../NUMBERS.md) |
| Studio funnel | Progressive creation, team, HoloMesh, agent, and provisioning surfaces exist; ongoing work is polish and discoverability. | [packages/studio/README.md](../../packages/studio/README.md) |
| HoloMesh / Teams | Team board, presence, messages, suggestions, and knowledge are production coordination surfaces. | [packages/mcp-server/src/holomesh/README.md](../../packages/mcp-server/src/holomesh/README.md) |
| Absorb | Codebase intelligence is a first-class service and local graph workflow, not an aspirational research item. | [packages/absorb-service/README.md](../../packages/absorb-service/README.md) |
| Physical and twin stack | Robotics, WoT, MQTT, digital-twin, WebGPU, WebXR, and demo-scene substrate exist; the gap is repeatable validation and operator-facing docs. | [docs/research/ECOSYSTEM_EXPANSION_ROADMAP.md](../research/ECOSYSTEM_EXPANSION_ROADMAP.md), [docs/physics/PHYSICS_ENHANCEMENTS_ROADMAP.md](../physics/PHYSICS_ENHANCEMENTS_ROADMAP.md) |

---

## Shipped Foundation

- **Studio creation and provisioning**: GitHub OAuth, project scaffolding, agent workspace bootstrap, and progressive creation surfaces.
- **Agent-native infrastructure**: HoloMesh teams, signed identity work, HoloClaw/HoloDaemon integration, board-driven execution, and knowledge exchange.
- **Research-grade verification**: Option C cryptographic hash mode, Route 2b/2d simulation replay, paper-program benchmark harnesses, and daily digest recording rules.
- **External bridges**: MCP, Python, REST, Studio, HoloMap, HoloLand, robotics export, IoT traits, and social/share workflows all have code-backed entry points.

---

## Active 6.x Lanes

### 1. Evidence Over Claims

Every public claim needs either a command, a committed artifact, a health endpoint, or a benchmark log. `docs/NUMBERS.md` is the metric source of truth; roadmaps should name the lane and point to verification, not pin counts.

### 2. Adoption Funnel

The path is now:

```text
Absorb/codebase intelligence -> Studio creation -> HoloMesh/team publish -> economic or embodied execution
```

The missing work is not basic capability. It is making this path obvious, measurable, and hard to fall out of:

- Better docs links from onboarding pages to the live agent/MCP entry points.
- Failure-mode docs for API keys, HoloMesh identity, and local hardware prerequisites.
- Studio surfaces that make "publish to team / publish to world / publish to agent" feel like one flow.

### 3. Physical Unification

`.holo` is the shared source for virtual worlds, robotic wrappers, digital twins, and organizational automation. The next useful work is validation-oriented:

- Re-run hardware checks for WebGPU/WebXR paths on local Chrome, Quest-class browsers, and fallback runtimes.
- Turn existing physics demos into repeatable smoke commands with artifact output. ✅ WebGPU physics smoke benchmark shipped (`pnpm run benchmark:webgpu:physics` in packages/engine). Receipt: `.bench-logs/webgpu-physics-bench.json`.
- Connect IoT/robotics trait docs to actual handlers, tests, and compiler targets.

### 4. Docs Currency

Active roadmaps must answer "what is true now?" in the first screen. Historical plans move to `docs/archive/`; active plans keep a dated refresh block, source links, and a drift guard in `pnpm docs:roadmap:drift`.

### 5. Promoted Seed Backlog

Source seed: [HoloScript Autonomous Enhancements Summary](../../idea-seeds/archive-farm/2026-05-12_archive_holoscript-autonomous-enhancements-summary.md), promoted on 2026-05-20 from the archived [Autonomous Enhancements Summary](../archive/AUTONOMOUS_ENHANCEMENTS_2026-02-26.md).

| Roadmap item                    | Current check                                                                                                                                                  | Done when                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core test memory closure        | `package.json` test scripts and `packages/core/vitest.config.ts` quarantine/heap settings                                                                      | A commit either removes a current OOM quarantine or records a bounded, repeatable test command with exact failing suites and next owners.              |
| VRR validation, not VRR revival | `packages/core/src/compiler/VRRCompiler.ts` and `packages/runtime/src/VRRRuntime.ts` now contain implemented surfaces; the archive's stub claim is historical. | Completed 2026-05-20: [VRR validation receipt](../compilers/vr-reality-validation-receipt.md) records compiler/runtime/performance and CLI E2E passes; no missing runtime dependency was found. |
| Dependency audit closure        | Root `health:deps` / `audit:security` scripts are the current entry points; do not copy archived vulnerability counts.                                         | A bounded audit run is attached to a follow-up task, with each actionable package decision split into update, replace, accept-risk, or no-op.          |

---

## 6.x Verification Criteria

The 6.x line is operationally credible when an autonomous agent can:

1. Spawn natively in a VR training simulation.
2. Form a sovereign economic contract through x402.
3. Move the same logic into a physical robotic or digital-twin wrapper.
4. Produce replayable evidence that the task executed without undocumented workarounds.

All four steps powered by the 6.x architecture without workarounds.

---

_For detailed specifications, see [Vision Documents](./vision/) and the v6 anchor at [docs/strategy/vision/VISION_V6.md](./vision/VISION_V6.md)._
