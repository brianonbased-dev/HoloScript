# uAA2++ Protocol

**Package**: `@holoscript/agent-protocol`

The Universal Autonomous Agent (uAA2++) protocol is HoloScript's framework for building agents that can operate across spatial contexts — VR scenes, robotics, IoT, AR overlays, and cloud microservices — following the same **8-phase** lifecycle (seven cognition/planning phases plus **IMPLEMENT**, the delivery phase).

---

## Core Concepts

### AgentManifest

Every agent declares its capabilities in a manifest:

```ts
import { AgentManifest } from '@holoscript/agent-protocol';

const manifest: AgentManifest = {
  id: 'patrol-agent-v2',
  version: '2.0.0',
  capabilities: ['pathfinding', 'llm_reasoning', 'spatial_audio'],
  spatial: {
    perceptionRadius: 15,
    preferredLayer: 'real-time',
  },
  protocol: 'uaa2++',
  lifecycle: 'eight-phase',
};
```

### CapabilityMatcher

Finds compatible agents for cross-agent collaboration:

```ts
import { CapabilityMatcher } from '@holoscript/agent-protocol';

const matcher = new CapabilityMatcher(registry);
const partners = await matcher.findCompatible({
  required: ['pathfinding', 'nav_mesh'],
  optional: ['llm_reasoning'],
  layer: 'a2a',
});
```

### AgentRegistry

Central registry of all active agents in a scene:

```ts
import { AgentRegistry } from '@holoscript/agent-protocol';

const registry = new AgentRegistry();
registry.register(patrolAgent);
registry.register(merchantAgent);

// Query by capability
const llmAgents = registry.findByCapability('llm_reasoning');

// Spatial query — agents within 20 units
const nearby = registry.findNearby(position, 20);
```

### CrossRealityHandoff

Migrate an agent's state and control from one spatial context to another:

```ts
import { CrossRealityHandoff } from '@holoscript/agent-protocol';

const handoff = new CrossRealityHandoff();

// Hand off a VR agent to an AR context
await handoff.transfer(agent, {
  from: 'vr-scene:lobby',
  to: 'ar-overlay:mobile',
  strategy: 'state-preserving',
  fallback: 're-initialize',
});
```

---

## 8-Phase Lifecycle API

```ts
import { BaseAgent, Phase } from '@holoscript/agent-protocol';

class MyAgent extends BaseAgent {
  async [Phase.Initialize](ctx: SceneContext) {
    await this.claimRegion(ctx.sector);
    await this.loadCapabilities(['pathfinding', 'spatial_audio']);
  }

  async [Phase.Perceive](scene: Scene) {
    this.state.observations = await scene.queryNearby(this.perceptionRadius);
    this.state.threats = this.state.observations.filter((o) => o.type === 'threat');
  }

  async [Phase.Reason](observations: Observation[]) {
    if (this.state.threats.length > 0) {
      this.intent = { type: 'flee', target: this.nearestExit };
    } else {
      this.intent = { type: 'patrol', waypoints: this.patrolRoute };
    }
  }

  async [Phase.Plan](intent: Intent) {
    return this.planner.buildPlan(intent, {
      maxSteps: 10,
      rollbackOnFailure: true,
    });
  }

  async [Phase.Execute](plan: Plan) {
    for (const step of plan.steps) {
      await step.run(this);
    }
  }

  async [Phase.Evaluate](outcome: Outcome) {
    this.telemetry.record({
      phase: 'evaluate',
      success: outcome.achieved,
      deviation: outcome.deviation,
    });
  }

  async [Phase.Adapt](evaluation: Evaluation) {
    if (!evaluation.success) {
      await this.updatePriors(evaluation.failure_reason);
    }
  }

  /** Phase 8 — land working change: tests, merge/commit, deploy artifact when applicable. */
  async [Phase.Implement](ctx: SceneContext) {
    await this.deliver(ctx);
  }
}
```

### Phase 8 — IMPLEMENT

`Phase.Implement` is where **reasoning becomes shipped reality**: merged code (or authored asset), passing tests/CI, and—when the task requires it—a deployment or publish step. Research-only passes may record a **decision log** instead of a PR. This phase is intentionally separate from `Evaluate` / `Adapt` so teams do not confuse “we analyzed it” with “users can run it.”

**Note:** `@holoscript/agent-protocol` also exposes `ProtocolPhase` (INTAKE → … → AUTONOMIZE) for **meta** compounding workflows. The 8-step **agent lifecycle** above is orthogonal—use both when an agent both *thinks* in the seven cognitive phases and *ships* in IMPLEMENT.

---

## 3-Layer Communication

### Layer 1: Real-Time Mesh

Low-latency spatial events using WebSocket + CRDT:

```ts
import { SpatialMesh } from '@holoscript/agent-protocol';

const mesh = new SpatialMesh({ transport: 'websocket' });

// Broadcast a spatial event
mesh.emit('object.grabbed', { agentId: this.id, objectId });

// Subscribe to nearby events
mesh.onNearby('object.*', this.position, 10, handler);
```

### Layer 2: A2A Protocol

Cross-organization agent communication following Google's A2A spec. Agents advertise themselves as "Agent Cards" — structured JSON that other agents can discover and invoke.

See also: [A2A Compiler](../compilers/a2a)

```ts
import { A2AAdapter } from '@holoscript/agent-protocol';

const a2a = new A2AAdapter(manifest);
await a2a.advertise(); // publishes /.well-known/agent.json

// Discover and invoke a remote agent
const remoteAgent = await a2a.discover('https://partner.example/.well-known/agent.json');
await remoteAgent.invoke('analyze_scene', { sceneId });
```

### Layer 3: MCP Tools

Long-context AI assistant access. Exposes agent capabilities as MCP tools for Claude, Cursor, and similar assistants.

```ts
import { MCPToolAdapter } from '@holoscript/agent-protocol';

const mcp = new MCPToolAdapter(agent, {
  toolPrefix: 'patrol_agent',
  expose: ['patrol_sector', 'report_threat', 'get_status'],
});

// Agents auto-appear in MCP tool list when started
await mcp.listen({ port: 3456 });
```

---

## Spatial Ownership

Agents can claim exclusive or shared ownership of objects:

```ts
// Exclusive claim — only this agent can modify
await agent.claim(objectId, { mode: 'exclusive', ttl: 30_000 });

// Shared claim — multiple agents can read, one writes
await agent.claim(objectId, { mode: 'shared-write', priority: 10 });

// Release
await agent.release(objectId);
```

---

## Installation

```bash
pnpm add @holoscript/agent-protocol
```

```ts
import {
  BaseAgent,
  AgentManifest,
  AgentRegistry,
  CapabilityMatcher,
  CrossRealityHandoff,
  SpatialMesh,
  A2AAdapter,
  Phase,
} from '@holoscript/agent-protocol';
```

---

## Related

- [Agent Framework Overview](./index)
- [UAAL VM](./uaal-vm)
- [A2A Compiler](../compilers/a2a)
- [AI Behavior Traits](../traits/ai-behavior)
