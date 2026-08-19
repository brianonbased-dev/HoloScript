# Lesson 3.8: Consensus Mechanisms

In this lesson, you'll learn how agents reach agreement through distributed consensus in HoloScript v3.1.

## Learning Objectives

By the end of this lesson, you will:

- Understand consensus protocols (majority, Raft)
- Implement distributed state management
- Handle network partitions gracefully
- Build fault-tolerant multi-agent systems

## Why Consensus?

When multiple agents need to agree on shared state:

```
┌─────────────────────────────────────────────────────────────┐
│                     Consensus Problem                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Agent A: "Value is 5"                                     │
│   Agent B: "Value is 7"      →   What's the REAL value?     │
│   Agent C: "Value is 5"                                     │
│                                                              │
│   ✅ Consensus: All agree value = 5 (2 of 3 majority)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## The ConsensusTrait

Add consensus capabilities to agents:

```holoscript
composition "DistributedVoting" {
  template "VotingAgent" {
    @agent {
      type: "voter"
      capabilities: ["voting", "proposal"]
    }

    @consensus {
      mechanism: "simple_majority"
      timeout: 5000
      quorum: 0.51
    }

    state {
      proposals: []
      votes: {}
    }

    action propose(key, value) {
      return consensus.propose(key, value)
    }

    action vote(proposalId, vote) {
      return consensus.vote(proposalId, vote)
    }

    on "consensus:accepted"(proposal) {
      applyState(proposal.key, proposal.value)
    }
  }

  object "Voter1" using "VotingAgent" {}
  object "Voter2" using "VotingAgent" {}
  object "Voter3" using "VotingAgent" {}
}
```

## Simple Majority Consensus

Quick voting for non-critical decisions:

```typescript
import { ConsensusTrait, createConsensusTrait } from '@holoscript/core';

// Create consensus trait for an entity
const consensus = createConsensusTrait('agent-001', {
  mechanism: 'simple_majority',
  timeout: 5000,
});

// Start and connect to cluster
consensus.start();
consensus.addNode({ id: 'agent-002', address: 'localhost:5002' });
consensus.addNode({ id: 'agent-003', address: 'localhost:5003' });

// Propose a value
const accepted = await consensus.propose('player_score', 100);

if (accepted) {
  console.log('Proposal accepted by majority');
} else {
  console.log('Proposal rejected');
}

// Get current value
const score = consensus.get<number>('player_score');
console.log(`Current score: ${score}`);

// Subscribe to changes
consensus.subscribe('player_score', (newValue) => {
  console.log(`Score updated to: ${newValue}`);
});
```

## Raft Consensus

Stronger guarantees with leader election:

```typescript
import { ConsensusTrait } from '@holoscript/core';

// Create Raft consensus
const raft = new ConsensusTrait('node-001', {
  mechanism: 'raft',
  timeout: 3000,
  heartbeatInterval: 1000,
  electionTimeout: [3000, 5000], // Random range
});

// Set up message transport
raft.setMessageSender((toNodeId, message) => {
  network.send(toNodeId, message);
});

// Handle incoming messages
network.on('message', (fromNodeId, message) => {
  raft.handleMessage(fromNodeId, message);
});

// Start and join cluster
raft.start();
raft.addNode({ id: 'node-002', address: 'host2:5000' });
raft.addNode({ id: 'node-003', address: 'host3:5000' });

// Events
raft.on('leader:elected', (leaderId) => {
  console.log(`New leader: ${leaderId}`);

  if (leaderId === raft.getNodeId()) {
    console.log('I am the leader!');
  }
});

raft.on('state:changed', (key, newValue, oldValue) => {
  console.log(`${key}: ${oldValue} → ${newValue}`);
});

// Only leader can propose
if (raft.isLeader()) {
  const result = await raft.propose('config', { maxPlayers: 10 });
  console.log(`Proposal ${result.accepted ? 'committed' : 'failed'}`);
}
```

## Proposal Results

Get detailed results from proposals:

```typescript
const result = await consensus.proposeWithResult('setting', 'newValue');

console.log(`
  Proposal ID: ${result.proposalId}
  Accepted: ${result.accepted}
  Key: ${result.key}
  Votes For: ${result.votes.for}
  Votes Against: ${result.votes.against}
  Total Votes: ${result.votes.total}
  Quorum Met: ${result.votes.for >= result.quorumRequired}
`);

if (!result.accepted && result.error) {
  console.error(`Rejected: ${result.error}`);
}
```

## Cluster Management

Manage consensus cluster membership:

```typescript
// Add a new node
consensus.addNode({
  id: 'node-004',
  address: 'host4:5000',
  metadata: { region: 'us-west' },
});

// Remove a node
consensus.removeNode('node-002');

// Get all nodes
const nodes = consensus.getNodes();
nodes.forEach((node) => {
  console.log(`${node.id} at ${node.address}`);
});

// Get current leader
const leader = consensus.getLeader();
if (leader) {
  console.log(`Leader: ${leader.id}`);
}

// Check leader status
if (consensus.isLeader()) {
  performLeaderDuties();
}
```

## Handling Network Partitions

React to network issues:

```typescript
consensus.on('node:unreachable', (nodeId) => {
  console.warn(`Lost connection to ${nodeId}`);

  // Check if we still have quorum
  const activeNodes = consensus.getNodes().filter((n) => n.connected);
  if (activeNodes.length < Math.ceil(consensus.getNodes().length / 2)) {
    console.error('Lost quorum - entering read-only mode');
    enterReadOnlyMode();
  }
});

consensus.on('node:reconnected', (nodeId) => {
  console.log(`${nodeId} reconnected`);
  syncState(nodeId);
});

consensus.on('partition:detected', (partition) => {
  console.warn(`Partition detected: ${partition.side}`);
});

consensus.on('partition:healed', () => {
  console.log('Partition healed - resuming normal operation');
});
```

## Complete Example: Distributed Game State

```holoscript
composition "MultiplayerGame" {
  config {
    consensus: {
      mechanism: "raft"
      nodes: 5
      quorum: 3
    }
  }

  // Game state manager
  template "GameStateManager" {
    @consensus {
      mechanism: "raft"
      timeout: 3000
    }

    state {
      game_state: "lobby"
      players: []
      current_round: 0
      scores: {}
    }

    action addPlayer(playerId) {
      const players = consensus.get("players") || []
      await consensus.propose("players", [...players, playerId])
    }

    action updateScore(playerId, points) {
      const scores = consensus.get("scores") || {}
      await consensus.propose("scores", {
        ...scores,
        [playerId]: (scores[playerId] || 0) + points
      })
    }

    action startGame() {
      if (!consensus.isLeader()) {
        throw new Error("Only leader can start game")
      }
      await consensus.propose("game_state", "playing")
      await consensus.propose("current_round", 1)
    }

    on "consensus:accepted"(result) {
      if (result.key == "game_state") {
        broadcast("game_state_changed", result.value)
      }
    }
  }

  // Player agent
  template "PlayerAgent" {
    @agent {
      type: "player"
    }

    on "game_state_changed"(state) {
      if (state == "playing") {
        startPlaying()
      }
    }

    action submitScore(points) {
      gameState.updateScore(this.id, points)
    }
  }

  // Game state singleton
  object "GameState" using "GameStateManager" {
    @singleton
  }

  // Player instances
  object "Player1" using "PlayerAgent" {}
  object "Player2" using "PlayerAgent" {}
  object "Player3" using "PlayerAgent" {}
}
```

## Consensus Patterns

### Optimistic Updates

```typescript
// Apply change locally, then sync
function optimisticUpdate(key: string, value: any) {
  // Apply immediately
  localState[key] = value;
  updateUI();

  // Then reach consensus
  consensus.propose(key, value).then((accepted) => {
    if (!accepted) {
      // Rollback on rejection
      localState[key] = consensus.get(key);
      updateUI();
    }
  });
}
```

### Compare and Swap

```typescript
async function compareAndSwap(key: string, expected: any, newValue: any) {
  const current = consensus.get(key);

  if (current !== expected) {
    return false; // Value changed
  }

  return consensus.propose(key, newValue);
}
```

### Distributed Lock

```typescript
async function acquireLock(resource: string, timeout: number) {
  const lockKey = `lock:${resource}`;
  const lockValue = { holder: consensus.getNodeId(), expires: Date.now() + timeout };

  const acquired = await consensus.propose(lockKey, lockValue);

  if (acquired) {
    // Set auto-release
    setTimeout(() => releaseLock(resource), timeout);
  }

  return acquired;
}

async function releaseLock(resource: string) {
  const lockKey = `lock:${resource}`;
  const current = consensus.get(lockKey);

  if (current?.holder === consensus.getNodeId()) {
    await consensus.propose(lockKey, null);
  }
}
```

## Debugging Consensus

Monitor consensus state:

```typescript
// Get Raft debug state
const debug = consensus.getDebugState();
console.log(`
  Term: ${debug.currentTerm}
  State: ${debug.role}
  Leader: ${debug.leaderId}
  Commit Index: ${debug.commitIndex}
  Log Length: ${debug.logLength}
`);

// Enable verbose logging
consensus.on('vote:requested', (from, term) => {
  console.log(`Vote requested by ${from} for term ${term}`);
});

consensus.on('vote:granted', (to, term) => {
  console.log(`Vote granted to ${to} for term ${term}`);
});

consensus.on('log:appended', (entry) => {
  console.log(`Log entry: ${entry.term}/${entry.index} - ${entry.key}`);
});
```

## Performance Tips

```typescript
const consensus = new ConsensusTrait('node-001', {
  mechanism: 'raft',

  // Batch small updates
  batchUpdates: true,
  batchWindow: 50, // ms

  // Compress large state
  compression: true,

  // Snapshot for faster recovery
  snapshotInterval: 1000, // entries

  // Tune timeouts for network
  heartbeatInterval: 500,
  electionTimeout: [1500, 3000],
});
```

## Exercise: Build a Distributed Counter

Create a fault-tolerant counter service:

1. Multiple nodes can increment/decrement
2. All nodes show same value
3. Survives single node failure
4. Handles network partitions
5. Supports atomic batch operations

## Summary

In this lesson you learned:

- **Simple Majority**: Quick voting for non-critical decisions
- **Raft Consensus**: Strong consistency with leader election
- **Cluster Management**: Adding/removing nodes dynamically
- **Partition Handling**: Graceful degradation during failures
- **Patterns**: Optimistic updates, CAS, distributed locks

## Next Steps

- [Level 3 Index](./index.md)
