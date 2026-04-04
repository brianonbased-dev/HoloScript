# HoloScript Strategic Roadmap

_The declarative language for the spatial and autonomous web._

> **Current version: v6.0.1** — shipped 2026-03-30. See [CHANGELOG.md](../../CHANGELOG.md) for full release history.
> **V6 vision document:** [docs/strategy/vision/VISION_V6.md](./vision/VISION_V6.md) (realized).
> **Historical milestones:** v3.x to v5.0 archived at [docs/archive/ROADMAP_v3_to_v5_ARCHIVED.md](../archive/ROADMAP_v3_to_v5_ARCHIVED.md).

---

## Current State (v6.0.1)

v6.0.1 shipped with 134 commits. The v5.x "Great Refinement" goals have been met or exceeded:

| Metric | v5.0 Target | v6.0 Actual |
| ------ | ----------- | ----------- |
| Tests | 1,500+ | 57,356+ passing |
| Traits | 1,800+ | 3,300+ across 114 categories |
| Compile targets | 15 | 40 compilers (12 sovereign + 28 bridge), 29 ExportTargets (51/51 benchmark, 0.7ms avg) |
| MCP tools | — | 164 total (136 holoscript + 28 absorb) |
| Packages | — | 68 |
| Studio | prototype | 34 pages, 74 API routes |
| HoloMesh | concept | V8: 43 endpoints, 8 MCP tools, 15 BT actions |
| Knowledge store | — | 676 entries across 10 domains |

What shipped in v6.0.1:

- HoloMesh V5-V8 (social traits, marketplace, enterprise teams, accessibility endpoints)
- Publishing protocol (4-layer on-chain: Provenance, Registry, Collect, Remix Revenue)
- Multi-tenant auth, RBAC across compilers
- Absorb service extracted as standalone microservice at `absorb.holoscript.net`
- Agent loop proven: knowledge query -> scene compile -> absorb health -> knowledge sync

---

## Next: v6.x Series (H1 2026)

### 1. Adoption Funnel

The infrastructure holds weight without load. Zero external agents have joined HoloMesh organically. The bottleneck is adoption, not capability.

- **Absorb -> Studio handoff:** Agent scans a repo with Absorb, gets offered Studio as the next step.
- **Studio -> HoloMesh deploy:** One-click publish from Studio to HoloMesh knowledge exchange.
- **Absorb web UI:** Browser-based entry point for agents that don't run MCP clients.

### 2. Studio Polish

34 pages built, but gaps remain:

- Full mobile responsiveness audit (viewport meta done, breakpoint audit deferred)
- Live 3D preview for all asset types
- Error classification and deterministic error messages in IDE

### 3. Compile Target Coverage

33 CompilerBase subclasses, 29 registered ExportTargets. The "30+" claim is accurate. Next step: run the audit-results pipeline to earn Interoperability Badges for each target that passes all cross-platform tests.

### 4. Trait Depth

3,300+ traits across 114 categories exist. Cross-domain interaction testing is incomplete — networked + physics + AI trait combinations need systematic audit for race conditions and edge-case crashes.

---

## Mid-term: v7.0 (H2 2026)

### The Sovereign Mesh (Epoch 7 Autonomy)

The v6.0 foundation enables `.holo` files to act as universal format for scaling intelligence across virtual worlds, physical robotics, and organizational automation.

- **HoloVM clustering:** Deploy across Kubernetes clusters. Agent topologies scale dynamically. Cross-scene telemetry for concurrent agents.
- **Physical unification:** Native execution of `.hs` logic within edge devices and robotic hardware. Robotics and Medical plugins refined for real-world fidelity.
- **uAAL cognitive engine:** Transition from TypeScript-bound heuristics to the unified uAAL (AI-native DSL) virtual machine. Neural Forge integration into the `.holo` execution path.

### Verification Criteria

v7.0 readiness is verified when an autonomous agent can:

1. Spawn natively in a VR training simulation
2. Form a sovereign economic contract (x402) to rent edge compute
3. Migrate its logic into a physical robotic wrapper
4. Execute its assigned task in the real world

All four steps powered by the v6.0 architecture without workarounds.

---

_For detailed specifications, see [Vision Documents](./vision/) and the v6 anchor at [docs/strategy/vision/VISION_V6.md](./vision/VISION_V6.md)._
