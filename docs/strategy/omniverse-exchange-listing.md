# HoloScript USD Physics Compiler — NVIDIA Omniverse Exchange Listing

> **Purpose**: Copy/metadata ready for submission to [NVIDIA Omniverse Exchange](https://www.nvidia.com/en-us/omniverse/apps/exchange/) and developer relations outreach.
> **Contact point**: `mcp.holoscript.net` / `@holoscript` on X for developer relations inquiries.

---

## Extension Name

**HoloScript USD Physics Bridge** (`holoscript.usd_physics_bridge`)

## Short Description (120 chars max)

Compile HoloScript `.holo` compositions to OpenUSD with physics schemas for Isaac Sim, Isaac Lab, and Omniverse.

## Long Description

HoloScript's `USDPhysicsCompiler` exports physics-bearing USD ASCII (`.usda`) files from HoloScript `.holo` compositions, targeting NVIDIA Isaac Sim, Isaac Lab, and Omniverse natively.

### What it does

- Converts HoloScript semantic scene descriptions to valid OpenUSD with `PhysicsRigidBodyAPI`, `PhysicsCollisionAPI`, `PhysicsMassAPI`, `PhysicsArticulationRootAPI`, `PhysicsDriveAPI`, and `PhysicsJoint` schemas
- Enforces Isaac Lab `ArticulationView`-compatible `xformOp` ordering (`translate → rotateXYZ → scale`) when targeting `isaac_sim`
- Emits GPU dynamics hints (`physxScene:enableGPUDynamics`, TGS solver) for Isaac Sim
- Embeds the HoloScript semantic AST as `customData` on the root Xform prim (round-trip behavioral metadata per Metaverse Standards Forum model)
- Attaches provenance hashes for `SimulationContract` receipt linkage (SHA-256 of source composition)
- Three output contexts: `isaac_sim` | `omniverse` | `generic`

### Key capabilities

| Feature | Detail |
|---------|--------|
| Target contexts | `isaac_sim`, `omniverse`, `generic` |
| Up-axis enforcement | Z-up (Isaac Sim default), Y-up (Omniverse) |
| Articulation support | Full `PhysicsArticulationRootAPI` with multi-link robots |
| Joint types | revolute, prismatic, spherical, fixed, D6 |
| Drive types | `PhysicsDriveAPI` (angular/linear, stiffness/damping) |
| Semantic metadata | MSF-aligned `customData` embedding |
| Provenance | SHA-256 hash in USDA comment for audit trails |
| MCP integration | `compile_to_usd` MCP tool at `mcp.holoscript.net` |

### Use cases

- **Factory digital twins**: Author multi-physics environments in HoloScript, export to Omniverse for visualization and simulation
- **Robot sim-to-real**: Write `.holo` robot descriptions → export USD → run Isaac Lab RL training → transfer to physical hardware
- **AI training environments**: Generate parameterized scene variations in HoloScript → batch export USD → feed Isaac Sim synthetic data pipelines
- **Multi-target authoring**: One `.holo` source → compile to USD (Isaac Sim) + WebXR (browser) + URDF (ROS 2) simultaneously

### Getting started

```bash
# MCP tool (no install)
compile_to_usd composition=MyRobot targetContext=isaac_sim

# CLI
npx holoscript compile --target usd --usd-context isaac_sim robot.holo -o robot.usda

# TypeScript API
import { USDPhysicsCompiler } from '@holoscript/core/compiler';
const compiler = new USDPhysicsCompiler({ targetContext: 'isaac_sim' });
const usda = compiler.compile(composition, agentToken, 'robot.usda');
```

Full documentation: https://holoscript.net/docs/targets/usd-omniverse

## Category

`simulation` / `physics` / `digital-twin` / `robotics`

## Tags

`usd`, `physics`, `isaac-sim`, `isaac-lab`, `omniverse`, `digital-twin`, `robotics`, `sim-to-real`, `holoscript`, `open-source`

## Supported Platforms

- NVIDIA Isaac Sim 2023.1.1+
- NVIDIA Isaac Lab 1.0+
- NVIDIA Omniverse USD Composer
- Any OpenUSD-compatible runtime (generic mode)

## License

MIT (open source — see `packages/core/` in the HoloScript repository)

## Links

| Resource | URL |
|----------|-----|
| Documentation | https://holoscript.net/docs/targets/usd-omniverse |
| Source code | https://github.com/holoscript/holoscript/tree/main/packages/core/src/compiler/USDPhysicsCompiler.ts |
| MCP endpoint | https://mcp.holoscript.net |
| npm package | `@holoscript/core` |
| Quick start | `npx create-holoscript` |

---

## Developer Relations Outreach Template

> Use this when reaching out to NVIDIA Developer Relations or Omniverse ecosystem team.

**Subject**: HoloScript → OpenUSD Physics Compiler — Exchange listing + partnership inquiry

---

Hi [Name],

I'm Joseph, founder of HoloScript — an open-source language and compiler toolchain that targets 30+ runtimes including NVIDIA Isaac Sim, Omniverse, WebXR, Unity, Unreal, and ROS 2/URDF.

We ship a production `USDPhysicsCompiler` that exports HoloScript compositions to physics-bearing OpenUSD (`.usda`) with full PhysicsScene, ArticulationRootAPI, DriveAPI, and JointAPI support, targeting `isaac_sim | omniverse | generic` contexts. The Isaac Sim path enforces `ArticulationView`-compatible `xformOp` ordering and emits GPU dynamics hints automatically.

A few things that might be relevant:

1. **Omniverse Exchange**: We'd like to list the HoloScript USD Physics Bridge on the Exchange. The listing copy is at `docs/strategy/omniverse-exchange-listing.md` in our repo. Can you point us to the submission process?

2. **Ecosystem positioning**: HoloScript is *upstream* of USD — a semantic authoring layer that compiles to USD among many targets. We're happy to position as "Omniverse for everyone else" (browser-native, zero GPU floor, open source) and drive devs to your platform for the enterprise/on-prem use cases.

3. **Benchmark collaboration**: We have a benchmark comparing HoloScript → USD → Isaac Sim simulation throughput against legacy CAD/CAE pipelines. If NVIDIA has interest in co-publishing or validating, we'd welcome that.

Full docs: https://holoscript.net/docs/targets/usd-omniverse
Repo: https://github.com/holoscript/holoscript

Best,
Joseph Krzywoszyja
HoloScript

---

*This file is maintained by the agent team. Update contact details and benchmark links as they become available.*
