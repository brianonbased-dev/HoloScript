# Upstash Connector Integration Guide

## Overview

The `@holoscript/connector-upstash` package provides three integrated subsystems for HoloScript Studio's Integration Hub:

1. **Redis** - Scene caching, session state, user preferences
2. **Vector** - Composition embeddings for semantic search
3. **QStash** - Scheduled compilations, health monitoring, deployments

## Quick Start

### Installation

```bash
npm install @holoscript/connector-upstash
# or
pnpm add @holoscript/connector-upstash
```

### Environment Setup

Create a `.env` file with your Upstash credentials:

```env
# Redis
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-redis-token

# Vector
UPSTASH_VECTOR_URL=https://your-vector.upstash.io
UPSTASH_VECTOR_TOKEN=your-vector-token

# QStash
QSTASH_TOKEN=your-qstash-token
```

### Basic Usage

```typescript
import { UpstashConnector } from '@holoscript/connector-upstash';

const connector = new UpstashConnector();
await connector.connect();

// Use Redis for caching
await connector.executeTool('upstash_redis_cache_set', {
  key: 'scene:demo',
  value: { compiled: true, timestamp: Date.now() },
  ttl: 3600,
});

// Use Vector for similarity search
await connector.executeTool('upstash_vector_search_text', {
  query: 'physics simulation with rigidbody',
  topK: 5,
});

// Use QStash for scheduling
await connector.executeTool('upstash_schedule_nightly_compilation', {
  url: 'https://api.holoscript.net/compile',
  target: 'unity',
  scene: 'production/main.holo',
});
```

## Subsystem Details

### 1. Redis Subsystem

**Use Cases:**

- Cache compiled scenes to avoid re-compilation
- Persist session state across CLI command invocations
- Store user preferences (theme, layout, defaults)

**Available Tools:**

```typescript
// Scene Caching
upstash_redis_cache_get({ key: 'scene:my-world' })
upstash_redis_cache_set({ key: 'scene:my-world', value: {...}, ttl: 86400 })
upstash_redis_cache_delete({ key: 'scene:my-world' })

// Session State
upstash_redis_session_get({ sessionId: 'session-123' })
upstash_redis_session_set({ sessionId: 'session-123', state: {...}, ttl: 3600 })

// User Preferences
upstash_redis_prefs_get({ userId: 'user-456' })
upstash_redis_prefs_set({ userId: 'user-456', preferences: {...} })
```

**Example: CLI Session Persistence**

```typescript
// Store CLI context between commands
await connector.executeTool('upstash_redis_session_set', {
  sessionId: 'cli-session-abc',
  state: {
    lastCommand: 'compile',
    workingDirectory: '/path/to/project',
    compilationTarget: 'unity',
  },
  ttl: 3600, // 1 hour
});

// Restore context in next command
const session = await connector.executeTool('upstash_redis_session_get', {
  sessionId: 'cli-session-abc',
});
```

### 2. Vector Subsystem

**Use Cases:**

- Find similar compositions by embedding
- Semantic search: "find all physics simulations"
- Composition recommendations
- Duplicate detection

**Available Tools:**

```typescript
// Upsert Embedding
upstash_vector_upsert({
  id: 'comp-123',
  vector: [0.1, 0.2, ...], // 1536-dim embedding
  snippet: 'object Cube { @physics @rigidbody }',
  traits: ['@physics', '@rigidbody'],
  targets: ['unity', 'unreal'],
  tags: ['3d', 'physics'],
  namespace: 'user-456'
})

// Search by Vector
upstash_vector_search({
  vector: [0.1, 0.2, ...],
  topK: 10,
  filter: 'namespace = "user-456" AND traits INCLUDES "@physics"'
})

// Search by Text (auto-embeds)
upstash_vector_search_text({
  query: 'physics simulation with gravity',
  topK: 10,
  filter: 'targets INCLUDES "unity"'
})

// Fetch by ID
upstash_vector_fetch({ id: 'comp-123' })

// Delete
upstash_vector_delete({ id: 'comp-123' })

// Index Stats
upstash_vector_info({})
```

**Example: Composition Discovery**

```typescript
// User writes: "I want a bouncing ball"
const similar = await connector.executeTool('upstash_vector_search_text', {
  query: 'bouncing ball physics simulation',
  topK: 5,
  filter: 'traits INCLUDES "@physics"',
});

// Returns:
// [
//   { id: 'ball-sim-1', score: 0.95, metadata: { snippet: 'object Ball { @physics @rigidbody }', traits: [...] } },
//   { id: 'physics-demo', score: 0.89, metadata: { ... } },
//   ...
// ]
```

### 3. QStash Subsystem

**Use Cases:**

- Nightly compilation of production scenes
- Health monitoring pings
- Delayed deployment triggers
- CI/CD webhook callbacks

**Available Tools:**

```typescript
// Create Schedule
upstash_qstash_schedule({
  cron: '0 2 * * *', // 2 AM daily
  url: 'https://api.holoscript.net/compile',
  body: { target: 'unity', scene: 'main.holo' },
  retries: 3,
});

// Publish One-Time Message
upstash_qstash_publish({
  url: 'https://webhook.site/...',
  body: { event: 'compilation_complete' },
  delay: 300, // 5 minutes
});

// List Schedules
upstash_qstash_list({});

// Pause/Resume
upstash_qstash_pause({ scheduleId: 'sched-123' });
upstash_qstash_resume({ scheduleId: 'sched-123' });

// Delete
upstash_qstash_delete({ scheduleId: 'sched-123' });

// Dead Letter Queue
upstash_qstash_dlq_list({});
upstash_qstash_dlq_delete({ messageId: 'dlq-456' });

// Convenience Methods
upstash_schedule_nightly_compilation({ url, target, scene, hour: 2 });
upstash_schedule_health_ping({ url, intervalMinutes: 5 });
upstash_trigger_deployment({ deploymentUrl, delaySeconds: 300 });
```

**Example: CI/CD Pipeline**

```typescript
// Schedule nightly builds
const scheduleId = await connector.executeTool('upstash_schedule_nightly_compilation', {
  url: 'https://ci.holoscript.net/build',
  target: 'unity',
  scene: 'production/scenes/main.holo',
  hour: 2, // 2 AM UTC
});

// Trigger deployment after 5-minute delay (canary rollout)
const messageId = await connector.executeTool('upstash_trigger_deployment', {
  deploymentUrl: 'https://deploy.holoscript.net/rollout',
  delaySeconds: 300,
  metadata: {
    version: '5.1.0',
    environment: 'production',
    target: 'unity',
  },
});

// Check for failed deployments
const failures = await connector.executeTool('upstash_qstash_dlq_list', {});
if (failures.length > 0) {
  console.error('Deployment failures detected:', failures);
}
```

## Studio Integration

### Scene Cache Integration

```typescript
// In Studio compilation pipeline
async function compileScene(code: string, target: string) {
  const cacheKey = `scene:${hash(code)}:${target}`;

  // Check cache first
  const cached = await connector.executeTool('upstash_redis_cache_get', { key: cacheKey });
  if (cached) {
    return cached;
  }

  // Compile if not cached
  const compiled = await compile(code, target);

  // Store in cache (24h TTL)
  await connector.executeTool('upstash_redis_cache_set', {
    key: cacheKey,
    value: compiled,
    ttl: 86400,
  });

  return compiled;
}
```

### Composition Indexing

```typescript
// Auto-index compositions on save
async function onCompositionSave(composition: Composition) {
  // Generate embedding (using OpenAI, Xenova, etc.)
  const embedding = await generateEmbedding(composition.code);

  // Upsert to vector index
  await connector.executeTool('upstash_vector_upsert', {
    id: composition.id,
    vector: embedding,
    snippet: composition.code.substring(0, 500),
    traits: extractTraits(composition.code),
    targets: composition.targets || [],
    tags: composition.tags || [],
    namespace: composition.userId,
  });
}
```

### Scheduled Health Checks

```typescript
// Monitor Studio API health
await connector.executeTool('upstash_schedule_health_ping', {
  url: 'https://studio.holoscript.net/api/health',
  intervalMinutes: 5,
});
```

## Architecture Integration

### With MCP Orchestrator

The connector automatically registers with the MCP orchestrator at `https://mcp-orchestrator-production-45f9.up.railway.app`:

```typescript
// Registration happens automatically on connect()
await connector.connect();

// Tools become available via orchestrator
curl -X POST https://mcp-orchestrator-production-45f9.up.railway.app/tools/call \
  -H "x-mcp-api-key: $MCP_API_KEY" \
  -d '{"server": "holoscript-upstash", "tool": "upstash_redis_cache_get", "args": {"key": "scene:test"}}'
```

### With Semantic Search Hub

The Vector subsystem extends `semantic-search-hub` for composition discovery:

```typescript
// Use orchestrator's semantic-search-hub for embedding generation
// Then use Upstash Vector for storage and search
const embedding = await generateEmbeddingViaOrchestrator(query);
const results = await connector.executeTool('upstash_vector_search', {
  vector: embedding,
  topK: 10,
});
```

### With HoloClaw

Schedule HoloClaw agent skill execution:

```typescript
await connector.executeTool('upstash_qstash_schedule', {
  cron: '0 */6 * * *', // Every 6 hours
  url: 'https://holoclaw.holoscript.net/skills/optimize-scene/execute',
  body: {
    skillId: 'optimize-scene',
    sceneId: 'main.holo',
    budget: 0.5,
  },
});
```

## Best Practices

### Cache Key Naming

Use hierarchical keys with colons:

```
scene:{sceneId}:{target}
session:{sessionId}
prefs:{userId}
comp:{compositionId}
```

### TTL Guidelines

- Scene cache: 86400 (24 hours)
- Session state: 3600 (1 hour)
- User preferences: No expiration (persistent)
- Temporary data: 300 (5 minutes)

### Vector Namespace Isolation

Always use namespaces for multi-tenancy:

```typescript
{
  namespace: `user-${userId}`,        // User-scoped
  namespace: `project-${projectId}`,  // Project-scoped
  namespace: 'public',                // Public compositions
}
```

### Error Handling

```typescript
try {
  await connector.connect();
} catch (error) {
  if (error.message.includes('Redis')) {
    // Redis failed, but Vector/QStash might still work (partial mode)
  }
}

// Connector marks as connected if ANY subsystem succeeds
const isHealthy = await connector.health();
```

### Dead Letter Queue Monitoring

```typescript
// Poll DLQ periodically
setInterval(async () => {
  const failures = await connector.executeTool('upstash_qstash_dlq_list', {});
  if (failures.length > 0) {
    await notifyDevOps(failures);
  }
}, 3600000); // Every hour
```

## Performance Considerations

- **Redis**: HTTP-based (add ~50ms latency vs raw TCP)
- **Vector**: Cosine similarity search scales to millions of vectors
- **QStash**: Delivery SLA is 1-2 seconds for delayed messages

## Security

- All credentials are environment variables (never hardcoded)
- Upstash enforces TLS 1.2+ for all connections
- Use namespace filters for multi-tenant isolation
- QStash webhook signatures validate request authenticity

## Troubleshooting

### "RedisSubsystem not connected"

Check environment variables:

```bash
echo $UPSTASH_REDIS_URL
echo $UPSTASH_REDIS_TOKEN
```

### Vector search returns no results

1. Verify embedding dimensions match index (usually 1536 for OpenAI)
2. Check namespace filters
3. Use `upstash_vector_info` to see index stats

### QStash messages not delivering

1. Check DLQ: `upstash_qstash_dlq_list`
2. Verify webhook URL is publicly accessible
3. Inspect retry count and backoff settings

## License

MIT
