# HoloScript Semantic Caching System

## Overview

The Semantic Caching system provides **50-80% compilation time reduction** on incremental builds by caching compiled modules and AST subtrees based on content hashes. It supports both Redis and in-memory backends with automatic fallback.

## Architecture

### Key Components

1. **SemanticCache** - Core caching engine with Redis/memory backends
2. **IncrementalCompiler** - Integration point for compilation workflows
3. **Content Hashing** - SHA-256 based content-addressable storage
4. **TTL Management** - 7-day default TTL with configurable expiration
5. **Performance Metrics** - Hit rate, latency, and cache statistics

### Cache Entry Types

- `ast-subtree` - Parsed AST for modules/compositions
- `compiled-module` - Compiled output for complete modules
- `compiled-object` - Compiled output for individual HoloObjects
- `trait-composition` - Resolved trait compositions
- `import-resolution` - Resolved import graphs

## Usage

### Basic Integration

```typescript
import { IncrementalCompiler } from '@holoscript/core/compiler';

// Enable semantic caching
const compiler = new IncrementalCompiler(undefined, {
  enableSemanticCache: true,
  redisUrl: 'redis://localhost:6379', // Optional: defaults to localhost
  cacheTTL: 7 * 24 * 60 * 60, // Optional: 7 days (default)
});

// Compile with caching
const result = await compiler.compile(composition, compileObject);

console.log(`Recompiled: ${result.recompiledObjects.length}`);
console.log(`Cached: ${result.cachedObjects.length}`);

// Get cache statistics
const stats = await compiler.getSemanticCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Average latency: ${stats.avgLatencyMs.toFixed(2)}ms`);
```

### Standalone Cache Usage

```typescript
import { createSemanticCache, hashSourceCode } from '@holoscript/core/compiler';

const cache = createSemanticCache({
  redisUrl: 'redis://localhost:6379',
  ttl: 7 * 24 * 60 * 60, // 7 days
  version: '1.0.0',
  debug: true,
});

await cache.initialize();

// Cache compiled output
const sourceCode = 'const x = 42;';
const compiledCode = 'var x = 42;';
const hash = hashSourceCode(sourceCode);

await cache.set(hash, 'compiled-module', compiledCode, {
  sourcePath: 'src/module.hs',
  dependencies: ['src/utils.hs'],
});

// Retrieve from cache
const result = await cache.get(hash, 'compiled-module');
if (result.hit) {
  console.log('Cache hit!', result.entry.data);
} else {
  console.log('Cache miss:', result.reason);
}

await cache.close();
```

### High-Level Utilities

```typescript
import {
  cacheCompiledModule,
  getCachedCompiledModule,
  cacheASTSubtree,
  getCachedASTSubtree,
} from '@holoscript/core/compiler';

const cache = createSemanticCache();
await cache.initialize();

// Cache compiled module
const source = 'const x = 42;';
const compiled = 'var x = 42;';
await cacheCompiledModule(source, compiled, cache);

// Retrieve cached module
const retrieved = await getCachedCompiledModule(source, cache);
console.log(retrieved); // 'var x = 42;'

// Cache AST subtree
const astNode = { name: 'Cube', properties: [...], traits: [...] };
await cacheASTSubtree(astNode, cache);

// Retrieve cached AST
const cachedAST = await getCachedASTSubtree(astNode, cache);
```

## Performance

### Benchmarks

From integration tests with 50 objects:

- **Cold build**: 5ms (all objects compiled)
- **Warm build**: 2ms (all objects cached)
- **Speedup**: **2.5x** on incremental builds
- **Hit rate**: **>80%** on typical workflows

### Optimization Strategies

1. **Incremental Builds**
   - Only changed objects are recompiled
   - Unchanged objects retrieved from cache
   - **Impact**: 50-80% compilation time reduction

2. **Content-Addressable Storage**
   - SHA-256 hashing ensures identical code shares cache entries
   - Deduplication across different files
   - **Impact**: Reduced cache size, faster lookups

3. **Dependency Tracking**
   - Cache entries track file dependencies
   - Automatic invalidation on dependency changes
   - **Impact**: Correct incremental compilation

4. **Redis Backend**
   - Distributed caching across multiple machines
   - Persistent cache across sessions
   - **Impact**: Faster first builds, team-wide speedups

## Configuration

### Environment Variables

```bash
# Redis connection URL
HOLOSCRIPT_REDIS_URL=redis://localhost:6379

# Cache TTL (seconds)
HOLOSCRIPT_CACHE_TTL=604800

# Cache version (for invalidation)
HOLOSCRIPT_CACHE_VERSION=1.0.0

# Enable debug logging
HOLOSCRIPT_CACHE_DEBUG=true
```

### Programmatic Configuration

```typescript
const compiler = new IncrementalCompiler(undefined, {
  enableSemanticCache: true,
  redisUrl: process.env.HOLOSCRIPT_REDIS_URL || 'redis://localhost:6379',
  cacheTTL: parseInt(process.env.HOLOSCRIPT_CACHE_TTL || '604800'),
});
```

## Redis Setup

### Local Development

```bash
# Install Redis
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu

# Start Redis
redis-server

# Test connection
redis-cli ping  # Should return "PONG"
```

### Docker

```bash
# Run Redis in Docker
docker run -d -p 6379:6379 redis:7

# Verify
docker ps
redis-cli ping
```

### Production

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

## Cache Management

### Invalidation

```typescript
// Invalidate specific entry
await cache.delete(contentHash, 'compiled-module');

// Invalidate all entries of a type
await cache.invalidateType('compiled-object');

// Clear entire cache
await cache.clear();
```

### Statistics

```typescript
const stats = await cache.getStats();

console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Average latency: ${stats.avgLatencyMs.toFixed(2)}ms`);
console.log(`Backend: ${stats.backend}`);
console.log(`Redis connected: ${stats.redisConnected}`);

console.log('Entries by type:');
for (const [type, count] of Object.entries(stats.entriesByType)) {
  console.log(`  ${type}: ${count}`);
}
```

### Monitoring

```typescript
// Track cache performance over time
setInterval(async () => {
  const stats = await compiler.getSemanticCacheStats();
  if (stats) {
    console.log(
      `[Cache] Hit rate: ${(stats.hitRate * 100).toFixed(1)}%, ` +
        `Entries: ${stats.totalEntries}, ` +
        `Backend: ${stats.backend}`
    );
  }
}, 60000); // Every minute
```

## Graceful Degradation

The semantic cache automatically falls back to in-memory storage if Redis is unavailable:

```typescript
// Redis connection fails → falls back to memory
const cache = createSemanticCache({
  redisUrl: 'redis://unreachable:6379',
  connectionTimeout: 5000,
});

await cache.initialize();
// Logs: "Redis initialization failed. Falling back to in-memory cache."

const stats = await cache.getStats();
console.log(stats.backend); // 'memory'
console.log(stats.redisConnected); // false
```

## Testing

### Unit Tests

```bash
cd packages/core
pnpm test -- SemanticCache.test.ts
```

**Coverage**:
- Hashing (SHA-256)
- Cache operations (get, set, delete)
- Statistics tracking
- Version management
- Access tracking
- Performance benchmarks
- Edge cases

### Integration Tests

```bash
pnpm test -- SemanticCache.integration.test.ts
```

**Scenarios**:
- Incremental compilation workflows
- Performance benchmarks (2.5x+ speedup)
- Cache invalidation strategies
- Error handling and graceful degradation
- Memory management

## Troubleshooting

### Redis Connection Fails

**Problem**: Cache always uses memory backend

**Solutions**:
1. Check Redis is running: `redis-cli ping`
2. Verify connection URL: `redis://localhost:6379`
3. Check firewall/network settings
4. Review connection timeout setting

### Low Hit Rate

**Problem**: Hit rate < 50%

**Solutions**:
1. Check TTL isn't too short
2. Verify version matches across builds
3. Review cache invalidation logic
4. Monitor cache eviction (LRU)

### High Memory Usage

**Problem**: Memory cache grows unbounded

**Solutions**:
1. Enable Redis backend for persistence
2. Reduce cache TTL
3. Implement periodic cleanup
4. Monitor cache size

## Best Practices

### 1. Use Redis in Production

```typescript
// Production configuration
const compiler = new IncrementalCompiler(undefined, {
  enableSemanticCache: true,
  redisUrl: process.env.REDIS_URL, // Use env var
  cacheTTL: 7 * 24 * 60 * 60,
});
```

### 2. Monitor Cache Performance

```typescript
// Log cache stats periodically
setInterval(async () => {
  const stats = await compiler.getSemanticCacheStats();
  if (stats?.hitRate < 0.5) {
    console.warn('Low cache hit rate:', stats.hitRate);
  }
}, 300000); // Every 5 minutes
```

### 3. Invalidate on Breaking Changes

```typescript
// Bump version on breaking changes
const cache = createSemanticCache({
  version: '2.0.0', // Invalidates all v1.0.0 entries
});
```

### 4. Track Dependencies

```typescript
await cache.set(hash, 'compiled-module', output, {
  sourcePath: 'src/scene.hs',
  dependencies: ['src/utils.hs', 'src/traits.hs'],
});
```

### 5. Clean Up Resources

```typescript
// Close cache on shutdown
process.on('SIGTERM', async () => {
  await compiler.closeSemanticCache();
  process.exit(0);
});
```

## API Reference

### SemanticCache

#### Constructor

```typescript
new SemanticCache(options?: SemanticCacheOptions)
```

#### Methods

- `initialize(): Promise<void>` - Initialize cache (connect to Redis)
- `get<T>(hash, type): Promise<CacheLookupResult<T>>` - Get cache entry
- `set<T>(hash, type, data, options?): Promise<void>` - Set cache entry
- `delete(hash, type): Promise<void>` - Delete cache entry
- `invalidateType(type): Promise<number>` - Invalidate all entries of type
- `clear(): Promise<void>` - Clear entire cache
- `getStats(): Promise<SemanticCacheStats>` - Get cache statistics
- `close(): Promise<void>` - Close Redis connection

### IncrementalCompiler

#### Constructor

```typescript
new IncrementalCompiler(
  traitGraph?: TraitDependencyGraph,
  options?: {
    enableSemanticCache?: boolean;
    redisUrl?: string;
    cacheTTL?: number;
  }
)
```

#### Methods

- `compile(ast, compileObject, options?): Promise<IncrementalCompileResult>` - Compile with caching
- `getSemanticCacheStats(): Promise<SemanticCacheStats | null>` - Get cache stats
- `clearSemanticCache(): Promise<void>` - Clear cache
- `closeSemanticCache(): Promise<void>` - Close cache connection

## Migration Guide

### From BuildCache to SemanticCache

**Before** (BuildCache):
```typescript
import { BuildCache } from './BuildCache';

const cache = new BuildCache({ cacheDir: '.cache' });
await cache.initialize();
await cache.set('file.hs', 'compiled', output);
const result = await cache.get('file.hs', 'compiled');
```

**After** (SemanticCache):
```typescript
import { createSemanticCache, hashSourceCode } from './SemanticCache';

const cache = createSemanticCache({ redisUrl: 'redis://localhost:6379' });
await cache.initialize();
const hash = hashSourceCode(sourceCode);
await cache.set(hash, 'compiled-module', output);
const result = await cache.get(hash, 'compiled-module');
```

**Key Changes**:
- Content-based hashing instead of file paths
- Redis backend instead of disk files
- Async initialization and operations
- Different entry types

## Future Enhancements

1. **Distributed Cache**
   - Multi-node Redis cluster support
   - Cache replication across regions
   - Eventual consistency guarantees

2. **Advanced Invalidation**
   - Dependency graph-based invalidation
   - Smart cache warming
   - Predictive invalidation

3. **Compression**
   - LZ4/Zstandard for large entries
   - Adaptive compression based on size
   - Compression ratio metrics

4. **Cache Analytics**
   - Detailed hit/miss patterns
   - Cache effectiveness scoring
   - Automated optimization suggestions

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! See CONTRIBUTING.md for guidelines.
