# Swarm Module API Reference

**Version:** 3.2.0  
**Module:** `@holoscript/core/swarm`

---

## Table of Contents

1. [SwarmCoordinator](#swarmcoordinator)
2. [PSOEngine](#psoengine)
3. [ACOEngine](#acoengine)
4. [LeaderElection](#leaderelection)
5. [CollectiveIntelligence](#collectiveintelligence)
6. [VotingRound](#votinground)
7. [ContributionSynthesizer](#contributionsynthesizer)
8. [SwarmManager](#swarmmanager)
9. [SwarmMembership](#swarmmembership)
10. [QuorumPolicy](#quorumpolicy)
11. [Spatial Behaviors](#spatial-behaviors)
12. [Messaging](#messaging)
13. [Analytics](#analytics)

---

## SwarmCoordinator

Central coordinator for agent swarm optimization using PSO/ACO algorithms.

### Import

```typescript
import { SwarmCoordinator, AgentInfo, TaskInfo } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new SwarmCoordinator(config?: SwarmCoordinatorConfig)
```

| Parameter                     | Type                         | Default | Description                       |
| ----------------------------- | ---------------------------- | ------- | --------------------------------- |
| `config.algorithm`            | `'pso' \| 'aco' \| 'hybrid'` | `'pso'` | Optimization algorithm            |
| `config.maxIterations`        | `number`                     | `100`   | Maximum iterations                |
| `config.convergenceThreshold` | `number`                     | `0.001` | Stop when improvement < threshold |
| `config.populationSize`       | `number`                     | `30`    | Swarm population size             |

### Methods

#### `optimize(agents, tasks, options?)`

Optimize task assignment across agents.

```typescript
const result = await coordinator.optimize(agents, tasks, {
  fitnessFunction: (assignment) => calculateScore(assignment),
  constraints: [{ type: 'maxLoad', value: 0.8 }],
});
```

**Returns:** `Promise<OptimizationResult>`

| Property       | Type       | Description                 |
| -------------- | ---------- | --------------------------- |
| `bestSolution` | `number[]` | Agent index per task        |
| `bestFitness`  | `number`   | Solution quality (0-1)      |
| `iterations`   | `number`   | Iterations run              |
| `converged`    | `boolean`  | Whether convergence reached |

#### `addAgent(agent: AgentInfo)`

Register an agent with the coordinator.

#### `removeAgent(agentId: string)`

Remove an agent from optimization pool.

#### `getAgents()`

Returns all registered agents.

---

## PSOEngine

Particle Swarm Optimization engine for continuous optimization problems.

### Import

```typescript
import { PSOEngine, PSOConfig, PSOResult } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new PSOEngine(config?: PSOConfig)
```

| Parameter                     | Type     | Default   | Description           |
| ----------------------------- | -------- | --------- | --------------------- |
| `config.particleCount`        | `number` | `30`      | Number of particles   |
| `config.inertia`              | `number` | `0.729`   | Inertia weight        |
| `config.cognitive`            | `number` | `1.49445` | Cognitive coefficient |
| `config.social`               | `number` | `1.49445` | Social coefficient    |
| `config.maxIterations`        | `number` | `100`     | Maximum iterations    |
| `config.convergenceThreshold` | `number` | `0.001`   | Convergence threshold |

### Methods

#### `optimize(dimensions, fitnessFunction, bounds)`

Run PSO optimization.

```typescript
const result = await pso.optimize(
  3, // dimensions
  (position) => -rastrigin(position), // fitness (maximize)
  { min: [-5, -5, -5], max: [5, 5, 5] }
);
```

**Returns:** `PSOResult`

```typescript
interface PSOResult {
  bestPosition: number[];
  bestFitness: number;
  iterations: number;
  converged: boolean;
  history: { iteration: number; fitness: number }[];
}
```

---

## ACOEngine

Ant Colony Optimization for discrete/combinatorial problems.

### Import

```typescript
import { ACOEngine, ACOConfig } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new ACOEngine(config?: ACOConfig)
```

| Parameter                | Type     | Default | Description           |
| ------------------------ | -------- | ------- | --------------------- |
| `config.antCount`        | `number` | `20`    | Number of ants        |
| `config.alpha`           | `number` | `1.0`   | Pheromone importance  |
| `config.beta`            | `number` | `2.0`   | Heuristic importance  |
| `config.evaporationRate` | `number` | `0.5`   | Pheromone evaporation |
| `config.maxIterations`   | `number` | `100`   | Maximum iterations    |

### Methods

#### `optimize(graph, costFunction)`

Find optimal path through graph.

```typescript
const result = await aco.optimize(adjacencyMatrix, (path) => calculatePathCost(path));
```

---

## LeaderElection

Raft-inspired leader election for agent clusters.

### Import

```typescript
import { LeaderElection, LeaderElectionConfig } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new LeaderElection(nodeId: string, config?: LeaderElectionConfig)
```

| Parameter                  | Type           | Default                  | Description                   |
| -------------------------- | -------------- | ------------------------ | ----------------------------- |
| `config.heartbeatInterval` | `number`       | `150`                    | Heartbeat interval (ms)       |
| `config.electionTimeout`   | `{ min, max }` | `{ min: 300, max: 500 }` | Election timeout range        |
| `config.votingQuorum`      | `number`       | `0.5`                    | Quorum percentage for victory |

### Methods

#### `addPeer(peerId: string)`

Add a peer to the election cluster.

#### `removePeer(peerId: string)`

Remove a peer from the cluster.

#### `start()`

Start the election process.

#### `stop()`

Stop the election and heartbeat timers.

#### `getRole()`

Returns current role: `'leader' | 'follower' | 'candidate'`

#### `getLeaderId()`

Returns the current leader's ID (or `undefined`).

### Events

```typescript
election.on('elected', (leaderId) => console.log(`New leader: ${leaderId}`));
election.on('roleChanged', (role) => console.log(`Role changed: ${role}`));
election.on('heartbeat', () => console.log('Received heartbeat'));
```

---

## CollectiveIntelligence

Manage collaborative decision-making sessions.

### Import

```typescript
import { CollectiveIntelligence, CollectiveIntelligenceConfig } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new CollectiveIntelligence(config?: CollectiveIntelligenceConfig)
```

| Parameter                | Type                               | Default   | Description          |
| ------------------------ | ---------------------------------- | --------- | -------------------- |
| `config.sessionTimeout`  | `number`                           | `300000`  | Session timeout (ms) |
| `config.minParticipants` | `number`                           | `2`       | Minimum participants |
| `config.synthesisMode`   | `'merge' \| 'vote' \| 'consensus'` | `'merge'` | Synthesis strategy   |

### Methods

#### `createSession(topic, description, initiatorId)`

Create a new collaborative session.

```typescript
const session = await collective.createSession(
  'Code Review',
  'Review PR #123 for security issues',
  'agent-lead'
);
```

#### `joinSession(sessionId, participantId)`

Join an existing session.

#### `contribute(sessionId, participantId, contribution)`

Add a contribution to the session.

```typescript
await collective.contribute(session.id, 'agent-1', {
  type: 'evidence',
  content: 'Found SQL injection vulnerability on line 45',
  confidence: 0.95,
  references: ['OWASP-A03'],
});
```

**Contribution Types:**

- `hypothesis` - Proposed explanation or theory
- `evidence` - Supporting or refuting data
- `solution` - Proposed resolution

#### `synthesize(sessionId)`

Synthesize all contributions into a final result.

```typescript
const result = await collective.synthesize(session.id);
// { consensus: true, merged: [...], conflicts: [], confidence: 0.87 }
```

---

## VotingRound

Rank contributions through collective voting.

### Import

```typescript
import { VotingRound, Vote, VotingResult } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new VotingRound(config?: VotingRoundConfig)
```

### Methods

#### `start(contributions, voters)`

Start a voting round.

#### `vote(voterId, votes)`

Cast votes.

```typescript
round.vote('agent-1', [
  { contributionId: 'c1', score: 5 },
  { contributionId: 'c2', score: 3 },
]);
```

#### `finalize()`

End voting and calculate results.

---

## ContributionSynthesizer

Merge compatible contributions from collective sessions.

### Import

```typescript
import { ContributionSynthesizer, SynthesisResult } from '@holoscript/core/swarm';
```

### Methods

#### `synthesize(contributions)`

Merge contributions into unified result.

```typescript
const result = synthesizer.synthesize(contributions);
// { merged: [...], conflicts: [...], confidence: 0.82 }
```

#### `detectConflicts(contributions)`

Identify contradictory contributions.

---

## SwarmManager

Lifecycle management for agent swarms.

### Import

```typescript
import { SwarmManager, SwarmInfo, CreateSwarmRequest } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new SwarmManager(config?: SwarmManagerConfig)
```

### Methods

#### `createSwarm(request: CreateSwarmRequest)`

Form a new swarm.

```typescript
const swarm = await manager.createSwarm({
  name: 'DataProcessingSwarm',
  objective: 'Process incoming data streams',
  minMembers: 3,
  maxMembers: 10,
});
```

#### `disbandSwarm(swarmId, options?)`

Gracefully disband a swarm.

```typescript
await manager.disbandSwarm(swarm.id, {
  redistributeTasks: true,
  notifyMembers: true,
});
```

#### `getSwarm(swarmId)`

Get swarm information.

#### `getAllSwarms()`

List all active swarms.

### Events

```typescript
manager.on('swarmCreated', (swarm) => ...);
manager.on('swarmDisbanded', (swarmId) => ...);
manager.on('memberJoined', (swarmId, memberId) => ...);
manager.on('memberLeft', (swarmId, memberId) => ...);
```

---

## SwarmMembership

Join/leave protocol for swarm members.

### Import

```typescript
import { SwarmMembership, MemberInfo } from '@holoscript/core/swarm';
```

### Methods

#### `join(swarmId, member: MemberInfo)`

Request to join a swarm.

```typescript
await membership.join('swarm-1', {
  id: 'agent-5',
  capabilities: ['analyze', 'render'],
  load: 0.3,
});
```

#### `leave(swarmId, memberId, reason?)`

Leave a swarm.

#### `getMembers(swarmId)`

Get all members of a swarm.

#### `updateStatus(swarmId, memberId, status)`

Update member status (health, load, etc.).

---

## QuorumPolicy

Minimum size enforcement for swarms.

### Import

```typescript
import { QuorumPolicy, QuorumConfig, QuorumStatus } from '@holoscript/core/swarm';
```

### Constructor

```typescript
new QuorumPolicy(config: QuorumConfig)
```

| Parameter              | Type     | Description                 |
| ---------------------- | -------- | --------------------------- |
| `config.minMembers`    | `number` | Minimum members required    |
| `config.minHealthy`    | `number` | Minimum healthy members     |
| `config.quorumPercent` | `number` | Percentage for quorum (0-1) |

### Methods

#### `checkQuorum(members: MemberInfo[])`

Check if quorum is met.

```typescript
const status = policy.checkQuorum(members);
// { hasQuorum: true, current: 5, required: 3, healthy: 5 }
```

#### `canOperate(members: MemberInfo[])`

Returns boolean for quick quorum check.

---

## Spatial Behaviors

### FlockingBehavior

Boid-style flocking (separation, alignment, cohesion).

```typescript
import { FlockingBehavior, FlockingConfig } from '@holoscript/core/swarm/spatial';

const flocking = new FlockingBehavior({
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  maxSpeed: 5.0,
  neighborRadius: 10.0,
});

// Update each frame
const velocities = flocking.calculate(agents);
```

### FormationController

Geometric formation patterns.

```typescript
import { FormationController } from '@holoscript/core/swarm/spatial';

const formation = new FormationController();

// Set pattern
formation.setFormation('wedge', { spacing: 2.0, leaderId: 'agent-1' });
formation.setFormation('circle', { radius: 5.0, center: { x: 0, y: 0, z: 0 } });
formation.setFormation('line', { direction: { x: 1, y: 0, z: 0 }, spacing: 1.5 });

// Get target positions
const targets = formation.getTargetPositions(agents);
```

**Formation Types:** `line`, `circle`, `wedge`, `grid`, `custom`

### ZoneClaiming

Territory control with conflict resolution.

```typescript
import { ZoneClaiming, Zone, ClaimResult } from '@holoscript/core/swarm/spatial';

const zones = new ZoneClaiming();

// Claim a zone
const result = await zones.claim('agent-1', {
  id: 'zone-a',
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
});

// Check ownership
const owner = zones.getOwner('zone-a');

// Resolve conflicts
zones.resolveConflict('zone-a', ['agent-1', 'agent-2'], 'priority');
```

### Vector3

3D vector math utilities.

```typescript
import { Vector3 } from '@holoscript/core/swarm/spatial';

const v1 = new Vector3(1, 2, 3);
const v2 = new Vector3(4, 5, 6);

v1.add(v2); // Vector3(5, 7, 9)
v1.subtract(v2); // Vector3(-3, -3, -3)
v1.multiply(2); // Vector3(2, 4, 6)
v1.normalize(); // Unit vector
v1.length(); // Magnitude
v1.distanceTo(v2); // Distance between points
Vector3.dot(v1, v2); // Dot product
Vector3.cross(v1, v2); // Cross product
```

---

## Messaging

### SwarmEventBus

Pub/sub event bus with priority queuing.

```typescript
import { SwarmEventBus, EventPriority } from '@holoscript/core/swarm/messaging';

const bus = new SwarmEventBus();

// Subscribe
const subId = bus.subscribe('swarm.*', (event) => {
  console.log(event.type, event.payload);
});

// Publish
await bus.publish({
  type: 'swarm.taskAssigned',
  source: 'coordinator',
  payload: { taskId: 't1', agentId: 'a1' },
  priority: 'high',
});

// Unsubscribe
bus.unsubscribe(subId);
```

**Priority Levels:** `critical` > `high` > `normal` > `low`

### BroadcastChannel

Named channels with acknowledgments.

```typescript
import { BroadcastChannel, ChannelManager } from '@holoscript/core/swarm/messaging';

const channel = new BroadcastChannel('leader-updates', {
  requireAck: true,
  historySize: 100,
});

// Subscribe
channel.subscribe('agent-1', (msg) => {
  channel.acknowledge(msg.id, 'agent-1');
});

// Broadcast
await channel.broadcast('leader', { type: 'heartbeat', timestamp: Date.now() });

// Replay history for late joiners
const history = channel.replayHistory('agent-2', { since: Date.now() - 60000 });
```

### GossipProtocol

Epidemic-style message propagation.

```typescript
import { GossipProtocol, AntiEntropySync } from '@holoscript/core/swarm/messaging';

const gossip = new GossipProtocol('node-1', {
  fanout: 3,
  gossipInterval: 1000,
  maxTTL: 30000,
  maxHops: 10,
});

gossip.addPeer('node-2', 'ws://node2:8080');
gossip.addPeer('node-3', 'ws://node3:8080');

gossip.subscribe('state-update', (msg) => {
  console.log('Received via gossip:', msg);
});

gossip.publish('state-update', { key: 'value' });
gossip.start();
```

---

## Analytics

### SwarmMetrics

Real-time performance metrics with Prometheus export.

```typescript
import { SwarmMetrics } from '@holoscript/core/swarm/analytics';

const metrics = new SwarmMetrics();

// Register metrics
metrics.register({ name: 'tasks_completed', type: 'counter', description: 'Completed tasks' });
metrics.register({ name: 'agent_load', type: 'gauge', description: 'Agent load' });
metrics.register({ name: 'response_time', type: 'histogram', description: 'Response time' });
metrics.register({ name: 'request_size', type: 'summary', description: 'Request sizes' });

// Record values
metrics.increment('tasks_completed');
metrics.setGauge('agent_load', 0.75);
metrics.observeHistogram('response_time', 0.234);
metrics.observeSummary('request_size', 1024);

// Query
metrics.getCounter('tasks_completed'); // 1
metrics.getGauge('agent_load'); // 0.75
metrics.getHistogram('response_time'); // { count, sum, counts, boundaries }
metrics.getSummary('request_size'); // { p50, p75, p90, p95, p99, count, sum }

// Export
console.log(metrics.toPrometheus());
```

### SwarmInspector

Debugging and inspection tools.

```typescript
import { SwarmInspector } from '@holoscript/core/swarm/analytics';

const inspector = new SwarmInspector({ maxEvents: 1000 });

// Track agents
inspector.updateAgent({
  id: 'agent-1',
  swarmId: 'swarm-1',
  state: 'active',
  health: 0.95,
  load: 0.4,
  lastActive: Date.now(),
  position: { x: 10, y: 0, z: 5 },
  properties: {},
});

// Track swarms
inspector.updateSwarm({
  id: 'swarm-1',
  name: 'ProcessingSwarm',
  memberCount: 5,
  leaderId: 'agent-1',
  state: 'active',
  createdAt: Date.now(),
  properties: {},
});

// Track relations
inspector.addRelation({
  sourceId: 'agent-1',
  targetId: 'agent-2',
  type: 'neighbor',
  strength: 0.8,
});

// Health checks
inspector.registerHealthCheck({
  name: 'coordinator',
  status: 'healthy',
  latency: 5,
  lastCheck: Date.now(),
});

// Debug logging
inspector.info('SwarmManager', 'Swarm created', { swarmId: 'swarm-1' });
inspector.warn('LeaderElection', 'Election timeout', { nodeId: 'node-2' });
inspector.error('TaskAssigner', 'Assignment failed', { error: 'No agents available' });

// Get event log
const errors = inspector.getEventLog({ level: 'error', limit: 10 });

// Full inspection
const report = inspector.inspect();
// {
//   timestamp, swarms, agents, relations, health,
//   summary: { totalSwarms, totalAgents, healthyAgents, averageLoad, warnings }
// }

// Visualization graph
const graph = inspector.toGraph();
// { nodes: [...], edges: [...] }
```

---

## Type Exports

All types are re-exported from the main module:

```typescript
import {
  // Coordinator
  AgentInfo,
  TaskInfo,
  OptimizationResult,

  // PSO/ACO
  PSOConfig,
  PSOResult,
  Particle,
  ACOConfig,
  ACOResult,

  // Leader Election
  LeaderElectionConfig,
  ElectionRole,
  ElectionState,

  // Collective Intelligence
  CollectiveIntelligenceConfig,
  ContributionType,
  Contribution,
  SynthesisResult,

  // Voting
  Vote,
  VotingResult,
  VotingRoundConfig,

  // Swarm Lifecycle
  SwarmInfo,
  CreateSwarmRequest,
  DisbandOptions,
  MemberInfo,
  JoinRequest,
  LeaveRequest,
  QuorumConfig,
  QuorumStatus,

  // Spatial
  Vector3,
  FlockingConfig,
  FormationPattern,
  Zone,
  ClaimResult,

  // Messaging
  ISwarmEvent,
  EventPriority,
  IChannelMessage,
  IGossipMessage,

  // Analytics
  MetricType,
  IMetricStats,
  IAgentSnapshot,
  ISwarmSnapshot,
  IHealthCheck,
  IInspectionResult,
} from '@holoscript/core/swarm';
```

---

## Error Handling

All async operations throw typed errors:

```typescript
import { SwarmError, SwarmErrorCode } from '@holoscript/core/swarm';

try {
  await manager.createSwarm(request);
} catch (error) {
  if (error instanceof SwarmError) {
    switch (error.code) {
      case SwarmErrorCode.QUORUM_NOT_MET:
        // Handle quorum failure
        break;
      case SwarmErrorCode.LEADER_ELECTION_TIMEOUT:
        // Handle election timeout
        break;
      case SwarmErrorCode.OPTIMIZATION_FAILED:
        // Handle optimization failure
        break;
    }
  }
}
```

---

## Best Practices

1. **Initialize coordinator before adding agents** - Register all agents before starting optimization
2. **Use quorum policies** - Always configure minimum members for reliability
3. **Monitor health checks** - React to degraded/unhealthy states
4. **Set appropriate timeouts** - Balance responsiveness with network conditions
5. **Use gossip for large swarms** - Direct broadcast doesn't scale past ~50 agents
6. **Export metrics** - Enable Prometheus scraping for production monitoring
