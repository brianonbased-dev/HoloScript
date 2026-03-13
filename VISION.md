# HoloScript V6 Vision

> **Read this first.** This document is the authoritative mental model for understanding HoloScript. Every AI agent, contributor, and tool should internalize these axioms before reading code.

---

## The Five Axioms

### 1. Traits Are the Foundation

HoloScript is not a 3D language. It is not a spatial computing tool. It is a **semantic specification language** built on a trait system of 1,525+ composable decorators.

A trait is a closed-world declaration: `@physics { mass: 5 }`, `@protocol { phases: 7 }`, `@http { method: "GET" }`, `@agent { role: "researcher" }`. Every trait carries its own referent — the compiler enforces what the trait means on every target platform.

Spatial traits (`@physics`, `@grabbable`, `@anchor`) are **one category among thirteen**. The others include AI/Behavior, Networking, IoT, Economic Primitives, Security, Animation, and more.

### 2. Everything Is an Entity

In HoloScript, a REST endpoint, an AI agent, a 3D dragon, a database schema, and a neural network layer are all the same thing: **an entity with traits**.

```
entity RestAPI       { @http { method: "GET", path: "/health" } }
entity Agent         { @protocol { phases: 7 } @lifecycle { cycle: 68 } }
entity Dragon        { @mesh { geometry: "dragon.glb" } @physics { mass: 200 } }
entity SensorHub     { @iot_sensor { type: "temperature" } @mqtt_bridge {} }
entity TrainingBatch { @data { format: "jsonl" } @pipeline { stage: "inference" } }
```

There is no distinction between "backend code" and "3D content." Traits describe what something IS. The compiler decides how to instantiate it.

### 3. The Compiler Makes It Real

HoloScript's compiler fleet has **18 platform-level compile targets** and 9 internal compilation modes. The same trait declaration compiles to:

- **Unity C#**: `AddComponent<Rigidbody>(); rb.mass = 5.0f;`
- **VRChat Udon**: `[UdonBehaviourSyncMode] rb.mass = 5.0f;`
- **URDF (ROS)**: `<inertial><mass value="5"/></inertial>`
- **Node.js Service**: Express route handler with validation (planned)

The compiler is a pure function: same input, same output, no ambient state. Determinism, exhaustiveness, and composability are formally guaranteed.

### 4. The Studio Is One Viewport

HoloScript Studio — the React/R3F-based visual editor — is **one way to view a semantic graph**. The same graph can be:

- Rendered as a 3D scene (Studio viewport)
- Edited as text (`.holo`, `.hs`, `.hsplus` files)
- Queried via MCP tools (43+ tools for AI agents)
- Analyzed as a dependency graph (`holoscript absorb`)
- Compiled to platform code (compiler fleet)

The 3D canvas is the most visual rendering mode, but it's not privileged. An agent that never opens the Studio can still create, validate, compile, and deploy HoloScript content entirely through MCP tools or CLI.

### 5. Absorb Goes Both Ways

The `holoscript absorb` pipeline scans existing codebases (TypeScript, Python, Rust, Go) and converts them into HoloScript entities:

```
TypeScript Source → CodebaseScanner → CodebaseGraph → .holo Composition
```

This is the **forward direction**: existing code becomes spatial entities with semantic metadata.

The **reverse direction** is the compiler: HoloScript entities compile back to platform-specific code.

The **full loop**: TypeScript → absorb → HoloScript → edit/design → compile → TypeScript. The HoloScript representation is the semantic layer where AI and humans collaborate, and the compiled output is the runtime artifact.

---

## Coverage Map: How Much Backend Can HoloScript Handle?

Using uaa2-service (a production AI agent orchestration platform) as the benchmark:

### Natively (~40%)

| System | How |
|---|---|
| Agent definitions | Entity + `@agent`, `@lifecycle`, `@protocol` traits |
| Protocol state machines | Trait state transitions, phase enums, guard conditions |
| Knowledge schemas | `@pattern`, `@wisdom`, `@gotcha` traits with typed properties |
| Simulation entities | Spatial entities with `@physics`, `@interaction`, `@ai` traits |
| Economy model | `@credit`, `@job`, `@marketplace` economic primitives |
| Entity relationships | Parent-child graph, `@network` edges, community detection |

### Partially (~30%)

| System | Gap |
|---|---|
| MCP tool registration | Trait describes the tool; handler needs imperative code |
| Resilience patterns | `@circuit_breaker { threshold: 5 }` as spec; retry logic compiled |
| Auth & RBAC | Policy-as-trait; JWT validation as compiled TypeScript |
| Mesh networking | Topology traits; WebSocket handshake compiled |

### Needs TypeScript (~30%)

| System | Why |
|---|---|
| SQL/database queries | Imperative data access |
| Express middleware | Sequential request processing |
| Error handling plumbing | Runtime try/catch, stack traces |
| File I/O, streams | OS-level operations |
| Third-party API calls | SDK-specific imperative code |

**Key insight**: HoloScript handles the most valuable 40% — the domain model, architecture, and design. The 30% it can't handle is plumbing. The compiler bridge generates the boilerplate, AI fills in the imperative gaps.

---

## The Semantic Stack

```
┌─────────────────────────────────────────────┐
│  .holo  — Scene compositions, world layout  │  Declarative
├─────────────────────────────────────────────┤
│  .hs    — Agent logic, templates, streams   │  Behavioral
├─────────────────────────────────────────────┤
│  .hsplus — Typed modules, state machines    │  Structural
├─────────────────────────────────────────────┤
│  .ts    — Runtime implementation            │  Imperative
└─────────────────────────────────────────────┘
         ↓ compile ↓              ↑ absorb ↑
┌─────────────────────────────────────────────┐
│  Unity | Unreal | VRChat | URDF | WebGPU   │  Platform targets
│  Node.js | iOS | Android | WASM | USD      │
└─────────────────────────────────────────────┘
```

Each layer has a purpose:
- **`.holo`**: What the world looks like and how entities relate
- **`.hs`**: How entities behave and respond to events
- **`.hsplus`**: Type-safe logic, modules, state machines
- **`.ts`**: Runtime code the compiler can't generate (DB queries, API calls)

---

## Integration Model

HoloScript operates as three complementary layers:

1. **Specification Layer** (HoloScript) — Describes WHAT things are via traits
2. **Implementation Layer** (TypeScript/compiled code) — Handles HOW things execute at runtime
3. **Translation Layer** (AI + absorb + compiler) — Bridges between specification and implementation

An AI agent working with HoloScript:
- Reads `.holo`/`.hs`/`.hsplus` files to understand domain semantics
- Generates trait-based entity definitions from natural language
- Lets the compiler produce platform-specific code
- Fills in only the imperative gaps that traits can't express

This is not "AI replacing code." It's **AI working at the semantic level** while the compiler handles the syntax.

---

## Version History

| Version | Focus |
|---|---|
| v1–v2 | 3D scene description language |
| v3 | Multi-target compiler, trait system |
| v4 | Multi-domain expansion (IoT, robotics, healthcare) |
| v5 | Autonomous agents, economic primitives, simulation |
| **v6** | **Universal semantic platform — traits describe everything, not just spatial** |

---

*This document is the ground truth for HoloScript's identity. When in doubt, read this first.*
