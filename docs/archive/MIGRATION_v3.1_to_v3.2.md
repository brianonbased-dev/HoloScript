# Migration Guide: HoloScript v3.4.x → v3.2.0

This guide covers upgrading from HoloScript v3.4.x to v3.2.0 (Autonomous Agent Swarms).

---

## Overview

HoloScript v3.2.0 introduces the **Swarm Module** - a comprehensive system for coordinating autonomous agent collectives. This is an additive release with no breaking changes to existing v3.4.x APIs.

| Category             | v3.4.x        | v3.2.0                      |
| -------------------- | ------------- | --------------------------- |
| Agent coordination   | Manual        | Swarm-based                 |
| Optimization         | N/A           | PSO/ACO algorithms          |
| Leader election      | N/A           | Raft-inspired protocol      |
| Collective decisions | N/A           | Multi-agent synthesis       |
| Spatial behaviors    | N/A           | Flocking, formations, zones |
| Messaging            | Basic events  | Priority pub/sub, gossip    |
| Analytics            | Basic logging | Prometheus-ready metrics    |

---

## Installation

```bash
npm install @holoscript/core@3.2.0
```

No additional dependencies required - swarm module is included in core.

---

## New Feature: Agent Swarms

### Basic Swarm Setup

```typescript
// v3.4.x - Manual agent coordination
const agents = [agent1, agent2, agent3];
for (const agent of agents) {
  agent.assignTask(findTask(agent));
}

// v3.2.0 - Automated swarm coordination
import { SwarmCoordinator, SwarmManager } from '@holoscript/core/swarm';

const coordinator = new SwarmCoordinator({ algorithm: 'pso' });
const manager = new SwarmManager();

// Form a swarm
const swarm = await manager.createSwarm({
  name: 'TaskProcessors',
  objective: 'Handle incoming tasks',
  minMembers: 3,
});

// Optimize task assignment
const result = await coordinator.optimize(agents, tasks, {
  fitnessFunction: (assignment) => calculateEfficiency(assignment),
});
```

### Leader Election

```typescript
// v3.2.0 - Automatic leader election
import { LeaderElection } from '@holoscript/core/swarm';

const election = new LeaderElection('agent-1', {
  heartbeatInterval: 150,
  electionTimeout: { min: 300, max: 500 },
});

election.addPeer('agent-2');
election.addPeer('agent-3');

election.on('elected', (leaderId) => {
  console.log(`Leader: ${leaderId}`);
});

election.start();
```

### Collective Intelligence

```typescript
// v3.2.0 - Collaborative decision-making
import { CollectiveIntelligence } from '@holoscript/core/swarm';

const collective = new CollectiveIntelligence();

const session = await collective.createSession(
  'Code Review',
  'Review changes for security issues',
  'agent-lead'
);

await collective.contribute(session.id, 'agent-1', {
  type: 'evidence',
  content: 'Found potential XSS vulnerability',
  confidence: 0.9,
});

const result = await collective.synthesize(session.id);
```

---

## New Feature: Spatial Behaviors

### Flocking

```typescript
import { FlockingBehavior, Vector3 } from '@holoscript/core/swarm/spatial';

const flocking = new FlockingBehavior({
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  maxSpeed: 5.0,
});

// Each frame
const newVelocities = flocking.calculate(agents);
agents.forEach((agent, i) => agent.velocity.add(newVelocities[i]));
```

### Formations

```typescript
import { FormationController } from '@holoscript/core/swarm/spatial';

const formation = new FormationController();
formation.setFormation('wedge', { spacing: 2.0, leaderId: 'leader' });

const targets = formation.getTargetPositions(agents);
```

### Territory Control

```typescript
import { ZoneClaiming } from '@holoscript/core/swarm/spatial';

const zones = new ZoneClaiming();
await zones.claim('agent-1', {
  id: 'sector-a',
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } },
});
```

---

## New Feature: Swarm Messaging

### Event Bus with Priority

```typescript
import { SwarmEventBus } from '@holoscript/core/swarm/messaging';

const bus = new SwarmEventBus();

bus.subscribe('swarm.*', (event) => handleEvent(event));

await bus.publish({
  type: 'swarm.alert',
  source: 'monitor',
  payload: { level: 'warning' },
  priority: 'critical', // Processed before normal messages
});
```

### Gossip Protocol

For large swarms (50+ agents), use gossip for efficient propagation:

```typescript
import { GossipProtocol } from '@holoscript/core/swarm/messaging';

const gossip = new GossipProtocol('node-id', {
  fanout: 3,
  maxHops: 10,
});

gossip.addPeer('peer-1', 'ws://peer1:8080');
gossip.publish('state-update', data);
gossip.start();
```

---

## New Feature: Analytics & Monitoring

### Prometheus-Ready Metrics

```typescript
import { SwarmMetrics } from '@holoscript/core/swarm/analytics';

const metrics = new SwarmMetrics();

// Register metrics
metrics.register({ name: 'swarm_tasks_total', type: 'counter' });
metrics.register({ name: 'swarm_agent_load', type: 'gauge' });
metrics.register({ name: 'swarm_latency_seconds', type: 'histogram' });

// Record values
metrics.increment('swarm_tasks_total');
metrics.setGauge('swarm_agent_load', 0.75);
metrics.observeHistogram('swarm_latency_seconds', 0.234);

// Export for Prometheus
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.toPrometheus());
});
```

### Runtime Inspection

```typescript
import { SwarmInspector } from '@holoscript/core/swarm/analytics';

const inspector = new SwarmInspector();

// Track agents
inspector.updateAgent({ id: 'agent-1', state: 'active', health: 0.95 });

// Register health checks
inspector.registerHealthCheck({ name: 'db', status: 'healthy', latency: 5 });

// Debug logging
inspector.info('Module', 'Operation complete', { duration: 123 });

// Full inspection report
const report = inspector.inspect();
// { swarms, agents, relations, health, summary }
```

---

## Module Structure

New modules added in v3.2.0:

```
@holoscript/core/swarm
├── SwarmCoordinator, PSOEngine, ACOEngine
├── LeaderElection
├── CollectiveIntelligence, VotingRound, ContributionSynthesizer
├── SwarmManager, SwarmMembership, QuorumPolicy
├── spatial/
│   ├── FlockingBehavior
│   ├── FormationController
│   ├── ZoneClaiming
│   └── Vector3
├── messaging/
│   ├── SwarmEventBus
│   ├── BroadcastChannel
│   └── GossipProtocol
└── analytics/
    ├── SwarmMetrics
    └── SwarmInspector
```

---

## Recommended Upgrade Steps

### Step 1: Update Dependencies

```bash
npm install @holoscript/core@3.2.0
```

### Step 2: Test Existing Code

Your existing v3.4.x code should work without changes:

```bash
npm test
```

### Step 3: Identify Swarm Opportunities

Look for patterns that could benefit from swarms:

| v3.4.x Pattern       | v3.2.0 Replacement            |
| -------------------- | ----------------------------- |
| Manual agent loops   | `SwarmCoordinator.optimize()` |
| Hardcoded leader     | `LeaderElection`              |
| Sequential decisions | `CollectiveIntelligence`      |
| Individual messaging | `SwarmEventBus`               |
| Custom metrics       | `SwarmMetrics`                |

### Step 4: Migrate Incrementally

Start with one subsystem:

```typescript
// Before: Manual coordination
function assignTasks(agents, tasks) {
  const assignments = [];
  for (const task of tasks) {
    const best = agents.reduce((a, b) => (a.load < b.load ? a : b));
    assignments.push({ task, agent: best });
    best.load += task.cost;
  }
  return assignments;
}

// After: Swarm-optimized
async function assignTasks(agents, tasks) {
  const coordinator = new SwarmCoordinator();
  const result = await coordinator.optimize(agents, tasks, {
    fitnessFunction: (assignment) => {
      const loads = assignment.map((_, i) =>
        tasks.filter((_, j) => assignment[j] === i).reduce((sum, t) => sum + t.cost, 0)
      );
      return 1 - standardDeviation(loads); // Minimize load variance
    },
  });
  return result.bestSolution.map((agentIdx, taskIdx) => ({
    task: tasks[taskIdx],
    agent: agents[agentIdx],
  }));
}
```

### Step 5: Add Monitoring

Enable analytics for production visibility:

```typescript
import { SwarmMetrics, SwarmInspector } from '@holoscript/core/swarm/analytics';

export const metrics = new SwarmMetrics();
export const inspector = new SwarmInspector();

// Register core metrics
metrics.register({ name: 'swarm_operations_total', type: 'counter' });
metrics.register({ name: 'swarm_active_agents', type: 'gauge' });
metrics.register({ name: 'swarm_operation_duration', type: 'histogram' });

// Health endpoint
app.get('/health', (req, res) => {
  const health = inspector.getOverallHealth();
  res.status(health === 'healthy' ? 200 : 503).json({
    status: health,
    checks: inspector.getAllHealthChecks(),
  });
});
```

---

## Breaking Changes

**None.** v3.2.0 is fully backward-compatible with v3.4.x.

---

## Deprecations

**None.** No v3.4.x APIs are deprecated.

---

## Known Issues

1. **GossipProtocol with >1000 nodes** - Performance degrades; use sharded swarms
2. **LeaderElection clock skew** - Requires NTP synchronization for accuracy
3. **FormationController with obstacles** - Does not include pathfinding; combine with navigation

---

## Support

- API Reference: [docs/api/SWARM_API.md](api/SWARM_API.md)
- GitHub Issues: Report bugs or request features
- Discord: Community support channel

---

## Changelog Summary

### v3.2.0 (June 2026)

**Added:**

- SwarmCoordinator with PSO/ACO optimization
- LeaderElection (Raft-inspired)
- CollectiveIntelligence with contribution synthesis
- SwarmManager lifecycle control
- SwarmMembership join/leave protocol
- QuorumPolicy enforcement
- FlockingBehavior (boid algorithm)
- FormationController (geometric patterns)
- ZoneClaiming (territory control)
- SwarmEventBus (priority pub/sub)
- BroadcastChannel (named channels)
- GossipProtocol (epidemic messaging)
- SwarmMetrics (Prometheus export)
- SwarmInspector (debugging tools)

**Changed:**

- None

**Deprecated:**

- None

**Removed:**

- None

**Fixed:**

- None

**Security:**

- None
