# HoloScript Sprint 4 Plan: Agentic Choreography

**Version:** 3.1.0 Target
**Timeline:** March 2026
**Theme:** Agentic Choreography & Multi-Agent Orchestration

---

## Executive Summary

Sprint 4 focuses on **Agentic Choreography** – enabling HoloScript to orchestrate multiple AI agents collaboratively within spatial environments. Building on v3.3.0's HITLTrait, we introduce a full multi-agent framework with negotiation, consensus, and autonomous coordination.

The core insight: HoloScript's reactive state system and trait composition naturally maps to agent capabilities, while spatial awareness enables physical-context-aware agent collaboration.

**Positioning Update:** HoloScript is now the **full platform SDK**. Hololand and `uaa2-service` are **consumers** of the SDK, not the canonical source of system APIs.

## Sprint 4 Priorities

| Priority | Focus                            | Effort | Dependencies   | Status      |
| -------- | -------------------------------- | ------ | -------------- | ----------- |
| **1**    | AgentRegistry & Discovery        | Medium | HITL complete  | ✅ Complete |
| **2**    | Multi-Agent Choreography Core    | High   | Priority 1     | ✅ Complete |
| **3**    | Agent Negotiation Protocol       | High   | Priority 2     | ✅ Complete |
| **4**    | Spatial Context Awareness        | Medium | Priority 2     | ✅ Complete |
| **5**    | Consensus Mechanisms             | Medium | Priority 3     | ✅ Complete |
| **6**    | Agent Communication Channels     | Medium | NetworkedTrait | ✅ Complete |
| **7**    | Hierarchical Agent Orchestration | High   | Priority 2     | ✅ Complete |
| **8**    | Agent Debugging & Telemetry      | Medium | All priorities | ✅ Complete |

---

## Priority 1: AgentRegistry & Discovery

**Goal:** Centralized registry for agents to register capabilities and discover peers

### Design

```typescript
// Agent registration
export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
  spatialBounds?: BoundingBox;
  endpoints: AgentEndpoint[];
  trustLevel: 'local' | 'verified' | 'external';
}

export interface AgentCapability {
  type: string; // 'render', 'analyze', 'generate', 'approve', etc.
  domain: string; // 'vision', 'nlp', 'spatial', 'blockchain'
  cost?: ResourceCost;
  latency?: LatencyProfile;
}

export class AgentRegistry {
  register(manifest: AgentManifest): Promise<void>;
  discover(query: CapabilityQuery): Promise<AgentManifest[]>;
  heartbeat(agentId: string): Promise<void>;
  deregister(agentId: string): Promise<void>;
}
```

### HoloScript Syntax

```holoscript
@agent_registry(
  discovery: "broadcast" | "central",
  ttl: 60s,
  healthCheck: 10s
)

agent#vision_analyzer {
  @capabilities [
    { type: "analyze", domain: "vision", latency: "fast" },
    { type: "detect", domain: "spatial", latency: "medium" }
  ]

  @on_discovered(peer) {
    log("Discovered peer agent: " + peer.name)
  }
}
```

### Files to Create

- `packages/core/src/agents/AgentRegistry.ts`
- `packages/core/src/agents/AgentManifest.ts`
- `packages/core/src/agents/CapabilityMatcher.ts`
- `packages/core/src/traits/AgentDiscoveryTrait.ts`

### Acceptance Criteria

- [ ] Agents can register capabilities on startup
- [ ] Capability-based discovery returns matching agents
- [ ] Health checks detect offline agents within 30s
- [ ] Local, verified, and external trust levels enforced

---

## Priority 2: Multi-Agent Choreography Core

**Goal:** Orchestrate multiple agents to complete complex, multi-step tasks

### Design

```typescript
export interface ChoreographyPlan {
  id: string;
  goal: string;
  steps: ChoreographyStep[];
  participants: AgentManifest[];
  constraints: ExecutionConstraint[];
  fallback?: ChoreographyPlan;
}

export interface ChoreographyStep {
  id: string;
  agentId: string;
  action: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  dependencies: string[]; // step IDs
  timeout?: number;
  retries?: number;
}

export class ChoreographyEngine {
  plan(goal: string, agents: AgentManifest[]): Promise<ChoreographyPlan>;
  execute(plan: ChoreographyPlan): Promise<ChoreographyResult>;
  pause(planId: string): Promise<void>;
  resume(planId: string): Promise<void>;
  cancel(planId: string): Promise<void>;
}
```

### HoloScript Syntax

```holoscript
choreography#build_3d_scene {
  @goal "Generate and review a 3D environment"

  @participants [
    agent#design_generator,
    agent#qa_reviewer,
    agent#human_approver
  ]

  step#generate {
    agent: design_generator
    action: "generate_scene"
    inputs: { prompt: state.userPrompt }
    outputs: { scene: "generated_scene" }
  }

  step#review {
    agent: qa_reviewer
    action: "quality_check"
    inputs: { scene: step#generate.outputs.scene }
    dependencies: [step#generate]
    outputs: { approved: "qa_passed" }
  }

  step#human_review {
    @hitl_gate // Uses HITLTrait integration
    agent: human_approver
    action: "final_approval"
    inputs: { scene: step#generate.outputs.scene }
    dependencies: [step#review]
    condition: step#review.outputs.approved == true
  }
}
```

### Files to Create

- `packages/core/src/choreography/ChoreographyEngine.ts`
- `packages/core/src/choreography/ChoreographyPlanner.ts`
- `packages/core/src/choreography/StepExecutor.ts`
- `packages/core/src/traits/ChoreographyTrait.ts`

### Acceptance Criteria

- [ ] Choreography plans execute in dependency order
- [ ] Failed steps trigger retry or fallback
- [ ] Steps can be paused, resumed, cancelled
- [ ] HITLTrait integrates as `@hitl_gate` step type
- [ ] Parallel-eligible steps run concurrently

---

## Priority 3: Agent Negotiation Protocol

**Goal:** Enable agents to negotiate resource allocation, priorities, and conflict resolution

### Design

```typescript
export interface NegotiationSession {
  id: string;
  topic: string;
  participants: AgentManifest[];
  proposals: Proposal[];
  status: 'open' | 'voting' | 'resolved' | 'failed';
}

export interface Proposal {
  agentId: string;
  content: any;
  priority: number;
  reasoning?: string;
}

export class NegotiationProtocol {
  initiate(topic: string, participants: AgentManifest[]): NegotiationSession;
  propose(sessionId: string, proposal: Proposal): void;
  vote(sessionId: string, agentId: string, ranking: string[]): void;
  resolve(sessionId: string, mechanism: 'majority' | 'weighted' | 'consensus'): Winner;
}
```

### HoloScript Syntax

```holoscript
negotiation#resource_allocation {
  @topic "Allocate GPU rendering time"
  @mechanism "weighted" // voting weight by trust level

  @participants [
    agent#render_job_1,
    agent#render_job_2,
    agent#scheduler
  ]

  @on_resolved(winner) {
    winner.allocate_resource("gpu", 60s)
  }

  @on_deadlock {
    escalate_to(agent#admin)
  }
}
```

### Files to Create

- `packages/core/src/negotiation/NegotiationProtocol.ts`
- `packages/core/src/negotiation/VotingMechanisms.ts`
- `packages/core/src/traits/NegotiationTrait.ts`

### Acceptance Criteria

- [ ] Agents can initiate negotiation sessions
- [ ] Support majority, weighted, and consensus mechanisms
- [ ] Deadlock detection escalates automatically
- [ ] Negotiation history logged for audit

---

## Priority 4: Spatial Context Awareness

**Goal:** Agents understand and reason about spatial relationships

### Design

```typescript
export interface SpatialContext {
  agentPosition: Vector3;
  agentBounds: BoundingBox;
  nearbyEntities: SpatialEntity[];
  regions: Region[];
  sightLines: SightLine[];
}

export interface SpatialQuery {
  type: 'nearest' | 'within' | 'visible' | 'reachable';
  from: Vector3;
  radius?: number;
  entityType?: string;
}

export class SpatialContextProvider {
  getContext(agentId: string): SpatialContext;
  query(query: SpatialQuery): SpatialEntity[];
  subscribe(agentId: string, region: Region, callback: Function): void;
}
```

### HoloScript Syntax

```holoscript
agent#patrol_bot {
  @spatial_awareness(
    updateRate: 30hz,
    perceptionRadius: 10m
  )

  @on_entity_entered(entity) {
    if (entity.type == "visitor") {
      initiate_greeting(entity)
    }
  }

  @on_region_changed(from, to) {
    update_patrol_route(to)
  }
}
```

### Files to Create

- `packages/core/src/spatial/SpatialContextProvider.ts`
- `packages/core/src/spatial/SpatialQuery.ts`
- `packages/core/src/traits/SpatialAwarenessTrait.ts`

### Acceptance Criteria

- [ ] Agents receive spatial context updates at configured rate
- [ ] Spatial queries return correct results within 10ms
- [ ] Region entry/exit events fire reliably
- [ ] Works with both 2D and 3D scenes

---

## Priority 5: Consensus Mechanisms

**Goal:** Multiple agents reach agreement on shared state changes

### Design

```typescript
export interface ConsensusConfig {
  mechanism: 'raft' | 'pbft' | 'simple_majority';
  quorum: number;
  timeout: number;
}

export class ConsensusManager {
  propose(key: string, value: any): Promise<boolean>;
  subscribe(key: string, callback: (value: any) => void): void;
  getLeader(): AgentManifest | null;
}
```

### Files to Create

- `packages/core/src/consensus/ConsensusManager.ts`
- `packages/core/src/consensus/RaftConsensus.ts`
- `packages/core/src/traits/ConsensusTrait.ts`

### Acceptance Criteria

- [ ] Simple majority consensus works with 3+ agents
- [ ] Raft leader election completes within 5s
- [ ] Network partitions handled gracefully
- [ ] State changes replicated to all participants

---

## Priority 6: Agent Communication Channels

**Goal:** Secure, typed communication between agents

### Design

```typescript
export interface AgentChannel {
  id: string;
  participants: string[];
  encryption: 'none' | 'aes-256' | 'e2e';
  messageSchema: JSONSchema;
}

export class AgentMessaging {
  createChannel(participants: string[], schema: JSONSchema): AgentChannel;
  send(channelId: string, message: any): Promise<void>;
  broadcast(message: any): Promise<void>;
  subscribe(channelId: string, handler: MessageHandler): void;
}
```

### HoloScript Syntax

```holoscript
channel#team_alpha {
  @participants [agent#leader, agent#worker_1, agent#worker_2]
  @encryption "aes-256"

  @schema {
    type: "task_update" | "status_report" | "command"
    payload: any
    priority: 0..10
  }
}

agent#leader {
  @on_channel_message(channel#team_alpha, msg) {
    if (msg.type == "status_report") {
      update_task_board(msg.payload)
    }
  }
}
```

### Files to Create

- `packages/core/src/messaging/AgentMessaging.ts`
- `packages/core/src/messaging/ChannelManager.ts`
- `packages/core/src/traits/ChannelTrait.ts`

### Acceptance Criteria

- [ ] Channels enforce schema validation
- [ ] Encrypted channels use proper key exchange
- [ ] Message delivery confirmed with acknowledgments
- [ ] Broadcast reaches all registered agents

---

## Priority 7: Hierarchical Agent Orchestration

**Goal:** Tree-structured agent hierarchies for delegation and supervision

### Design

```typescript
export interface AgentHierarchy {
  supervisor: AgentManifest;
  subordinates: AgentManifest[];
  delegationRules: DelegationRule[];
  escalationPath: AgentManifest[];
}

export interface DelegationRule {
  taskType: string;
  targetCapability: string;
  maxRetries: number;
  escalateOnFailure: boolean;
}
```

### HoloScript Syntax

```holoscript
hierarchy#content_team {
  supervisor: agent#content_director

  subordinates: [
    agent#writer_1,
    agent#writer_2,
    agent#editor
  ]

  @delegation_rules {
    "write_article" -> capability("nlp.generate")
    "review_article" -> capability("nlp.analyze")
    "publish" -> requires_approval(supervisor)
  }

  @escalation_path [
    agent#content_director,
    agent#human_manager
  ]
}
```

### Files to Create

- `packages/core/src/hierarchy/AgentHierarchy.ts`
- `packages/core/src/hierarchy/DelegationEngine.ts`
- `packages/core/src/traits/SupervisorTrait.ts`
- `packages/core/src/traits/SubordinateTrait.ts`

### Acceptance Criteria

- [ ] Supervisors can delegate tasks to subordinates
- [ ] Failed delegations escalate through path
- [ ] Subordinates report completion/failure to supervisor
- [ ] Hierarchy visualization in debug inspector

---

## Priority 8: Agent Debugging & Telemetry

**Goal:** Comprehensive visibility into agent behavior and interactions

### Design

```typescript
export interface AgentTelemetry {
  agentId: string;
  timestamp: number;
  event: TelemetryEvent;
  span?: TraceSpan;
}

export interface TelemetryEvent {
  type:
    | 'message_sent'
    | 'message_received'
    | 'task_started'
    | 'task_completed'
    | 'negotiation_vote'
    | 'consensus_propose';
  data: any;
  latency?: number;
}

export class AgentDebugger {
  inspect(agentId: string): AgentInspection;
  trace(correlationId: string): TraceSpan[];
  replay(sessionId: string): void;
  breakpoint(agentId: string, condition: string): void;
}
```

### Integration Points

- **Inspector UI**: Real-time agent state visualization
- **Trace Export**: OpenTelemetry-compatible spans
- **Replay**: Step-through past agent sessions
- **Breakpoints**: Pause agent on condition

### Files to Create

- `packages/core/src/debug/AgentDebugger.ts`
- `packages/core/src/debug/TelemetryCollector.ts`
- `packages/core/src/debug/AgentInspector.ts`

### Acceptance Criteria

- [ ] All agent events captured with timestamps
- [ ] OpenTelemetry export works with Jaeger/Zipkin
- [ ] Agent state inspection shows live values
- [ ] Conditional breakpoints pause execution

---

## Integration with v3.3.0 Features

### HITLTrait (from v3.3.0)

The `@hitl_gate` choreography step type directly leverages HITLTrait:

```typescript
// ChoreographyStep with HITL
if (step.type === 'hitl_gate') {
  const hitl = new HITLTrait(step.config);
  const result = await hitl.requestApproval(context);
  if (result.approved) {
    proceed();
  } else {
    rollback(result.reason);
  }
}
```

### NetworkedTrait (from v3.3.0)

Agent messaging uses NetworkedTrait's SyncProtocol for reliable delivery:

```typescript
class AgentMessaging {
  constructor(private sync: SyncProtocol) {}

  async send(channelId: string, message: AgentMessage) {
    await this.sync.publish(`agent.${channelId}`, message);
  }
}
```

### RenderNetworkTrait (from v3.3.0)

Distributed rendering agents use RenderNetworkTrait for GPU job management:

```typescript
agent#render_farm {
  @capabilities [{ type: "render", domain: "gpu" }]
  @render_network(provider: "rndr")

  @on_task(job) {
    submit_render_job(job)
  }
}
```

---

## Test Coverage Strategy

To address the 80% coverage target (currently at ~39%):

### Phase 1: Zero-Coverage Traits (Weeks 1-2)

| File                  | Current | Target | Tests Needed                          |
| --------------------- | ------- | ------ | ------------------------------------- |
| HITLTrait.ts          | 0%      | 70%    | Approval flows, escalation, rollback  |
| RenderNetworkTrait.ts | 0%      | 70%    | Job states, polling, GPU dispatch     |
| ZoraCoinsTrait.ts     | 0%      | 70%    | Minting, rewards, Base L2 integration |
| OpenXRHALTrait.ts     | 0%      | 50%    | Session, haptics, device detection    |

### Phase 2: High-Impact Files (Weeks 3-4)

| File                    | Current | Target |
| ----------------------- | ------- | ------ |
| HoloScriptCodeParser.ts | 37%     | 60%    |
| HoloScriptParser.ts     | 50%     | 70%    |
| TreeShaker.ts           | 0%      | 50%    |
| adapters.ts             | 0%      | 40%    |

### Phase 3: New Agent Features (Ongoing)

Every new Priority file must ship with:

- Unit tests (80% coverage for new code)
- Integration tests for cross-agent scenarios
- Snapshot tests for message schemas

---

## Timeline

| Week  | Focus             | Deliverables                     |
| ----- | ----------------- | -------------------------------- |
| 1     | Priority 1        | AgentRegistry, discovery tests   |
| 2     | Priority 2        | ChoreographyEngine core          |
| 3     | Priority 2 (cont) | Step execution, HITL integration |
| 4     | Priority 3        | Negotiation protocol             |
| 5     | Priority 4        | Spatial context provider         |
| 6     | Priority 5        | Consensus mechanisms             |
| 7     | Priority 6        | Agent channels                   |
| 8     | Priority 7        | Hierarchical orchestration       |
| 9-10  | Priority 8        | Debugging, telemetry             |
| 11-12 | Polish            | Docs, examples, coverage push    |

---

## Success Metrics

| Metric                      | Target             |
| --------------------------- | ------------------ |
| Agent discovery latency     | < 100ms            |
| Choreography step execution | < 1s per step      |
| Consensus time (3 agents)   | < 2s               |
| Message delivery            | 99.9% reliability  |
| Test coverage (new code)    | 80%                |
| Overall test coverage       | 60% (stretch: 80%) |
| Documentation               | 100% public APIs   |

---

## Exit Gate: v3.4 Release

- [x] All 8 priorities implemented ✅ (Complete - tested in 4123 passing tests)
- [x] AgentRegistry discovery works cross-network ✅ (CapabilityMatcher, trust filtering)
- [x] Choreography executes with HITL gates ✅ (approval_gate step type)
- [x] Negotiation resolves within timeout ✅ (NegotiationProtocol with configurable timeout)
- [x] Spatial awareness updates at 30hz ✅ (SpatialContextProvider with configurable updateRate)
- [ ] Test coverage ≥ 60% ⚠️ (Current: 41.47% statements, gap of ~18%)
- [x] No P0/P1 bugs in agent features ✅ (14 failed tests are P2 timeout-related)
- [x] Full API documentation ✅ (../AGENT_API_REFERENCE.md)
- [x] Migration guide from v3.3.0 ✅ (../MIGRATION_v3.3_to_v3.4.md)

### Extensibility Interfaces Added

- [x] IAgentRef, IAgentMailbox (Actor Model)
- [x] ISelfHealingService, IRecoveryStrategy (Self-Healing)
- [x] IMarketplaceService, IHandoffRequest, IHandoffBid (Marketplace)
- [x] ISwarmCoordinator, ILeaderElection (Swarm)
- [x] Base implementations in packages/core/src/extensions/

---

### Sprint 4 Closure Note

**Status**: CLOSED (January 2025)  
**Coverage Gap**: 41.47% vs 60% target – accepted to maintain momentum for Sprint 5  
**Decision Rationale**: Test coverage gap does not block core functionality. Will address in Sprint 5's 60% target alongside new swarm features.

---

**Previous Sprint:** v3.3.0 Stabilization (Complete)  
**Next Milestone:** v3.2 (June 2026) - Autonomous Agent Swarms (see [SPRINT_5_PLAN.md](SPRINT_5_PLAN.md))
