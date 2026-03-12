# HoloScript AI Traits & Observability Reference

**Version:** v3.42.0
**Last Updated:** 2026-02-25
**Audience:** AI Agents, Developers integrating AI capabilities

> 🤖 **For AI Agents:** This document consolidates all AI-related traits, observability APIs, and integration points in one place. Use this as your primary reference for building AI-powered spatial experiences.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [AI Agent Traits](#ai-agent-traits)
3. [uAA2++ Protocol Integration](#uaa2-protocol-integration)
4. [Observability & Event System](#observability--event-system)
5. [Multi-Agent Orchestration](#multi-agent-orchestration)
6. [Integration Patterns](#integration-patterns)
7. [Metrics & Evaluation](#metrics--evaluation)

---

## Quick Reference

### Core AI Traits

| Trait                | Purpose                                        | File Location                                 |
| -------------------- | ---------------------------------------------- | --------------------------------------------- |
| `@llm_agent`         | LLM-powered agent with conversation management | `packages/core/src/traits/LLMAgentTrait.ts`   |
| `@multi_agent`       | Multi-agent coordination and consensus         | `packages/core/src/traits/MultiAgentTrait.ts` |
| `@ai_behavior`       | AI-driven behavior trees and decision-making   | `packages/core/src/traits/AIBehaviorTrait.ts` |
| `@spatial_awareness` | Spatial perception and context for agents      | `packages/core/src/agents/SpatialContext.ts`  |

### Key APIs for Observability

| API                      | Purpose                       | Import Path                     |
| ------------------------ | ----------------------------- | ------------------------------- |
| `AgentRegistry`          | Agent discovery & lifecycle   | `@holoscript/core/agents`       |
| `ChoreographyEngine`     | Multi-step workflow execution | `@holoscript/core/choreography` |
| `SpatialContextProvider` | Spatial awareness tracking    | `@holoscript/core/spatial`      |
| `EventEmitter`           | Event-driven observability    | Built-in to trait system        |

### Event Types for Tracking

| Event             | Emitted When             | Use For                     |
| ----------------- | ------------------------ | --------------------------- |
| `llm_agent_ready` | Agent initialized        | Lifecycle tracking          |
| `llm_request`     | LLM call initiated       | API usage metrics           |
| `llm_response`    | LLM response received    | Response quality tracking   |
| `llm_tool_call`   | Tool invoked by agent    | Tool usage analytics        |
| `llm_escalation`  | Escalation condition met | Error/uncertainty tracking  |
| `phase_complete`  | uAA2++ phase finished    | Protocol execution tracking |

---

## AI Agent Traits

### @llm_agent

Full-featured LLM agent with conversation management, tool calling, and bounded autonomy.

**Location:** `packages/core/src/traits/LLMAgentTrait.ts`

#### Basic Usage

```holo
object "Brittney" {
  @llm_agent(
    model: "gpt-4-turbo",
    system_prompt: "You are a helpful VR assistant.",
    bounded_autonomy: true,
    max_actions_per_turn: 3
  )
  position: [0, 1.5, -2]
}
```

#### Configuration Parameters

```typescript
interface LLMAgentConfig {
  // Model Configuration
  model: string; // LLM model name (e.g., "gpt-4-turbo", "claude-3-opus")
  system_prompt?: string; // System message for agent personality

  // Autonomy & Safety
  bounded_autonomy?: boolean; // Limit actions per turn (default: false)
  max_actions_per_turn?: number; // Max tool calls per turn (default: 5)

  // Rate Limiting
  rate_limit_ms?: number; // Minimum ms between requests (default: 1000)

  // Escalation Conditions
  escalation_conditions?: Array<{
    type: 'keyword' | 'uncertainty' | 'action_count';
    value: string | number;
    action: 'notify' | 'pause' | 'human_in_loop';
  }>;

  // Context Management
  max_history_tokens?: number; // Max conversation tokens (default: 4000)
  context_window?: number; // Model context window (default: 8192)
}
```

#### Events Emitted

```typescript
// Agent lifecycle
emit('llm_agent_ready', { agentId: string })

// Conversation flow
emit('llm_request', {
  model: string,
  messages: Message[],
  timestamp: number
})

emit('llm_response', {
  content: string,
  tool_calls?: ToolCall[],
  tokens_used: number
})

emit('llm_message', {
  role: 'assistant',
  content: string
})

// Tool execution
emit('llm_tool_call', {
  tool: string,
  arguments: Record<string, unknown>,
  callId: string
})

emit('llm_tool_result', {
  result: unknown,
  callId: string
})

// Safety & escalation
emit('llm_escalation', {
  reason: string,
  severity: 'low' | 'medium' | 'high',
  action_taken: string
})

emit('llm_rate_limited', {
  retry_after_ms: number
})

emit('llm_turn_limit_reached', {
  actions_taken: number,
  max_allowed: number
})
```

#### State Management

The `@llm_agent` trait maintains internal state on the node:

```typescript
interface LLMAgentState {
  conversationHistory: Message[]; // Full conversation thread
  lastResponse: string; // Most recent assistant message
  isProcessing: boolean; // Currently waiting for LLM
  actionsTaken: number; // Actions in current session
  turnActionCount: number; // Actions in current turn
  isEscalated: boolean; // Escalation flag
  pendingToolCalls: ToolCall[]; // Queued tool invocations
  lastRequestTime: number; // For rate limiting
}
```

#### Example: Conversation with Tool Use

```holo
object "WeatherBot" {
  @llm_agent(
    model: "gpt-4-turbo",
    system_prompt: "You help users check weather. Use get_weather tool when needed.",
    bounded_autonomy: true,
    max_actions_per_turn: 2
  )

  on(llm_tool_call) {
    if (event.tool === "get_weather") {
      const weather = fetchWeather(event.arguments.city);
      emit('llm_tool_result', { result: weather, callId: event.callId });
    }
  }
}
```

---

## uAA2++ Protocol Integration

HoloScript implements the **uAA2++ autonomous agent protocol** with 7 phases.

**Location:** `packages/core/src/agents/AgentTypes.ts`

### Phase Definitions

```typescript
type AgentPhase =
  | 'INTAKE' // Phase 0: Gather data and context
  | 'REFLECT' // Phase 1: Analyze and understand
  | 'EXECUTE' // Phase 2: Take action
  | 'COMPRESS' // Phase 3: Store knowledge efficiently
  | 'REINTAKE' // Phase 4: Re-evaluate with compressed knowledge
  | 'GROW' // Phase 5: Learn and improve
  | 'EVOLVE'; // Phase 6: Adapt and optimize
```

### Phase Execution Order

```typescript
const PHASE_ORDER = [
  'INTAKE', // 1 second default
  'REFLECT', // 2 seconds
  'EXECUTE', // 5 seconds
  'COMPRESS', // 1 second
  'REINTAKE', // 1 second
  'GROW', // 2 seconds
  'EVOLVE', // 1 second
];
```

### Phase Results

Each phase returns structured results for observability:

```typescript
// INTAKE Phase
interface IntakeResult {
  success: boolean;
  phase: 'INTAKE';
  duration_ms: number;
  sources: string[];
  items_loaded: number;
  data?: {
    knowledge?: Record<string, unknown>;
    patterns?: unknown[];
    wisdom?: unknown[];
    gotchas?: unknown[];
  };
}

// COMPRESS Phase (most relevant for metrics)
interface CompressResult {
  success: boolean;
  phase: 'COMPRESS';
  duration_ms: number;
  compression_ratio: number; // e.g., 0.93 = 93% compression
  tokens_saved: number;
  data?: {
    compressed_knowledge?: string;
    patterns_extracted?: string[];
    wisdom_extracted?: string[];
    gotchas_captured?: string[];
  };
}

// GROW Phase
interface GrowResult {
  success: boolean;
  phase: 'GROW';
  duration_ms: number;
  patterns_learned: number;
  wisdom_gained: number;
  gotchas_captured: number;
  data?: {
    new_patterns?: Array<{ id: string; name: string; confidence: number }>;
    new_wisdom?: Array<{ id: string; content: string; domain: string }>;
  };
}
```

### Example: Tracking uAA2++ Execution

```typescript
import { AgentOrchestrator } from '@holoscript/core/agents';

const orchestrator = new AgentOrchestrator();

// Execute full protocol
const results = await orchestrator.executeProtocol({
  agentId: 'brittney_001',
  task: 'analyze_scene',
  context: { scene: currentScene },
});

// Results contain all phase data
results.phases.forEach((phase) => {
  console.log(`${phase.phase}: ${phase.duration_ms}ms`);
  if (phase.phase === 'COMPRESS') {
    console.log(`Compression: ${phase.compression_ratio * 100}%`);
  }
});
```

---

## Observability & Event System

### Event-Driven Architecture

All HoloScript traits use an event-driven model for observability. Events are emitted via the `TraitContext`:

```typescript
interface TraitContext {
  emit(event: string, data: unknown): void;
  node: HoloNode;
  scene: Scene;
  deltaTime: number;
}
```

### Subscribing to Events

```typescript
// In your trait or external system
trait.onEvent = (node, config, context, event) => {
  if (event.type === 'llm_request') {
    // Track API call
    metrics.trackLLMRequest({
      model: event.model,
      timestamp: Date.now(),
      messageCount: event.messages.length,
    });
  }

  if (event.type === 'llm_response') {
    // Track response quality
    metrics.trackLLMResponse({
      tokensUsed: event.tokens_used,
      latency: Date.now() - event.request_timestamp,
      hasToolCalls: !!event.tool_calls,
    });
  }
};
```

### Common Event Patterns

```typescript
// Lifecycle Events
'agent_ready'; // Agent initialized
'agent_shutdown'; // Agent shutting down
'agent_error'; // Agent encountered error

// Execution Events
'phase_start'; // uAA2++ phase starting
'phase_complete'; // uAA2++ phase finished
'phase_error'; // Phase encountered error

// LLM Events (from @llm_agent)
'llm_request'; // API call initiated
'llm_response'; // Response received
'llm_tool_call'; // Tool invoked
'llm_escalation'; // Escalation triggered

// Spatial Events
'spatial_context_updated'; // Spatial state changed
'proximity_detected'; // Object/agent nearby
'location_changed'; // Agent moved
```

---

## Multi-Agent Orchestration

### AgentRegistry

Central registry for agent discovery and lifecycle management.

**Location:** `packages/core/src/agents/AgentRegistry.ts`

```typescript
import { AgentRegistry } from '@holoscript/core/agents';

const registry = new AgentRegistry({
  heartbeatInterval: 30000, // 30s heartbeat
  ttl: 60000, // 60s before offline
  discoveryMode: 'broadcast',
});

// Register agent
await registry.register({
  id: 'brittney_001',
  name: 'Brittney AI',
  version: '2.3.0',
  capabilities: [
    { type: 'analyze', domain: 'spatial', latency: 'fast' },
    { type: 'generate', domain: 'code', latency: 'medium' },
  ],
  trustLevel: 'verified',
});

// Discover agents by capability
const spatialAgents = await registry.discover({
  type: 'analyze',
  domain: 'spatial',
});
```

### ChoreographyEngine

Executes multi-step agent workflows with HITL support.

**Location:** `packages/core/src/choreography/ChoreographyEngine.ts`

```typescript
import { ChoreographyEngine } from '@holoscript/core/choreography';

const engine = new ChoreographyEngine(planner, executor);

// Define workflow
const choreography = {
  id: 'scene_analysis',
  name: 'Analyze and Optimize Scene',
  steps: [
    {
      id: 'analyze',
      type: 'action',
      agentId: 'brittney_001',
      action: 'analyzeScene',
      params: { scene: currentScene },
    },
    {
      id: 'approval',
      type: 'hitl',
      agentId: 'human',
      onApproval: async () => ({ approved: true }),
    },
    {
      id: 'optimize',
      type: 'action',
      agentId: 'brittney_001',
      action: 'optimizeScene',
      params: { scene: currentScene },
      dependsOn: ['approval'],
    },
  ],
};

// Execute with tracking
const result = await engine.execute(choreography);
console.log(`Completed ${result.completedSteps.length} steps in ${result.duration}ms`);
```

### NegotiationProtocol

Multi-agent negotiation with proposals and voting.

**Location:** `packages/core/src/negotiation/NegotiationProtocol.ts`

```typescript
import { NegotiationProtocol } from '@holoscript/core/negotiation';

const protocol = new NegotiationProtocol({
  votingMechanism: 'majority',
  defaultTimeout: 30000,
});

// Create negotiation session
const session = protocol.createSession('scene_layout', [
  { id: 'brittney', weight: 1.0 },
  { id: 'architect', weight: 1.5 },
]);

// Submit proposals
protocol.propose(session.id, 'brittney', { layout: 'grid' });
protocol.propose(session.id, 'architect', { layout: 'organic' });

// Vote
protocol.vote(session.id, 'brittney', 'proposal-2', 'accept');
protocol.vote(session.id, 'architect', 'proposal-2', 'accept');

// Resolve
const result = await protocol.resolve(session.id);
console.log(`Winner: ${result.winningProposal}`);
```

---

## Integration Patterns

### CometML Integration

Track experiments, metrics, and agent performance with CometML.

```typescript
import { Experiment } from 'comet-ml';

// Initialize experiment
const experiment = new Experiment({
  apiKey: process.env.COMET_API_KEY,
  projectName: 'holoscript-agents',
  workspaceName: 'my-workspace',
});

// Track agent initialization
experiment.logParameters({
  agent_id: 'brittney_001',
  model: 'gpt-4-turbo',
  max_actions_per_turn: 3,
  bounded_autonomy: true,
});

// Track LLM requests
trait.onEvent = (node, config, context, event) => {
  if (event.type === 'llm_request') {
    experiment.logMetric('llm_requests', 1);
    experiment.logMetric('message_count', event.messages.length);
  }

  if (event.type === 'llm_response') {
    experiment.logMetric('tokens_used', event.tokens_used);
    experiment.logMetric('response_latency', event.latency_ms);
  }

  if (event.type === 'llm_escalation') {
    experiment.logMetric('escalations', 1);
    experiment.logText(`Escalation: ${event.reason}`);
  }
};

// Track uAA2++ phase execution
orchestrator.on('phase_complete', (phase) => {
  experiment.logMetric(`phase_${phase.phase}_duration`, phase.duration_ms);

  if (phase.phase === 'COMPRESS') {
    experiment.logMetric('compression_ratio', phase.compression_ratio);
    experiment.logMetric('tokens_saved', phase.tokens_saved);
  }

  if (phase.phase === 'GROW') {
    experiment.logMetric('patterns_learned', phase.patterns_learned);
    experiment.logMetric('wisdom_gained', phase.wisdom_gained);
  }
});

// End experiment
experiment.end();
```

### Perplexity Metric Integration

Add perplexity scoring to evaluate agent response quality.

```typescript
import { calculatePerplexity } from './perplexity';

// Track perplexity on LLM responses
trait.onEvent = (node, config, context, event) => {
  if (event.type === 'llm_response') {
    const perplexity = calculatePerplexity({
      text: event.content,
      model: config.model,
      tokenizer: getTokenizer(config.model),
    });

    // Log to CometML or your metrics system
    experiment.logMetric('response_perplexity', perplexity);

    // Alert on high perplexity (potential quality issue)
    if (perplexity > 50) {
      console.warn(`High perplexity detected: ${perplexity}`);
      emit('llm_quality_warning', { perplexity, response: event.content });
    }
  }
};
```

### Custom Observability Hook

Create a unified observability layer for all agents:

```typescript
class AgentObservability {
  private metrics: Map<string, number> = new Map();

  trackEvent(agentId: string, event: string, data: any) {
    const key = `${agentId}_${event}`;
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);

    // Send to your observability backend
    this.sendToBackend({
      agent_id: agentId,
      event,
      data,
      timestamp: Date.now(),
    });
  }

  getMetrics(agentId: string) {
    const prefix = `${agentId}_`;
    const agentMetrics: Record<string, number> = {};

    for (const [key, value] of this.metrics) {
      if (key.startsWith(prefix)) {
        agentMetrics[key.slice(prefix.length)] = value;
      }
    }

    return agentMetrics;
  }
}

// Usage
const observability = new AgentObservability();

// Hook into all agent events
trait.onEvent = (node, config, context, event) => {
  observability.trackEvent(node.id, event.type, event);
};

// Query metrics
const metrics = observability.getMetrics('brittney_001');
console.log('LLM Requests:', metrics.llm_request);
console.log('Escalations:', metrics.llm_escalation);
```

---

## Metrics & Evaluation

### Key Metrics to Track

```typescript
interface AgentMetrics {
  // Lifecycle
  uptime_ms: number;
  total_sessions: number;

  // LLM Usage
  llm_requests: number;
  llm_errors: number;
  total_tokens_used: number;
  avg_latency_ms: number;

  // Quality
  avg_perplexity: number;
  escalation_rate: number; // escalations / requests
  success_rate: number; // successful completions / total

  // uAA2++ Protocol
  cycles_completed: number;
  avg_cycle_duration_ms: number;
  avg_compression_ratio: number;
  patterns_learned: number;
  wisdom_gained: number;

  // Tool Usage
  tool_calls: number;
  tool_success_rate: number;

  // Cost (if tracking)
  total_cost_usd: number;
  cost_per_request: number;
}
```

### Evaluation Framework

```typescript
class AgentEvaluator {
  async evaluateAgent(agentId: string, testCases: TestCase[]) {
    const results = [];

    for (const testCase of testCases) {
      const response = await agent.execute(testCase.input);

      const evaluation = {
        test_id: testCase.id,

        // Correctness
        correct: this.checkCorrectness(response, testCase.expected),

        // Quality metrics
        perplexity: calculatePerplexity(response),
        coherence: this.scoreCoherence(response),

        // Performance
        latency_ms: response.duration,
        tokens_used: response.tokens,

        // Safety
        escalated: response.escalated,
        bounded_autonomy_respected: response.actions <= testCase.maxActions,
      };

      results.push(evaluation);
    }

    return this.aggregateResults(results);
  }
}
```

---

## Quick Start Examples

### Example 1: Simple LLM Agent with Tracking

```holo
composition "Tracked Agent Demo" {
  object "Brittney" {
    @llm_agent(
      model: "gpt-4-turbo",
      system_prompt: "You are a helpful VR guide.",
      max_actions_per_turn: 3,
      escalation_conditions: [
        { type: 'uncertainty', value: 'unsure', action: 'notify' }
      ]
    )

    on(llm_request) {
      print('API call initiated')
      experiment.logMetric('requests', 1)
    }

    on(llm_response) {
      print('Response received:', event.content)
      experiment.logMetric('tokens', event.tokens_used)
    }

    on(llm_escalation) {
      print('⚠️ Escalation:', event.reason)
      alert('Agent needs help!')
    }
  }
}
```

### Example 2: Multi-Agent Collaboration

```typescript
// Register multiple agents
const agents = ['brittney', 'architect', 'optimizer'];
for (const agent of agents) {
  await registry.register({
    id: agent,
    capabilities: getCapabilities(agent),
  });
}

// Coordinate via choreography
const workflow = {
  steps: [
    { id: '1', agentId: 'brittney', action: 'analyzeScene' },
    { id: '2', agentId: 'architect', action: 'designLayout', dependsOn: ['1'] },
    { id: '3', agentId: 'optimizer', action: 'optimize', dependsOn: ['2'] },
  ],
};

const result = await engine.execute(workflow);

// Track collaboration metrics
experiment.logMetric('collaboration_duration', result.duration);
experiment.logMetric('agents_involved', agents.length);
```

### Example 3: Full uAA2++ Protocol Tracking

```typescript
const orchestrator = new AgentOrchestrator();

// Execute protocol with full observability
const results = await orchestrator.executeProtocol({
  agentId: 'brittney_001',
  task: 'spatial_analysis',
  onPhaseComplete: (phase) => {
    // Track each phase
    experiment.logMetric(`${phase.phase}_duration`, phase.duration_ms);
    experiment.logMetric(`${phase.phase}_success`, phase.success ? 1 : 0);

    // Log phase-specific data
    if (phase.phase === 'COMPRESS') {
      experiment.logMetric('compression_ratio', phase.compression_ratio);
    }
  },
});

// Summary metrics
experiment.logMetric('total_protocol_duration', results.totalDuration);
experiment.logMetric('phases_succeeded', results.successCount);
```

---

## Additional Resources

### Documentation

- [Agent API Reference](./AGENT_API_REFERENCE.md) - Full API docs
- [Traits Reference](./TRAITS_REFERENCE.md) - All 2,000+ traits
- [MCP Server Guide](./MCP_SERVER_GUIDE.md) - AI agent integration

### Examples

- `examples/agents/llm-agent-demo/` - Basic LLM agent
- `examples/agents/multi-agent-collab/` - Multi-agent coordination
- `examples/agents/tracked-agents/` - CometML integration

### Source Code

- `packages/core/src/traits/LLMAgentTrait.ts` - LLM agent implementation
- `packages/core/src/agents/AgentTypes.ts` - uAA2++ protocol types
- `packages/core/src/agents/AgentRegistry.ts` - Agent discovery
- `packages/core/src/choreography/ChoreographyEngine.ts` - Workflow execution

---

## FAQ

**Q: How do I add perplexity tracking to my agent?**

A: Hook into `llm_response` events and calculate perplexity:

```typescript
trait.onEvent = (node, config, context, event) => {
  if (event.type === 'llm_response') {
    const perplexity = calculatePerplexity(event.content);
    experiment.logMetric('perplexity', perplexity);
  }
};
```

**Q: What's the difference between HoloScript's 7-phase and uaa2-service's 8-phase protocol?**

A: HoloScript implements 7 phases (INTAKE → EVOLVE). The uaa2-service adds an 8th phase (AUTONOMIZE) for self-perpetuation. Both are compatible.

**Q: Can I use LangSmith with HoloScript?**

A: LangSmith is designed for LangChain/LangGraph. Since HoloScript has its own orchestration, use CometML or build custom hooks into the event system instead.

**Q: How do I track costs per agent?**

A: Track `llm_request` and `llm_response` events, sum `tokens_used`, and multiply by your model's pricing:

```typescript
let totalCost = 0;
trait.onEvent = (node, config, context, event) => {
  if (event.type === 'llm_response') {
    const cost = event.tokens_used * MODEL_PRICE_PER_TOKEN;
    totalCost += cost;
    experiment.logMetric('cost_usd', cost);
  }
};
```

---

**Last Updated:** 2026-02-25
**Contributors:** Claude Sonnet 4.5, HoloScript AI Research Team
**License:** MIT

🤖 **Built with love for AI agents everywhere**
