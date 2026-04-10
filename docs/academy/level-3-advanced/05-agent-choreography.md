# Lesson 3.5: Multi-Agent Choreography

In this advanced lesson, you'll learn how to orchestrate multiple AI agents working together in HoloScript v3.1's new choreography system.

## Learning Objectives

By the end of this lesson, you will:

- Understand the ChoreographyEngine architecture
- Register and discover agents dynamically
- Create task-to-agent matching workflows
- Handle multi-agent negotiation and conflict resolution

## What is Agent Choreography?

Agent choreography enables multiple AI agents to collaborate on complex tasks. Unlike centralized orchestration where one controller dictates actions, choreography allows agents to negotiate, delegate, and coordinate autonomously.

```
┌─────────────────────────────────────────────────────────────┐
│                  ChoreographyEngine                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │ Agent A │◄─►│ Agent B │◄─►│ Agent C │◄─►│ Agent D │     │
│  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘     │
│       │             │             │             │           │
│       ▼             ▼             ▼             ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Shared Task Pool                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Setting Up the Agent Registry

First, create a registry to manage your agents:

```holoscript
composition "AgentWorkspace" {
  // Configure the agent registry
  config {
    agent_registry: {
      max_agents: 100
      discovery: "automatic"
      heartbeat_interval: 5000
    }
  }

  // Define an AI assistant agent
  template "AssistantAgent" {
    @agent {
      type: "assistant"
      capabilities: ["text-generation", "code-review"]
      max_concurrent_tasks: 5
    }

    state {
      status: "idle"
      current_tasks: []
    }
  }

  // Define a code analyzer agent
  template "AnalyzerAgent" {
    @agent {
      type: "analyzer"
      capabilities: ["static-analysis", "security-scan"]
      max_concurrent_tasks: 3
    }

    state {
      status: "idle"
      analysis_queue: []
    }
  }

  // Instantiate agents
  object "CodeAssistant" using "AssistantAgent" {}
  object "SecurityAnalyzer" using "AnalyzerAgent" {}
}
```

## Registering Agents Programmatically

You can also register agents from TypeScript:

```typescript
import { AgentRegistry, ChoreographyEngine } from '@holoscript/core';

// Create the registry
const registry = new AgentRegistry({
  maxAgents: 100,
  enableDiscovery: true,
});

// Register an agent
const agentId = registry.register({
  id: 'agent-001',
  type: 'assistant',
  capabilities: ['text-generation', 'summarization'],
  metadata: {
    model: 'gpt-4',
    maxTokens: 8000,
  },
});

// Listen for agent events
registry.on('agent:registered', (agent) => {
  console.log(`New agent: ${agent.id} with capabilities: ${agent.capabilities}`);
});

registry.on('agent:heartbeat', (agentId, status) => {
  console.log(`${agentId} is ${status.current_task ? 'busy' : 'available'}`);
});
```

## Creating the Choreography Engine

The ChoreographyEngine matches tasks to appropriate agents:

```typescript
import { ChoreographyEngine, Task, TaskResult } from '@holoscript/core';

// Create the engine with the registry
const engine = new ChoreographyEngine(registry, {
  matchingStrategy: 'capability-based',
  loadBalancing: 'least-busy',
  timeout: 30000,
});

// Submit a task
const task: Task = {
  id: 'task-001',
  type: 'code-review',
  priority: 'high',
  payload: {
    files: ['src/main.ts', 'src/utils.ts'],
    checkStyle: true,
    checkSecurity: true,
  },
};

// Execute with automatic agent matching
const result: TaskResult = await engine.execute(task);

console.log(`Task completed by ${result.agentId}`);
console.log(`Result: ${JSON.stringify(result.output)}`);
```

## Task-to-Agent Matching

The engine uses capability matching to find the best agent:

```typescript
// Define matching rules
engine.setMatchingRules({
  'code-review': {
    requiredCapabilities: ['static-analysis'],
    preferredCapabilities: ['security-scan'],
    excludeCapabilities: ['test-only'],
  },
  'text-generation': {
    requiredCapabilities: ['text-generation'],
    preferredAgentTypes: ['assistant', 'writer'],
  },
});

// Custom matching function
engine.setCustomMatcher((task, agents) => {
  // Filter agents that can handle this task
  const capable = agents.filter((a) =>
    task.requiredCapabilities.every((cap) => a.capabilities.includes(cap))
  );

  // Sort by preference (least busy first)
  return capable.sort((a, b) => a.currentTaskCount - b.currentTaskCount)[0];
});
```

## Multi-Agent Negotiation

When multiple agents could handle a task, use negotiation:

```typescript
import { NegotiationProtocol, Bid } from '@holoscript/core';

// Create negotiation protocol
const negotiation = new NegotiationProtocol({
  strategy: 'auction',
  maxRounds: 3,
  timeout: 5000,
});

// Agents submit bids
negotiation.on('bid:requested', async (task, agent) => {
  // Agent evaluates task and submits bid
  const bid: Bid = {
    agentId: agent.id,
    taskId: task.id,
    estimatedTime: calculateEstimate(task, agent),
    confidence: assessConfidence(task, agent),
    cost: calculateCost(task, agent),
  };
  return bid;
});

// Run negotiation
const winner = await negotiation.negotiate(task, availableAgents);
console.log(`${winner.agentId} won with bid: ${winner.estimatedTime}ms`);
```

## Conflict Resolution

Handle conflicts when agents compete for resources:

```typescript
import { ConflictResolver } from '@holoscript/core';

const resolver = new ConflictResolver({
  strategy: 'priority-based',
  fallback: 'first-come-first-served',
});

// Define priority rules
resolver.setPriorities({
  'security-scan': 100, // Highest priority
  'code-review': 80,
  documentation: 50,
  formatting: 20, // Lowest priority
});

// Resolve conflicts
resolver.on('conflict', async (agents, resource) => {
  const winner = await resolver.resolve(agents, resource);
  console.log(`${winner.id} gets access to ${resource.name}`);
});
```

## Complete Example: Code Review Pipeline

Here's a full example of a multi-agent code review system:

```holoscript
composition "CodeReviewPipeline" {
  config {
    agent_registry: {
      max_agents: 10
      discovery: "automatic"
    }
    choreography: {
      matching: "capability-based"
      load_balancing: "round-robin"
    }
  }

  // Linting agent
  template "LintAgent" {
    @agent {
      type: "linter"
      capabilities: ["eslint", "prettier"]
    }

    action lint(files) {
      return files.map(f => checkStyle(f))
    }
  }

  // Security scanning agent
  template "SecurityAgent" {
    @agent {
      type: "security"
      capabilities: ["security-scan", "dependency-audit"]
    }

    action scan(files) {
      return files.map(f => securityCheck(f))
    }
  }

  // Code review agent
  template "ReviewAgent" {
    @agent {
      type: "reviewer"
      capabilities: ["code-review", "suggestion"]
    }

    action review(files, lintResults, securityResults) {
      return generateReview(files, lintResults, securityResults)
    }
  }

  // Pipeline coordinator
  object "Pipeline" {
    @choreographer

    action runReview(pullRequest) {
      // Stage 1: Parallel analysis
      const [lintResults, securityResults] = await parallel([
        dispatch("lint", { files: pullRequest.files }),
        dispatch("scan", { files: pullRequest.files })
      ])

      // Stage 2: Consolidated review
      const review = await dispatch("review", {
        files: pullRequest.files,
        lintResults,
        securityResults
      })

      return review
    }
  }

  // Instantiate agents
  object "Linter" using "LintAgent" {}
  object "SecurityScanner" using "SecurityAgent" {}
  object "Reviewer" using "ReviewAgent" {}
}
```

## Monitoring and Debugging

Track choreography performance:

```typescript
// Enable detailed logging
engine.setLogging({
  level: 'debug',
  includeTimings: true,
  traceNegotiations: true,
});

// Get metrics
const metrics = engine.getMetrics();
console.log(`
  Tasks completed: ${metrics.tasksCompleted}
  Average latency: ${metrics.avgLatency}ms
  Agent utilization: ${metrics.utilization}%
  Conflicts resolved: ${metrics.conflictsResolved}
`);

// Trace a specific task
const trace = await engine.trace('task-001');
console.log(`Task trace:`, trace.timeline);
```

## Exercise: Build a Translation Pipeline

Create a multi-agent translation system:

1. **DetectorAgent**: Detects source language
2. **TranslatorAgent**: Translates text
3. **ValidatorAgent**: Validates translation quality
4. **FormatterAgent**: Formats output

Requirements:

- Parallel detection and initial translation
- Quality validation before output
- Retry mechanism for low-quality translations
- Conflict resolution for shared glossary

## Summary

In this lesson you learned:

- **AgentRegistry**: Manages agent lifecycle and discovery
- **ChoreographyEngine**: Matches tasks to capable agents
- **Negotiation**: Handles multi-agent bidding and selection
- **Conflict Resolution**: Resolves resource competition

## Next Steps

- [Lesson 3.6: Agent Communication](./06-agent-communication.md)
- [Lesson 3.7: Spatial Context](./07-spatial-context.md)
- [Lesson 3.8: Consensus Mechanisms](./08-consensus.md)
