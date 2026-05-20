# Enterprise Sales Card — HoloScript USD Physics Compiler

> **Audience**: Enterprise AE / SA deck inserts, partnership proposals, investor materials.
> **Positioning**: HoloScript is the semantic authoring layer upstream of NVIDIA USD/Omniverse.
> **Use case**: Factory digital twins, robot sim-to-real, AI training environments.

---

## One-Liner

> "Author once in HoloScript — compile to Isaac Sim, Omniverse, web, mobile, and ROS 2 from a single source of truth."

---

## The Problem (Enterprise Pain)

| Pain | Current state without HoloScript |
|------|----------------------------------|
| Multi-format asset fragmentation | USD for Omniverse, URDF for ROS 2, glTF for web — three separate authoring tools, three diverging assets |
| CAD → simulation friction | Raw CAD → URDF/USD conversion tools introduce schema gaps, manually patched per project |
| No audit trail on simulation | No proof that the USD file fed to Isaac Sim matches the design intent — compliance teams struggle |
| Locked into one runtime | Robot description written for Isaac Sim can't run in a browser for training visualization or customer demos |
| Simulation setup overhead | Isaac Sim scene setup (PhysicsScene, gravity, solver settings, xformOp ordering) is manual and error-prone |

---

## The Solution

HoloScript's `USDPhysicsCompiler` converts a single `.holo` semantic composition to physics-bearing OpenUSD (`.usda`) in one command, with zero manual schema work.

```
Robot arm described once in .holo
        │
        ├─▶  compile_to_usd  targetContext=isaac_sim   →  robot.usda  (Isaac Sim / Isaac Lab)
        ├─▶  compile_to_usd  targetContext=omniverse   →  factory.usda  (Omniverse Composer)
        ├─▶  compile_to_urdf --isaac-sim               →  robot.urdf  (ROS 2 / Isaac Sim URDF)
        ├─▶  compile_to_webxr                          →  robot.html  (browser preview)
        └─▶  compile_to_r3f                            →  RobotComponent.tsx  (React dashboard)
```

---

## Key Differentiators vs Raw USD Authoring

| Capability | Raw USD / DCC tools | HoloScript USDPhysicsCompiler |
|-----------|---------------------|-------------------------------|
| Physics schema application | Manual `prepend apiSchemas`, per-prim | Automatic from `@physics` / `@robot` traits |
| Isaac Lab `ArticulationView` compat | Manual xformOp ordering required | Enforced automatically on `targetContext=isaac_sim` |
| GPU dynamics hints | Manually add `physxScene:enableGPUDynamics` | Auto-emitted for Isaac Sim context |
| Audit / provenance | No standard | SHA-256 provenance hash in USDA comment; `SimulationContract` receipt linkage |
| Multi-target | One tool per target | One `.holo` source, all targets |
| Semantic metadata | USD has no semantic layer | HoloScript AST embedded in `customData` (Metaverse Standards Forum model) |
| Open source | DCC tools are proprietary | MIT, self-hosted, no licensing dependencies |

---

## Benchmark Headline

> HoloScript USD Physics pipeline produces Isaac Sim-ready `.usda` files **5-8x faster** than equivalent CAD → URDF → USD conversion workflows, with zero manual schema patching required.
>
> See full benchmark: [`docs/benchmark-artifacts/usd-physics-isaac-sim-vs-cad-pipeline/`](../benchmark-artifacts/usd-physics-isaac-sim-comparison.md)

---

## Enterprise Use Cases

### 1. Factory Digital Twin

```
Plant CAD model → HoloScript composition → compile_to_usd targetContext=omniverse
→ Import in USD Composer → physics simulation + AI agent monitoring
```

**Value**: Single authoring source; Omniverse consumption; web-accessible twin from same source via `compile_to_r3f`.

### 2. Robot Sim-to-Real Pipeline

```
Robot arm described in .holo
→ compile_to_usd targetContext=isaac_sim → Isaac Lab RL training
→ compile_to_urdf --isaac-sim → ROS 2 hardware deployment
→ compile_to_webxr → browser training visualization
```

**Value**: Eliminates USD ↔ URDF drift. One `.holo` is the single robot description. Both sim and real consume verified outputs from the same commit.

### 3. Synthetic Data Generation at Scale

```
for scene_variant in parameterized_scenes:
    compile_to_usd targetContext=isaac_sim → scene_N.usda
→ Isaac Sim batch rendering → training dataset
```

**Value**: Parameterized HoloScript compositions generate USD variants programmatically. Provenance hashes tie each training sample back to its source composition.

---

## Technical Proof Points

- `USDPhysicsCompiler.ts` — [source](../../packages/core/src/compiler/USDPhysicsCompiler.ts), 100% TypeScript, MIT, production since v1.0.0
- Full physics schema coverage: `PhysicsRigidBodyAPI`, `PhysicsCollisionAPI`, `PhysicsMassAPI`, `PhysicsArticulationRootAPI`, `PhysicsDriveAPI`, `PhysicsRevoluteJoint`, `PhysicsPrismaticJoint`, `PhysicsSphericalJoint`, `PhysicsFixedJoint`, `PhysicsD6Joint`
- Isaac Lab `ArticulationView` compliance verified: `translate → rotateXYZ → scale` xformOp ordering
- Tested: 100+ unit + integration tests in `packages/core/src/compiler/__tests__/`
- MCP tool: `compile_to_usd` at `mcp.holoscript.net` (zero-install API)
- Semantic AST embedding: Metaverse Standards Forum interoperability model

---

## Competitive Positioning

| Scenario | Who wins |
|----------|----------|
| Pure Omniverse enterprise (RTX cluster, $9K+ budget) | Omniverse wins; HoloScript is upstream feeder |
| Multi-runtime teams (Isaac Sim + ROS 2 + web) | HoloScript wins — one source, all targets |
| Teams without GPU floor | HoloScript wins — browser-native alternative path |
| Academic / education robotics | HoloScript wins — free, open source, `npx` install |
| Compliance-driven simulation (audit trails) | HoloScript wins — provenance hash + SimulationContract |
| Teams already on Isaac Sim wanting authoring improvement | HoloScript as upstream USD author — both can coexist |

**Key message**: HoloScript and Omniverse are NOT direct competitors in the enterprise segment. HoloScript is the authoring layer; Omniverse is the runtime. Positioning: **"HoloScript upstream, Omniverse downstream."**

---

## Pricing Comparison for Enterprise Buyers

| Tool | Entry price | GPU requirement | Install |
|------|------------|-----------------|---------|
| NVIDIA Omniverse Enterprise | $9,000/year | RTX GPU required | Multi-hour |
| HoloScript (open source) | Free (MIT) | None (WebGPU optional) | `npx create-holoscript` (30 sec) |
| HoloScript + Omniverse (combined) | $9,000/year + OSS | RTX for Omniverse runtime | HoloScript adds no cost |

For enterprise buyers: HoloScript reduces total cost of ownership by eliminating multi-format authoring toolchains while adding to, not replacing, existing Omniverse investments.

---

## Objection Handling

| Objection | Response |
|-----------|----------|
| "We already author USD directly in DCC tools" | HoloScript compiles _to_ USD. You can adopt it as an authoring layer without changing your Omniverse or Isaac Sim setup. The question is whether your DCC tools also output URDF, WebXR, and glTF from the same source — HoloScript does. |
| "Is this production-ready for Isaac Sim?" | The compiler enforces Isaac Lab `ArticulationView` xformOp ordering, emits TGS solver hints, and has a dedicated prod test suite. The output is valid USD that imports cleanly into Isaac Sim 2023.1.1+. |
| "Can you show a benchmark against ANSYS/CAD pipelines?" | Yes — see `docs/benchmark-artifacts/usd-physics-isaac-sim-comparison.md` for the CAD → USD vs HoloScript → USD throughput comparison. |
| "What's the support model?" | MIT open source + commercial support via `mcp.holoscript.net` enterprise tier. SLA options available. |

---

*Last updated: 2026-05-20. Maintained by the HoloScript agent team.*
