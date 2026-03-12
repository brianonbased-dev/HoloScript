# Agent Framework

## Overview

HoloScript ships a complete autonomous agent ecosystem built on the **uAA2++ (Universal Autonomous Agent) protocol**. Agents are first-class citizens — they can perceive scenes, communicate across realities, claim ownership of objects, and coordinate with other AI systems.

```
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

## uAA2++ 7-Phase Lifecycle

Every HoloScript agent follows this lifecycle:

| Phase | Name | Description |
|-------|------|-------------|
| 1 | **Initialize** | Load scene context, register capabilities, claim spatial region |
| 2 | **Perceive** | Observe objects, events, and other agents in range |
| 3 | **Reason** | Apply LLM/rule-based logic to form intent |
| 4 | **Plan** | Generate action sequence with rollback checkpoints |
| 5 | **Execute** | Run actions (move objects, emit events, call APIs) |
| 6 | **Evaluate** | Measure outcome vs. goal, log telemetry |
| 7 | **Adapt** | Update internal model, store learned patterns |

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

```
Layer 3: MCP Tools        ← long-context AI agent access (Claude, Cursor)
Layer 2: A2A Protocol     ← cross-org agent-to-agent (Google A2A)
Layer 1: Real-Time Mesh   ← low-latency spatial events (WebSocket / CRDT)
```

Located in: `agents/spatial-comms/`

Each layer is independent and composable. A Loihi2 neuromorphic agent running on-device can still participate in Layer 2 A2A coordination through an adapter.

---

## Key Packages

| Package | Purpose |
|---------|---------|
| [`@holoscript/agent-protocol`](./uaa2-protocol) | 7-phase lifecycle, AgentManifest, CapabilityMatcher, CrossRealityHandoff |
| [`@holoscript/uaal`](./uaal-vm) | Universal Autonomous Agent Language VM — bytecode execution |
| `@holoscript/crdt` | Conflict-free replicated spatial state for distributed scenes |
| `@holoscript/llm-provider` | Unified LLM SDK (OpenAI / Anthropic / Gemini) |

---

## Compiler Targets for Agents

| Compiler | Output | Use Case |
|----------|--------|---------|
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
