# Agent Sovereignty & AI-Native OS

## Overview

HoloScript is the world's first **AI-Native Spatial Operating System**, built from the ground up to host autonomous intelligence. At its core is the **uAA2++ (Universal Autonomous Agent) protocol**, which provides agents with cognitive, perceptual, and economic sovereignty. Agents are not just NPCs; they are first-class citizens that can perceive scenes, communicate across realities, claim ownership of objects, and trade autonomously.

```text
┌─────────────────────────────────────────────────────────┐
│              uAA2++ Agent Ecosystem                      │
│                                                          │
│  @holoscript/agent-protocol  ← 7-phase lifecycle         │
│  @holoscript/uaal            ← bytecode VM runtime       │
│  @holoscript/crdt            ← conflict-free shared state│
│                                                          │
│  Compiler targets:                                       │
│  A2AAgentCardCompiler  ← Google A2A protocol             │
│  NeuromorphicCompiler  ← NIR/Loihi2 hardware             │
│  SCMCompiler           ← Structural Causal Models        │
└─────────────────────────────────────────────────────────┘
```

---

## uAA2++ 8-Phase Protocol

Every HoloScript agent follows the canonical 8-phase cognitive lifecycle (0-7):

| Phase | Name | Purpose |
| ----- | ---- | ------- |
| 0 | **INTAKE** | Gather raw spatial data and context |
| 1 | **REFLECT** | Analyze and understand the environment |
| 2 | **EXECUTE** | Take action (move, speak, trade) |
| 3 | **COMPRESS** | Store knowledge efficiently (PWG format) |
| 4 | **REINTAKE** | Re-evaluate with compressed knowledge |
| 5 | **GROW** | Learn new patterns, wisdom, and gotchas |
| 6 | **EVOLVE** | Adapt and optimize internal models |
| 7 | **AUTONOMIZE** | Self-directed goal synthesis |

```hs
composition "AutonomousAgent" {
  template "PatrolAgent" {
    @npc
    @pathfinding
    @llm_agent
    @reactive

    state {
      phase: "perceive"
      goal: "patrol_sector_7"
    }

    action perceive(scene) {
      this.observations = scene.query_nearby(10)
    }

    action reason(observations) {
      // LLM reasoning step
    }

    action execute(plan) {
      player.moveTo(plan.next_waypoint)
    }
  }
}
```

---

## 3-Layer Spatial Communication

Agents communicate through three stacked layers:

```text
Layer 3: MCP Tools        ← long-context AI agent access (Claude, Cursor)
Layer 2: A2A Protocol     ← cross-org agent-to-agent (Google A2A)
Layer 1: Real-Time Mesh   ← low-latency spatial events (WebSocket / CRDT)
```

Located in: `agents/spatial-comms/`

Each layer is independent and composable. A Loihi2 neuromorphic agent running on-device can still participate in Layer 2 A2A coordination through an adapter.

---

## Key Packages

| Package | Purpose |
| ------- | ------- |
| [`@holoscript/agent-protocol`](./uaa2-protocol) | 7-phase lifecycle, AgentManifest, CapabilityMatcher, CrossRealityHandoff |
| [`@holoscript/uaal`](./uaal-vm) | Universal Autonomous Agent Language VM — bytecode execution |
| `@holoscript/crdt` | Conflict-free replicated spatial state for distributed scenes |
| `@holoscript/llm-provider` | Unified LLM SDK (OpenAI / Anthropic / Gemini) |

---

## Compiler Targets for Agents

| Compiler | Output | Use Case |
| -------- | ------ | -------- |
| [A2A Agent Cards](../compilers/a2a) | JSON agent cards | Cross-org agent discovery (Google A2A protocol) |
| [Neuromorphic (NIR)](../compilers/neuromorphic) | NIR bytecode for Loihi2/SpiNNaker | Ultra-low-energy on-device agents |
| [SCM](../compilers/scm) | Structural Causal Models | Causally-aware reasoning agents |
| [WASM](../compilers/wasm) | WebAssembly modules | Edge-deployed lightweight agents |

---

## Quickstart: Your First Agent

```hsplus
composition "HelloAgent" {
  template "GreeterAgent" {
    @llm_agent
    @reactive
    @spatial_audio

    state {
      greeting: "Hello, spatial world!"
    }

    onHoverEnter: {
      audio.speak(this.greeting)
      this.phase = "greeted"
    }
  }

  object "Greeter" using "GreeterAgent" {
    position: [0, 1.5, -2]
  }
}
```

Compile to A2A agent card:

```bash
holo compile hello-agent.hsplus --target a2a --out ./agents/
```

---

## Related Docs

- [uAA2++ Protocol Reference](./uaa2-protocol)
- [UAAL VM](./uaal-vm)
- [A2A Compiler](../compilers/a2a)
- [Neuromorphic Compiler](../compilers/neuromorphic)
- [AI Behavior Traits](../traits/ai-behavior)
- [Studio-First Agent Doctrine](./studio-first-agents)
