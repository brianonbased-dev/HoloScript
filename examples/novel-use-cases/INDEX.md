# Novel Use Cases — HoloScript v5.0 Autonomous Ecosystems

13 self-contained compositions demonstrating the full v5 stack:
migrating agents, in-scene economies, FeedbackLoop self-optimization,
cultural traits, TenantTrait compliance, post-quantum crypto, and
whitepaper-grounded executable semantics.

Each use case is implemented in **4 formats** for full coverage:

| Format         | Purpose                                         | Location                                   |
| -------------- | ----------------------------------------------- | ------------------------------------------ |
| `.holo`        | Declarative scene compositions                  | `examples/novel-use-cases/`                |
| `.hsplus`      | Behavioral contracts (modules + state machines) | `examples/novel-use-cases/`                |
| `.hs`          | Procedural pipelines (connect wiring)           | `examples/novel-use-cases/`                |
| `.scenario.ts` | Living-spec vitest tests                        | `packages/studio/src/__tests__/scenarios/` |

## Format Coverage Matrix

| #   | Use Case                  | `.holo` | `.hsplus` | `.hs` | `.scenario.ts` |
| --- | ------------------------- | :-----: | :-------: | :---: | :------------: |
| 01  | Quantum Materials Arena   |   ✅    |    ✅     |  ✅   |       ✅       |
| 02  | Sci-Fi Future Vision      |   ✅    |    ✅     |  ✅   |       ✅       |
| 03  | Water Scarcity Swarm      |   ✅    |    ✅     |  ✅   |       ✅       |
| 04  | Ethical AI Sandbox        |   ✅    |    ✅     |  ✅   |       ✅       |
| 05  | Robot Training Metaverse  |   ✅    |    ✅     |  ✅   |       ✅       |
| 06  | Neurodiverse Therapy      |   ✅    |    ✅     |  ✅   |       ✅       |
| 07  | Wildfire Response Swarm   |   ✅    |    ✅     |  ✅   |       ✅       |
| 08  | Healthspan Twin           |   ✅    |    ✅     |  ✅   |       ✅       |
| 09  | Sci-Fi Co-Creation        |   ✅    |    ✅     |  ✅   |       ✅       |
| 10  | Urban Planning Governance |   ✅    |    ✅     |  ✅   |       ✅       |
| 11  | Sensory Therapy Worlds    |   ✅    |    ✅     |  ✅   |       ✅       |
| 12  | Heritage Revival Museum   |   ✅    |    ✅     |  ✅   |       ✅       |
| 13  | Disaster Robotics Swarm   |   ✅    |    ✅     |  ✅   |       ✅       |

**52 total files** across 4 formats.

## v5 Trait Coverage

| Trait                | Files Using It                                 |
| -------------------- | ---------------------------------------------- |
| `agent_portal`       | 01, 02, 03, 05, 06, 07, 08, 09, 10, 11, 12, 13 |
| `economy`            | All 13                                         |
| `feedback_loop`      | All 13                                         |
| `cultural_profile`   | 02, 03, 04, 06, 07, 08, 09, 11, 12             |
| `cultural_memory`    | 04, 09, 12                                     |
| `norm_compliant`     | 04, 10                                         |
| `tenant` (RBAC)      | 04, 06, 08, 10, 11                             |
| `post_quantum_audit` | 01, 03, 07                                     |
| `digital_twin`       | 01, 03, 05, 07, 13                             |
| `ROS2Bridge`         | 01, 03, 05, 07, 13                             |

## Format Descriptions

### `.holo` — Declarative Composition

Declares **WHAT** exists: entities, templates, panels, environment, spatial groups. Uses `composition`, `entity`, `template`, `panel` blocks with trait annotations.

### `.hsplus` — Behavioral Contracts

Defines **HOW** things behave: `module` with `exports`, `@state_machine` with guarded transitions, `@on_event` reactive handlers. Each file contains 1-3 modules and 1-2 agent types.

### `.hs` — Procedural Pipelines

Expresses sequential **PROCESS** flow: `object` stages with `function` blocks, `connect A.event -> B.fn` wiring between stages, `execute fn() every Nms` periodic execution.

### `.scenario.ts` — Living-Spec Tests

Vitest test files with typed pure-function domain utilities. Each test includes a **persona** (who uses it) and a mix of `it()` (passing features) and `it.todo()` (backlog items).

## Running an Example

```bash
# Compile any .holo to a target
holoc examples/novel-use-cases/01-quantum-materials-arena.holo --target r3f

# Run scenario tests
npx vitest run packages/studio/src/__tests__/scenarios/quantum-materials.scenario.ts

# Run integration tests
npx vitest run packages/core/src/__tests__/novel-use-case-integration.test.ts
```
