# Spatial Agent Communication Stack

**Three-layer communication protocol for multi-agent VR world creation with 90fps performance targeting.**

## Overview

The Spatial Agent Communication Stack enables multiple specialized agents (terrain, assets, physics, lighting, audio) to collaborate in real-time VR world creation while maintaining sustained 90fps performance. The system uses three distinct communication layers, each optimized for different types of coordination:

### Layer 1: Real-Time Layer (UDP/WebRTC)
- **Purpose**: Ultra-low latency position synchronization and frame budget coordination
- **Protocol**: Binary protocol over UDP or WebRTC DataChannels
- **Latency**: <1ms target
- **Rate**: 90 messages/second per agent
- **Use Cases**: Position sync, frame budget status, spatial conflict alerts

### Layer 2: Coordination Layer (A2A over HTTP/2)
- **Purpose**: Agent-to-agent task coordination and resource management
- **Protocol**: JSON-RPC over HTTP/2
- **Features**: Request/response with acknowledgments, retry with exponential backoff
- **Use Cases**: Task assignment, spatial claims, conflict resolution, resource requests

### Layer 3: Metadata Layer (MCP)
- **Purpose**: High-level world management and tool access
- **Protocol**: Model Context Protocol
- **Use Cases**: World creation, agent registry queries, performance metrics, exports

## Quick Start

### Installation

```typescript
import { SpatialCommClient } from '@holoscript/core/agents/spatial-comms';
```

### Basic Usage

```typescript
// Create unified client
const client = new SpatialCommClient('agent-001');

// Initialize all three layers
await client.init();

// Layer 1: Sync position at 90fps
await client.syncPosition(
  [x, y, z],        // position
  [qx, qy, qz, qw], // rotation (quaternion)
  [sx, sy, sz]      // scale
);

// Layer 2: Assign task to another agent
await client.assignTask('terrain-agent', {
  task_id: 'terrain-001',
  task_type: 'terrain',
  priority: 'high',
  frame_budget_ms: 8, // 8ms per frame
  spatial_region: {
    center: [0, 0, 0],
    size: [1000, 100, 1000]
  }
});

// Layer 3: Create world
const { world_id } = await client.createWorld({
  name: 'My VR World',
  dimensions: { width: 1000, height: 500, depth: 1000 },
  target_fps: 90,
  max_agents: 10
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SpatialCommClient                      │
│           (Unified Three-Layer Interface)               │
└───────────┬──────────────┬──────────────┬──────────────┘
            │              │              │
    ┌───────▼──────┐ ┌────▼────────┐ ┌──▼──────────────┐
    │  Layer 1     │ │  Layer 2    │ │  Layer 3        │
    │  Real-Time   │ │  A2A Coord  │ │  MCP Metadata   │
    │  UDP/WebRTC  │ │  HTTP/2     │ │  High-Level     │
    └──────────────┘ └─────────────┘ └─────────────────┘
         90fps          Task Coord       World Mgmt
        <1ms latency    Spatial Claims   Agent Registry
```

### Integration with Agent Framework

The stack integrates seamlessly with the existing HoloScript agent system:

- **Phase 1 (Agent Identity)**: All messages include authenticated agent IDs
- **Phase 2 (Graceful Degradation)**: Frame budget tracking automatically reduces quality when over budget
- **Phase 0-6 (uAA2++)**: Compatible with all 7-phase agent protocol operations

## Layer 1: Real-Time Communication

### Binary Protocol

Layer 1 uses a highly optimized binary protocol for minimal overhead:

```
Header Structure (12 bytes):
┌──────────┬──────────────┬───────────────┬──────────┐
│ Type (1) │ AgentID Len  │ Timestamp (8) │ Rsvd (2) │
│          │      (1)     │  (microsec)   │          │
└──────────┴──────────────┴───────────────┴──────────┘

Position Sync Body (40 bytes):
┌────────────┬────────────────┬────────────┬───────────┐
│ Agent ID   │ Position (12)  │ Rotation   │ Scale     │
│ (variable) │   (3 floats)   │  (16)      │  (12)     │
│            │                │ (4 floats) │ (3 floats)│
└────────────┴────────────────┴────────────┴───────────┘
```

### Message Types

#### Position Sync
```typescript
await client.syncPosition(
  [x, y, z],        // Position
  [qx, qy, qz, qw], // Rotation (quaternion)
  [sx, sy, sz],     // Scale
  [vx, vy, vz]      // Velocity (optional for prediction)
);
```

#### Frame Budget
```typescript
// Automatically sent by recordFrameTime()
client.recordFrameTime(frameTimeMs);

// Manual sending
await client.sendFrameBudget();
```

#### Spatial Conflict Alert
```typescript
// Automatically emitted when conflicts detected
client.on('layer1:message', (msg) => {
  if (msg.type === 'spatial_conflict') {
    console.log('Conflict:', msg.conflict_type);
    console.log('Severity:', msg.severity);
    console.log('Suggested action:', msg.suggested_action);
  }
});
```

### Performance Characteristics

| Metric | Target | Typical |
|--------|--------|---------|
| Latency | <1ms | 0.5-0.8ms |
| Message Rate | 90 msg/s | 90 msg/s |
| Message Size | <512 bytes | 52-72 bytes |
| Bandwidth | ~4.5 KB/s per agent | ~6 KB/s per agent |

## Layer 2: A2A Coordination

### Task Assignment

```typescript
const task: TaskSpec = {
  task_id: 'terrain-001',
  task_type: 'terrain',
  priority: 'high',
  parameters: {
    algorithm: 'perlin_noise',
    resolution: 'high'
  },
  spatial_region: {
    center: [0, 0, 0],
    size: [1000, 100, 1000]
  },
  frame_budget_ms: 8, // 8ms per frame
  dependencies: ['prep-001'], // Wait for prep task
  deadline: Date.now() + 60000 // 1 minute deadline
};

await client.assignTask('terrain-agent', task);
```

### Spatial Claims

```typescript
// Claim spatial region
await client.claimSpatialRegion(
  'claim-001',          // Claim ID
  {
    min: [-100, -10, -100],
    max: [100, 10, 100]
  },
  'high',              // Priority
  30000,               // Duration (30 seconds)
  true                 // Exclusive
);

// Check for conflicts
client.on('layer2:spatial_conflict', ({ claim, conflicts }) => {
  console.log('Conflict detected:', conflicts.length);

  // Resolve conflict
  await client.resolveConflict(
    'conflict-001',
    ['agent-001', 'agent-002'],
    'priority_based'   // Resolution strategy
  );
});
```

### Resource Management

```typescript
// Request resource
await client.requestResource(
  'mesh-library',
  'mesh',
  undefined,  // Amount (optional)
  'high'      // Priority
);

// Use resource...

// Release when done
await client.releaseResource('mesh-library');
```

### Retry and Reliability

Layer 2 automatically retries failed requests with exponential backoff:

```typescript
const config = {
  layer2: {
    maxRetries: 3,              // Retry 3 times
    retryBackoffBase: 100,      // 100ms, 200ms, 400ms
    timeout: 5000,              // 5 second timeout
    requireAck: true,           // Require acknowledgments
    enableBatching: true,       // Batch requests
    batchSize: 10               // Batch up to 10 requests
  }
};

const client = new SpatialCommClient('agent-001', config);
```

## Layer 3: MCP Metadata

### World Creation

```typescript
const worldSpec: WorldSpec = {
  name: 'My VR World',
  template: 'playground',
  dimensions: {
    width: 1000,
    height: 500,
    depth: 1000
  },
  target_fps: 90,
  max_agents: 10,
  features: {
    terrain: true,
    physics: true,
    lighting: true,
    audio: true,
    networking: true
  },
  agent_roles: [
    {
      role: 'terrain',
      agent_type: 'terrain-generator',
      spatial_region: {
        center: [0, 0, 0],
        size: [1000, 100, 1000]
      }
    },
    {
      role: 'assets',
      agent_type: 'asset-placer',
      spatial_region: {
        center: [0, 50, 0],
        size: [1000, 100, 1000]
      }
    }
  ]
};

const { world_id, status } = await client.createWorld(worldSpec);
```

### World Status

```typescript
const status = await client.getWorldStatus(world_id);

console.log('World:', status.name);
console.log('Status:', status.status);
console.log('FPS:', status.performance.current_fps);
console.log('Active agents:', status.active_agents.length);
console.log('Conflicts:', status.spatial_conflicts);
console.log('CPU:', status.resource_utilization.cpu_percent);
```

### Performance Metrics

```typescript
const metrics = await client.getPerformanceMetrics({
  world_id: 'world-001',
  agent_id: 'agent-001' // Optional: filter by agent
});

// System metrics
console.log('System FPS:', metrics.system.total_fps);
console.log('Target FPS:', metrics.system.target_fps);
console.log('Frame time (avg):', metrics.system.frame_time_avg_ms);
console.log('Frame time (max):', metrics.system.frame_time_max_ms);
console.log('Quality level:', metrics.system.quality_level);

// Agent metrics
for (const agent of metrics.agents) {
  console.log(`Agent ${agent.agent_id}:`);
  console.log(`  Role: ${agent.role}`);
  console.log(`  Frame time: ${agent.frame_time_avg_ms}ms`);
  console.log(`  Messages sent: ${agent.messages_sent}`);
  console.log(`  Conflicts: ${agent.spatial_conflicts}`);
}
```

### World Export

```typescript
// Export to various formats
const gltf = await client.exportWorld('gltf');
const fbx = await client.exportWorld('fbx');
const usdz = await client.exportWorld('usdz');

console.log('Download:', gltf.url);
console.log('Size:', gltf.size, 'bytes');
```

## Frame Budget & Graceful Degradation

The system automatically tracks frame budget and reduces quality when necessary to maintain 90fps:

```typescript
// Record frame time (typically called each frame)
const frameStart = performance.now();

// Do work...

const frameTime = performance.now() - frameStart;
client.recordFrameTime(frameTime);

// Get budget stats
const stats = client.getFrameBudgetStats();

console.log('Target FPS:', stats.targetFps);
console.log('Current FPS:', stats.currentFps);
console.log('Avg frame time:', stats.avgFrameTimeMs, 'ms');
console.log('Max frame time:', stats.maxFrameTimeMs, 'ms');
console.log('Budget remaining:', stats.budgetRemainingMs, 'ms');
console.log('Quality level:', stats.qualityLevel);
console.log('Within budget:', stats.withinBudget);
```

### Quality Levels

The system uses four quality levels that adjust automatically:

| Quality Level | Frame Time Threshold | Adjustments |
|---------------|----------------------|-------------|
| **High** | ≤ 11.1ms (90fps) | Full detail |
| **Medium** | 11.1-13.3ms (75-90fps) | Reduced detail |
| **Low** | 13.3-16.7ms (60-75fps) | Minimal detail |
| **Minimal** | >16.7ms (<60fps) | Bare essentials |

### Budget-Aware Work

Agents should adjust their work based on the current quality level:

```typescript
async function generateTerrain() {
  const stats = client.getFrameBudgetStats();

  const chunkSize = {
    high: 100,
    medium: 50,
    low: 25,
    minimal: 10
  }[stats.qualityLevel];

  for (let i = 0; i < chunkSize; i++) {
    // Generate terrain chunk
    await generateChunk(i);

    // Record frame time after each chunk
    const frameTime = performance.now() - frameStart;
    client.recordFrameTime(frameTime);
  }
}
```

## Events

All three layers emit events for monitoring and debugging:

```typescript
// Layer 1 events
client.on('layer1:message', (msg) => console.log('L1:', msg));
client.on('layer1:latency_warning', ({ latency }) => {
  console.warn('High latency:', latency, 'ms');
});

// Layer 2 events
client.on('layer2:message', (msg) => console.log('L2:', msg));
client.on('layer2:spatial_conflict', ({ claim, conflicts }) => {
  console.warn('Spatial conflict:', conflicts.length);
});
client.on('layer2:retry', ({ message, attempt }) => {
  console.log('Retry attempt:', attempt, 'for', message.type);
});

// Layer 3 events
client.on('layer3:command_success', ({ command, response }) => {
  console.log('Command success:', command);
});
client.on('layer3:command_error', ({ command, error }) => {
  console.error('Command error:', command, error);
});

// Budget events
client.on('budget_warning', (stats) => {
  console.warn('Over budget:', stats);
});

// Lifecycle events
client.on('initialized', () => console.log('Client ready'));
client.on('shutdown', () => console.log('Client shutdown'));
```

## Complete Example

See `examples/multi-agent-world-creation.ts` for a complete example showing:
- Orchestrator agent coordinating world creation
- Terrain agent generating terrain with budget awareness
- Asset agent placing objects with resource management
- All three layers working together to maintain 90fps

## Performance Benchmarks

Expected performance characteristics with 5 agents:

| Metric | Target | Measured |
|--------|--------|----------|
| System FPS | 90 | 88-92 |
| Frame Time (avg) | 11.1ms | 10.5-11.8ms |
| Frame Time (max) | 13.3ms | 12-14ms |
| L1 Latency | <1ms | 0.5-0.8ms |
| L2 Response Time | <100ms | 50-150ms |
| L3 Response Time | <1s | 200-800ms |
| Total Bandwidth | ~30 KB/s | 25-35 KB/s |

## Configuration

### Full Configuration Example

```typescript
const client = new SpatialCommClient('agent-001', {
  layer1: {
    binary: true,
    maxMessageSize: 512,
    targetLatency: 1,
    messagesPerSecond: 90,
    compression: false,
    udpPort: 9001,
    webrtc: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    }
  },
  layer2: {
    endpoint: 'http://localhost:3002/a2a',
    timeout: 5000,
    maxRetries: 3,
    retryBackoffBase: 100,
    requireAck: true,
    enableBatching: true,
    batchSize: 10
  },
  layer3: {
    endpoint: 'http://localhost:5567',
    apiKey: process.env.MCP_API_KEY,
    timeout: 30000
  }
});
```

## Best Practices

1. **Always record frame times** to enable graceful degradation
2. **Use spatial claims** before modifying regions to avoid conflicts
3. **Request resources** before use and **release** when done
4. **Batch Layer 2 requests** when possible for efficiency
5. **Monitor Layer 1 latency** and warn if >1ms consistently
6. **Set appropriate task priorities** based on user visibility
7. **Use task dependencies** to coordinate sequential work
8. **Export worlds periodically** for backup/version control

## Troubleshooting

### High Layer 1 Latency

- Check network congestion
- Verify UDP port not blocked
- Consider using WebRTC DataChannels
- Reduce message rate if CPU-bound

### Layer 2 Timeouts

- Increase timeout in config
- Check HTTP/2 server availability
- Verify endpoint URL is correct
- Enable batching to reduce request count

### Frame Budget Violations

- Quality should auto-reduce - check if it's working
- Profile agent code for expensive operations
- Split work across multiple frames
- Reduce work amount at lower quality levels

### Spatial Conflicts

- Use higher priority for critical agents
- Implement conflict resolution strategies
- Partition space more carefully
- Use time-slicing for overlapping work

## API Reference

Full API documentation available in TypeScript definitions:

- `ProtocolTypes.ts` - All message and configuration types
- `Layer1RealTime.ts` - Real-time UDP/WebRTC client
- `Layer2A2A.ts` - A2A coordination client
- `Layer3MCP.ts` - MCP metadata client
- `SpatialCommClient.ts` - Unified client interface

## License

Part of @holoscript/core package.

## Contributing

See HoloScript contribution guidelines.
