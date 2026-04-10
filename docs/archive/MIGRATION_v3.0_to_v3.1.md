# Migration Guide: v3.3.0 → v3.4.0

This guide covers migrating from HoloScript v3.3.0.x to v3.4.0 (Agentic Choreography).

---

## Overview

v3.4.0 introduces the **Agentic Choreography** system - a comprehensive multi-agent orchestration framework. This release is **backward compatible** with v3.3.0, with new features being additive.

### What's New

| Feature                | Description                               |
| ---------------------- | ----------------------------------------- |
| Agent Registry         | Centralized agent discovery and lifecycle |
| Choreography Engine    | Multi-step agent workflows with HITL      |
| Negotiation Protocol   | Multi-agent decision making               |
| Spatial Context        | Location-aware agent coordination         |
| Consensus Mechanisms   | Byzantine-fault-tolerant voting           |
| Agent Channels         | Secure inter-agent messaging              |
| Hierarchy & Delegation | Organizational agent structures           |
| Debug & Telemetry      | Session recording, breakpoints, tracing   |
| Extension Interfaces   | Extensibility points for consumers        |

---

## Breaking Changes

**None.** v3.4.0 is fully backward compatible with v3.3.0.

---

## Deprecations

### HITLTrait Direct Usage

The standalone `HITLTrait` from v3.3.0 continues to work but is now better used through the Choreography Engine for complex workflows.

**v3.3.0 (still works):**

```typescript
import { HITLTrait } from '@holoscript/core/traits';

const trait = new HITLTrait();
await trait.requestApproval({ ... });
```

**v3.4.0 (recommended for workflows):**

```typescript
import { ChoreographyEngine } from '@holoscript/core/choreography';

await engine.execute({
  steps: [{ type: 'hitl', action: 'approve', onApproval: async () => ({ approved: true }) }],
});
```

---

## New Dependencies

No new external dependencies required. All agent features are built into `@holoscript/core`.

---

## Migration Steps

### Step 1: Update Package

```bash
npm install @holoscript/core@^3.1.0
# or
pnpm add @holoscript/core@^3.1.0
```

### Step 2: (Optional) Adopt Agent Registry

If you have custom agent discovery, consider migrating to the unified registry:

**Before (custom discovery):**

```typescript
// Custom agent tracking
const agents = new Map<string, AgentInfo>();

function registerAgent(info: AgentInfo) {
  agents.set(info.id, info);
}

function findAgentsByCapability(cap: string) {
  return Array.from(agents.values()).filter((a) => a.capabilities.includes(cap));
}
```

**After (AgentRegistry):**

```typescript
import { AgentRegistry } from '@holoscript/core/agents';

const registry = new AgentRegistry();

await registry.register({
  id: 'my-agent',
  name: 'My Agent',
  version: '1.0.0',
  capabilities: [{ type: 'analyze', domain: 'vision' }],
  endpoints: [],
  trustLevel: 'local',
});

const agents = await registry.discover({ domain: 'vision' });
```

### Step 3: (Optional) Add Choreography for Workflows

If you have sequential agent tasks, wrap them in choreography:

**Before (manual sequencing):**

```typescript
async function runPipeline() {
  const result1 = await agent1.execute(input);

  // Manual HITL check
  const approved = await promptUser('Approve?');
  if (!approved) return;

  const result2 = await agent2.execute(result1);
}
```

**After (ChoreographyEngine):**

```typescript
import {
  ChoreographyEngine,
  ChoreographyPlanner,
  StepExecutor,
} from '@holoscript/core/choreography';

const engine = new ChoreographyEngine(new ChoreographyPlanner(), new StepExecutor());

await engine.execute({
  id: 'my-pipeline',
  name: 'Pipeline',
  steps: [
    { id: 'step1', type: 'action', agentId: 'agent1', action: 'execute', params: { input } },
    {
      id: 'approve',
      type: 'hitl',
      agentId: 'human',
      action: 'approve',
      params: {},
      onApproval: async () => {
        const approved = await promptUser('Approve?');
        return { approved };
      },
    },
    {
      id: 'step2',
      type: 'action',
      agentId: 'agent2',
      action: 'execute',
      params: {},
      dependsOn: ['approve'],
    },
  ],
});
```

### Step 4: (Optional) Add Telemetry

For debugging and monitoring:

```typescript
import { TelemetryCollector, AgentDebugger, AgentInspector } from '@holoscript/core/debug';

const telemetry = new TelemetryCollector({ bufferSize: 10000 });
const inspector = new AgentInspector();
const debugger = new AgentDebugger(telemetry, inspector);

// Record events
telemetry.record({
  type: 'agent_action',
  agentId: 'my-agent',
  timestamp: Date.now(),
  data: { action: 'analyze' }
});

// Start debug session
const sessionId = debugger.startSession('my-agent', { recording: true });

// ... run agent ...

// Get recording
const recording = debugger.stopSession(sessionId);
```

---

## Type Updates

### New Imports

```typescript
// Agent system
import { AgentRegistry, AgentManifest, AgentCapability } from '@holoscript/core/agents';

// Choreography
import { ChoreographyEngine, Choreography, ChoreographyStep } from '@holoscript/core/choreography';

// Negotiation
import { NegotiationProtocol, NegotiationSession } from '@holoscript/core/negotiation';

// Spatial
import { SpatialContextProvider, ProximityCalculator } from '@holoscript/core/spatial';

// Consensus
import { ConsensusMechanisms, ConsensusSession } from '@holoscript/core/consensus';

// Communication
import { AgentChannelManager, AgentChannel } from '@holoscript/core/communication';

// Hierarchy
import { HierarchyManager, DelegationEngine } from '@holoscript/core/hierarchy';

// Debug
import { AgentDebugger, TelemetryCollector, AgentInspector } from '@holoscript/core/debug';

// Extensions (interfaces for consumers)
import type {
  IAgentRef,
  ISelfHealingService,
  IMarketplaceService,
} from '@holoscript/core/extensions';
```

---

## Testing Updates

### New Test Utilities

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from '@holoscript/core/agents';

describe('My Agent Tests', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry({ heartbeatInterval: 100 });
  });

  afterEach(() => {
    registry.shutdown(); // Clean up
  });

  it('should register and discover', async () => {
    await registry.register({
      /* ... */
    });
    const found = await registry.discover({ domain: 'vision' });
    expect(found).toHaveLength(1);
  });
});
```

---

## Configuration Changes

### New Environment Variables (Optional)

```bash
# Agent registry settings
HOLOSCRIPT_AGENT_HEARTBEAT_MS=30000
HOLOSCRIPT_AGENT_TTL_MS=60000
HOLOSCRIPT_DISCOVERY_MODE=broadcast

# Telemetry settings
HOLOSCRIPT_TELEMETRY_ENABLED=true
HOLOSCRIPT_TELEMETRY_BUFFER_SIZE=10000
HOLOSCRIPT_OTEL_ENDPOINT=http://localhost:4317
```

---

## Performance Considerations

### Agent Registry

- Default heartbeat interval: 30s (configurable)
- Discovery queries are O(n) where n = registered agents
- For large deployments (1000+ agents), consider:
  - Capability indexing (automatic)
  - Spatial partitioning for `discoverNearby()`

### Choreography

- Step execution is sequential for dependent steps
- Independent steps can run in parallel (future optimization)
- HITL steps block until approval received

### Telemetry

- Events buffered in memory (default: 10,000 events)
- Enable sampling for high-throughput: `{ sampleRate: 0.1 }`
- Export to OpenTelemetry for production monitoring

---

## Rollback Plan

If issues occur, rollback is simple:

```bash
npm install @holoscript/core@^3.0.0
```

All v3.3.0 code continues to work. Remove any v3.4 imports if you added them.

---

## Getting Help

- **Documentation:** [AGENT_API_REFERENCE.md](./AGENT_API_REFERENCE.md)
- **Sprint 4 Plan:** [SPRINT_4_PLAN.md](./SPRINT_4_PLAN.md)
- **Extension Guide:** [Extension Interfaces](./EXTENSION_INTERFACES.md)

---

## Changelog Summary

### v3.4.0 (February 2026)

**Added:**

- `AgentRegistry` - Centralized agent discovery
- `ChoreographyEngine` - Multi-step workflow execution
- `NegotiationProtocol` - Multi-agent negotiation
- `SpatialContextProvider` - Location-aware coordination
- `ConsensusMechanisms` - Byzantine-fault-tolerant voting
- `AgentChannelManager` - Inter-agent messaging
- `HierarchyManager` & `DelegationEngine` - Org hierarchies
- `AgentDebugger` & `TelemetryCollector` - Debug & telemetry
- Extension interfaces for consumers

**Changed:**

- None (backward compatible)

**Deprecated:**

- Direct `HITLTrait` usage (use `ChoreographyEngine` for workflows)

**Removed:**

- None

---

**Version:** 3.1.0  
**Last Updated:** February 2026
