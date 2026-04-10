# HoloScript Agent API Reference

## v5.0.0 - Autonomous Ecosystems

This document covers the public APIs for multi-agent orchestration, enterprise multi-tenancy, agent federation, and autonomous compute economies.

> **Note:** v5.0.0 adds new APIs for AgentPortal, EconomyPrimitives, FeedbackLoop, and 7 enterprise traits. See [CHANGELOG.md](../CHANGELOG.md) for full details.

---

## Table of Contents

1. [Agent Registry](#agent-registry)
2. [Choreography Engine](#choreography-engine)
3. [Negotiation Protocol](#negotiation-protocol)
4. [Spatial Context](#spatial-context)
5. [Consensus Mechanisms](#consensus-mechanisms)
6. [Agent Communication](#agent-communication)
7. [Hierarchy & Delegation](#hierarchy--delegation)
8. [Debug & Telemetry](#debug--telemetry)
9. [Extension Interfaces](#extension-interfaces)

---

## Agent Registry

### `AgentRegistry`

Central registry for agent discovery and lifecycle management.

```typescript
import { AgentRegistry } from '@holoscript/core/agents';

const registry = new AgentRegistry({
  heartbeatInterval: 30000, // ms
  ttl: 60000, // ms before agent considered offline
  discoveryMode: 'broadcast' | 'central',
});
```

#### Methods

| Method                                                                                  | Description                     |
| --------------------------------------------------------------------------------------- | ------------------------------- |
| `register(manifest: AgentManifest): Promise<void>`                                      | Register an agent               |
| `discover(query: CapabilityQuery, options?: DiscoverOptions): Promise<AgentManifest[]>` | Find agents by capability       |
| `discoverNearby(location: AgentLocation, radius: number): Promise<AgentManifest[]>`     | Find spatially-proximate agents |
| `heartbeat(agentId: string): Promise<void>`                                             | Report agent is alive           |
| `deregister(agentId: string): Promise<void>`                                            | Remove agent from registry      |
| `getAgent(agentId: string): AgentManifest \| undefined`                                 | Get specific agent              |
| `shutdown(): void`                                                                      | Stop registry                   |

#### AgentManifest

```typescript
interface AgentManifest {
  id: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
  endpoints: AgentEndpoint[];
  trustLevel: 'local' | 'verified' | 'external';
  spatialBounds?: BoundingBox;
  metadata?: Record<string, unknown>;
}
```

#### AgentCapability

```typescript
interface AgentCapability {
  type: string; // 'analyze', 'render', 'generate', etc.
  domain: string; // 'vision', 'nlp', 'spatial', etc.
  latency?: 'fast' | 'medium' | 'slow';
  cost?: ResourceCost;
}
```

---

## Choreography Engine

### `ChoreographyEngine`

Executes multi-step agent workflows with HITL support.

```typescript
import {
  ChoreographyEngine,
  ChoreographyPlanner,
  StepExecutor,
} from '@holoscript/core/choreography';

const planner = new ChoreographyPlanner();
const executor = new StepExecutor();
const engine = new ChoreographyEngine(planner, executor);
```

#### Methods

| Method                                                               | Description          |
| -------------------------------------------------------------------- | -------------------- |
| `execute(choreography: Choreography): Promise<ChoreographyResult>`   | Run choreography     |
| `getStatus(choreographyId: string): ChoreographyStatus \| undefined` | Get execution status |
| `pause(choreographyId: string): void`                                | Pause execution      |
| `resume(choreographyId: string): void`                               | Resume execution     |
| `cancel(choreographyId: string): void`                               | Cancel execution     |

#### Choreography

```typescript
interface Choreography {
  id: string;
  name: string;
  steps: ChoreographyStep[];
  timeout?: number;
  onError?: 'abort' | 'skip' | 'retry';
}

interface ChoreographyStep {
  id: string;
  type: 'action' | 'hitl' | 'parallel' | 'conditional';
  agentId: string;
  action: string;
  params: Record<string, unknown>;
  dependsOn?: string[];
  onApproval?: () => Promise<{ approved: boolean; reason?: string }>;
}
```

#### ChoreographyResult

```typescript
interface ChoreographyResult {
  choreographyId: string;
  status: 'completed' | 'failed' | 'rejected' | 'cancelled';
  completedSteps: string[];
  failedStep?: string;
  rejection?: { stepId: string; reason: string };
  duration: number;
  outputs: Record<string, unknown>;
}
```

---

## Negotiation Protocol

### `NegotiationProtocol`

Multi-agent negotiation with proposals, voting, and resolution.

```typescript
import { NegotiationProtocol, VotingMechanisms } from '@holoscript/core/negotiation';

const protocol = new NegotiationProtocol({
  defaultTimeout: 30000,
  votingMechanism: 'majority' | 'unanimous' | 'weighted',
});
```

#### Methods

| Method                                                                                                               | Description         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `createSession(topic: string, participants: NegotiationParticipant[], options?: SessionOptions): NegotiationSession` | Start negotiation   |
| `propose(sessionId: string, agentId: string, proposal: unknown): string`                                             | Submit proposal     |
| `vote(sessionId: string, agentId: string, proposalId: string, vote: 'accept' \| 'reject' \| 'abstain'): void`        | Cast vote           |
| `resolve(sessionId: string): Promise<NegotiationResult>`                                                             | Resolve negotiation |

#### SessionOptions

```typescript
interface SessionOptions {
  timeout: number;
  tieBreaker?: 'random' | 'first' | 'senior';
  fallback?: { action: string; params: Record<string, unknown> };
}
```

---

## Spatial Context

### `SpatialContextProvider`

Provides spatial awareness for agents.

```typescript
import { SpatialContextProvider, ProximityCalculator } from '@holoscript/core/spatial';

const provider = new SpatialContextProvider({ updateRate: 30 }); // 30 Hz
const proximity = new ProximityCalculator();
```

#### Methods

| Method                                                              | Description             |
| ------------------------------------------------------------------- | ----------------------- |
| `start(): void`                                                     | Start providing updates |
| `stop(): void`                                                      | Stop updates            |
| `onUpdate(callback: (context: SpatialContext) => void): () => void` | Subscribe to updates    |
| `getContext(): SpatialContext`                                      | Get current context     |

#### ProximityCalculator Methods

| Method                                                                         | Description        |
| ------------------------------------------------------------------------------ | ------------------ |
| `distance(a: AgentLocation, b: AgentLocation): number`                         | Calculate distance |
| `inRange(a: AgentLocation, b: AgentLocation, range: number): boolean`          | Check if in range  |
| `findNearest(from: AgentLocation, candidates: AgentLocation[]): AgentLocation` | Find nearest       |

---

## Consensus Mechanisms

### `ConsensusMechanisms`

Byzantine-fault-tolerant consensus for agent decisions.

```typescript
import { ConsensusMechanisms } from '@holoscript/core/consensus';

const consensus = new ConsensusMechanisms();
```

#### Methods

| Method                                                                | Description           |
| --------------------------------------------------------------------- | --------------------- |
| `createSession(config: ConsensusConfig): ConsensusSession`            | Start consensus round |
| `vote(sessionId: string, agentId: string, vote: ConsensusVote): void` | Cast vote             |
| `resolve(sessionId: string): Promise<ConsensusResult>`                | Resolve consensus     |

#### ConsensusConfig

```typescript
interface ConsensusConfig {
  id: string;
  topic: string;
  participants: string[];
  threshold: number; // 0-1, e.g., 0.67 for 2/3 majority
  timeout: number;
  algorithm?: 'simple-majority' | 'pbft' | 'raft';
}
```

---

## Agent Communication

### `AgentChannelManager`

Manages communication channels between agents.

```typescript
import { AgentChannelManager } from '@holoscript/core/communication';

const channels = new AgentChannelManager();
```

#### Methods

| Method                                                        | Description    |
| ------------------------------------------------------------- | -------------- |
| `createChannel(config: ChannelConfig): AgentChannel`          | Create channel |
| `getChannel(channelId: string): AgentChannel \| undefined`    | Get channel    |
| `join(channelId: string, agentId: string): void`              | Join channel   |
| `leave(channelId: string, agentId: string): void`             | Leave channel  |
| `send(channelId: string, message: ChannelMessage): void`      | Send message   |
| `broadcast(channelId: string, message: ChannelMessage): void` | Broadcast      |

#### ChannelConfig

```typescript
interface ChannelConfig {
  id: string;
  type: 'direct' | 'broadcast' | 'topic';
  encryption?: boolean;
  persistent?: boolean;
  maxMembers?: number;
}
```

---

## Hierarchy & Delegation

### `HierarchyManager`

Manages agent hierarchies and delegation rules.

```typescript
import { HierarchyManager, DelegationEngine } from '@holoscript/core/hierarchy';

const hierarchy = new HierarchyManager();
const delegation = new DelegationEngine();
```

#### HierarchyManager Methods

| Method                                                                                   | Description          |
| ---------------------------------------------------------------------------------------- | -------------------- |
| `createHierarchy(config: HierarchyConfig): AgentHierarchy`                               | Create hierarchy     |
| `addSubordinate(hierarchyId: string, supervisorId: string, subordinateId: string): void` | Add subordinate      |
| `removeSubordinate(hierarchyId: string, subordinateId: string): void`                    | Remove subordinate   |
| `addDelegationRule(hierarchyId: string, rule: DelegationRule): void`                     | Add delegation rule  |
| `getEscalationPath(hierarchyId: string, agentId: string): string[]`                      | Get escalation chain |

#### DelegationEngine Methods

| Method                                                                                     | Description    |
| ------------------------------------------------------------------------------------------ | -------------- |
| `delegate(task: DelegatedTaskInput): DelegatedTask`                                        | Delegate task  |
| `startTask(taskId: string): void`                                                          | Start task     |
| `completeTask(taskId: string, result: unknown): void`                                      | Complete task  |
| `failTask(taskId: string, error: string): void`                                            | Fail task      |
| `escalateTask(taskId: string, reason: string): void`                                       | Escalate task  |
| `createSubtask(parentTaskId: string, subtask: Partial<DelegatedTaskInput>): DelegatedTask` | Create subtask |

---

## Debug & Telemetry

### `AgentDebugger`

Debug sessions, breakpoints, and replay.

```typescript
import { AgentDebugger, TelemetryCollector, AgentInspector } from '@holoscript/core/debug';

const telemetry = new TelemetryCollector({ bufferSize: 10000 });
const inspector = new AgentInspector();
const debugger = new AgentDebugger(telemetry, inspector);
```

#### AgentDebugger Methods

| Method                                                                     | Description            |
| -------------------------------------------------------------------------- | ---------------------- |
| `startSession(agentId: string, options?: SessionOptions): string`          | Start debug session    |
| `stopSession(sessionId: string): SessionRecording`                         | Stop and get recording |
| `setBreakpoint(config: BreakpointConfig): string`                          | Set breakpoint         |
| `removeBreakpoint(breakpointId: string): void`                             | Remove breakpoint      |
| `replay(sessionId: string, callback: (event: any) => void): Promise<void>` | Replay session         |
| `getBreakpointHits(breakpointId: string): BreakpointHit[]`                 | Get breakpoint hits    |

#### TelemetryCollector Methods

| Method                                                       | Description                 |
| ------------------------------------------------------------ | --------------------------- |
| `record(event: TelemetryEvent): void`                        | Record event                |
| `recordError(agentId: string, error: Error): void`           | Record error                |
| `startSpan(name: string, context?: TraceContext): TraceSpan` | Start trace span            |
| `endSpan(spanId: string): void`                              | End trace span              |
| `getEvents(filter?: EventFilter): TelemetryEvent[]`          | Get recorded events         |
| `exportToOTel(): OTelExport`                                 | Export OpenTelemetry format |

---

## Extension Interfaces

HoloScript provides interfaces for building advanced agent features:

### Actor Model

```typescript
import type {
  IAgentRef,
  IAgentMailbox,
  IWakeOnDemandController,
} from '@holoscript/core/extensions';
import { BaseAgentRef, BaseMailbox } from '@holoscript/core/extensions';
```

### Self-Healing

```typescript
import type { ISelfHealingService, IRecoveryStrategy } from '@holoscript/core/extensions';
import { BaseRecoveryStrategy, RetryRecoveryStrategy } from '@holoscript/core/extensions';
```

### Marketplace

```typescript
import type {
  IMarketplaceService,
  IHandoffRequest,
  IHandoffBid,
} from '@holoscript/core/extensions';
```

### Collective Intelligence

```typescript
import type { ICollectiveIntelligenceService, IHiveSession } from '@holoscript/core/extensions';
```

### Swarm Coordination

```typescript
import type { ISwarmCoordinator, ILeaderElection } from '@holoscript/core/extensions';
```

See [Extension Interfaces Guide](./EXTENSION_INTERFACES.md) for implementation details.

---

## TypeScript Setup

```typescript
// package.json
{
  "dependencies": {
    "@holoscript/core": "^3.1.0"
  }
}

// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

---

## Examples

### Basic Agent Registration & Discovery

```typescript
import { AgentRegistry } from '@holoscript/core/agents';

const registry = new AgentRegistry();

// Register
await registry.register({
  id: 'my-vision-agent',
  name: 'Vision Analyzer',
  version: '1.0.0',
  capabilities: [{ type: 'analyze', domain: 'vision' }],
  endpoints: [{ type: 'http', url: 'http://localhost:3000' }],
  trustLevel: 'local',
});

// Discover
const visionAgents = await registry.discover({ domain: 'vision' });
```

### Choreography with HITL

```typescript
import {
  ChoreographyEngine,
  ChoreographyPlanner,
  StepExecutor,
} from '@holoscript/core/choreography';

const engine = new ChoreographyEngine(new ChoreographyPlanner(), new StepExecutor());

const result = await engine.execute({
  id: 'review-workflow',
  name: 'Document Review',
  steps: [
    { id: 'analyze', type: 'action', agentId: 'nlp', action: 'analyze', params: {} },
    {
      id: 'approve',
      type: 'hitl',
      agentId: 'human',
      action: 'review',
      params: {},
      onApproval: async () => ({ approved: true }),
    },
    {
      id: 'publish',
      type: 'action',
      agentId: 'publisher',
      action: 'publish',
      params: {},
      dependsOn: ['approve'],
    },
  ],
});
```

---

**Version:** 3.1.0  
**Last Updated:** February 2026
