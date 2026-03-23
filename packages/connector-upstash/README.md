# @holoscript/connector-upstash

Upstash MCP Connector for HoloScript Studio Integration Hub.

## Three Subsystems

### 1. Redis Subsystem

Compiled scene caching, session state, and user preferences via `@upstash/redis` HTTP client.

**Features:**
- Scene cache with TTL (24h default)
- Session state persistence
- User preferences storage
- Atomic operations (GET, SET, DEL, EXPIRE)
- JSON serialization for complex objects

**MCP Tools:**
- `upstash_redis_cache_get` - Retrieve cached scene
- `upstash_redis_cache_set` - Store compiled scene with TTL
- `upstash_redis_session_get` - Load session state
- `upstash_redis_session_set` - Save session state
- `upstash_redis_prefs_get` - Get user preferences
- `upstash_redis_prefs_set` - Update user preferences

### 2. Vector Subsystem

Extends `semantic-search-hub` on MCP orchestrator with composition embeddings for "find similar" search.

**Features:**
- Upsert composition embeddings (code → vector)
- Semantic similarity search
- Metadata filtering (traits, targets, tags)
- Hybrid search (vector + metadata)
- Namespace isolation (per-user/per-project)

**MCP Tools:**
- `upstash_vector_upsert` - Add composition embedding
- `upstash_vector_search` - Find similar compositions
- `upstash_vector_delete` - Remove embedding
- `upstash_vector_fetch` - Get by ID
- `upstash_vector_query` - Hybrid vector + metadata search

### 3. QStash Subsystem

Scheduled compilation triggers, health monitoring, and deployment scheduling via `@upstash/qstash`.

**Features:**
- Cron-based compilation schedules
- One-time delayed tasks
- Webhook callbacks for CI/CD
- Dead letter queue (DLQ) for failures
- Health monitoring pings

**MCP Tools:**
- `upstash_qstash_schedule` - Create cron schedule
- `upstash_qstash_publish` - One-time message
- `upstash_qstash_list` - List scheduled jobs
- `upstash_qstash_delete` - Cancel schedule
- `upstash_qstash_dlq_list` - List failed messages

## Authentication

Set environment variables:

```bash
# Redis
export UPSTASH_REDIS_URL=https://your-redis.upstash.io
export UPSTASH_REDIS_TOKEN=your-redis-token

# Vector
export UPSTASH_VECTOR_URL=https://your-vector.upstash.io
export UPSTASH_VECTOR_TOKEN=your-vector-token

# QStash
export QSTASH_TOKEN=your-qstash-token
export QSTASH_CURRENT_SIGNING_KEY=your-signing-key
export QSTASH_NEXT_SIGNING_KEY=your-next-signing-key
```

## Usage

```typescript
import { UpstashConnector } from '@holoscript/connector-upstash';

const connector = new UpstashConnector();
await connector.connect();

// Cache compiled scene
await connector.executeTool('upstash_redis_cache_set', {
  key: 'scene:my-vr-world',
  value: compiledOutput,
  ttl: 86400 // 24 hours
});

// Find similar compositions
const similar = await connector.executeTool('upstash_vector_search', {
  query: embeddingVector,
  topK: 10,
  filter: 'traits:@physics AND target:unity'
});

// Schedule nightly compilation
await connector.executeTool('upstash_qstash_schedule', {
  cron: '0 2 * * *', // 2 AM daily
  url: 'https://api.holoscript.net/compile',
  body: { target: 'unity', scene: 'production/main.holo' }
});
```

## Integration with HoloScript Ecosystem

- **Studio**: Scene caching for instant preview reload
- **CLI**: Session state persistence across `hs` commands
- **MCP Server**: Semantic search for composition discovery
- **HoloClaw**: Scheduled agent skill execution
- **Registry**: Package metadata caching

## License

MIT
