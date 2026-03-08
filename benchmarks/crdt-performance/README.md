# CRDT Performance Benchmarks

Comprehensive benchmarking suite comparing Yjs, Automerge, and @holoscript/crdt implementations for use in the HoloScript MVC (Multi-Viewport Controller) schema.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build benchmark suite
pnpm build

# Run all benchmarks
pnpm bench

# Run specific benchmark suites
pnpm bench:operations    # Operation latency
pnpm bench:memory        # Memory footprint (requires --expose-gc)
pnpm bench:serialization # Wire format efficiency
pnpm bench:merge         # Concurrent merge performance
pnpm bench:signing       # DID signing overhead
```

## Results

See [RESULTS.md](./RESULTS.md) for comprehensive benchmark results, analysis, and production recommendations.

## Benchmark Suites

### 1. Operation Latency (`operations.bench.ts`)

Measures average time per CRDT operation:
- Register/text set operations
- Counter increment operations
- Set add operations
- Set remove operations

**Metrics:** avg time, min/max, ops/sec, margin of error

### 2. Memory Footprint (`memory.bench.ts`)

Measures heap memory consumption:
- 1,000 operations
- 10,000 operations
- 50,000 operations (if supported)

**Metrics:** heap used, heap total, external memory, bytes per operation

⚠️ **Run with `--expose-gc` for accurate measurements:**
```bash
node --expose-gc dist/suites/memory.bench.js
```

### 3. Serialization Size (`serialization.bench.ts`)

Measures wire format efficiency:
- Serialized size after N operations
- Serialization time
- Deserialization time

**Metrics:** size in bytes, time in ms, bytes per operation

### 4. Concurrent Merge Performance (`merge.bench.ts`)

Measures merge performance for concurrent edits:
- 2 actors × 50 edits
- 5 actors × 20 edits
- 10 actors × 10 edits

**Metrics:** merge time, conflicts detected, convergence

### 5. DID Signing Overhead (`signing.bench.ts`)

Measures authentication overhead (@holoscript/crdt only):
- Signature creation time
- Signature verification time
- Overhead vs unsigned operations

**Metrics:** sign time, verify time, signatures/sec

## Libraries Compared

### @holoscript/crdt

Custom authenticated CRDTs with DID-based signing.

**Strengths:**
- Built-in DID authentication
- AgentRBAC integration
- Tamper-proof operation logs

**Use for:** Agent-owned state, MVC schema, identity-critical scenarios

### Yjs

Industry-standard CRDT library optimized for collaborative editing.

**Strengths:**
- Excellent performance (18,905 ops/sec)
- Minimal memory footprint
- Large ecosystem

**Use for:** Real-time collaborative editing, high-frequency updates

### Automerge

JSON-like CRDT with WASM acceleration.

**Strengths:**
- Familiar document model
- Cross-language support
- Built-in history tracking

**⚠️ Warning:** Showed scalability issues at 10K+ operations in our tests.

## Architecture

```
benchmarks/crdt-performance/
├── src/
│   ├── adapters/           # CRDT library adapters
│   │   ├── holoscript.ts   # @holoscript/crdt adapter
│   │   ├── yjs.ts          # Yjs adapter
│   │   └── automerge.ts    # Automerge adapter
│   ├── suites/             # Benchmark test suites
│   │   ├── operations.bench.ts
│   │   ├── memory.bench.ts
│   │   ├── serialization.bench.ts
│   │   ├── merge.bench.ts
│   │   └── signing.bench.ts
│   ├── types.ts            # Shared types and interfaces
│   ├── reporter.ts         # Markdown report generator
│   └── index.ts            # Main benchmark runner
├── RESULTS.md              # Comprehensive benchmark results
├── README.md               # This file
├── package.json
└── tsconfig.json
```

## Methodology

### Environment
- **Runtime:** Node.js v22+
- **Platform:** Windows/Linux/macOS
- **Timing:** High-resolution `performance.now()`
- **Memory:** `process.memoryUsage()` with manual GC
- **Iterations:** 100-1000 per benchmark
- **Warmup:** Automatic warmup phase

### Data Types Tested
1. **LWW-Register** - Last-Write-Wins register
2. **G-Counter** - Grow-only counter
3. **OR-Set** - Observed-Remove set

### Metrics Collected
- Operation latency (ms)
- Memory footprint (MB)
- Serialization size (KB)
- Merge performance (ms)
- DID signing overhead (ms)

## Key Findings

From [RESULTS.md](./RESULTS.md):

1. **Yjs dominates performance**: 18,905 ops/sec (30× faster than @holoscript/crdt)
2. **@holoscript/crdt adds ~1.5ms overhead** for DID authentication (acceptable for agent state)
3. **Automerge shows scalability issues** at 10K+ operations
4. **Hybrid architecture recommended**: @holoscript/crdt for agent identity + Yjs for collaboration

## Recommendations

### For MVC Schema

Use **@holoscript/crdt** for:
- Agent-owned state (<10KB)
- Identity-critical operations
- Audit trails and provenance
- Byzantine fault tolerance

Use **Yjs** for:
- Real-time collaborative editing
- High-frequency updates (1000s/sec)
- Ephemeral shared state
- Trusted network scenarios

### Performance Optimization

1. **Batch operations**: Group edits into transactions
2. **Compress signatures**: Use gzip/brotli for network sync
3. **Garbage collect**: Compact operation logs periodically
4. **Partial sync**: Only transmit deltas
5. **Lazy verification**: Verify signatures async

## Integration Example

```typescript
import { ORSet, createTestSigner } from '@holoscript/crdt';
import * as Y from 'yjs';

// Agent-owned state (authenticated)
const signer = createTestSigner('did:key:z6Mk...');
const agentState = new ORSet<Component>('agent-state', signer);
await agentState.add({
  type: 'position',
  lat: 37.7749,
  lon: -122.4194,
  timestamp: Date.now(),
});

// High-frequency collaboration (unsigned)
const sharedCanvas = new Y.Map();
sharedCanvas.set('stroke', { x: 100, y: 200, color: '#ff0000' });
```

## Next Steps

1. Run browser benchmarks (WebAssembly)
2. Test WebRTC network transmission
3. Profile VR render loop impact (<11ms @ 90Hz)
4. Benchmark spatial indexing queries
5. Scale test with 1M+ operations

## References

- [Yjs Official Benchmarks](https://github.com/dmonad/crdt-benchmarks)
- [Automerge Performance](https://inkandswitch.github.io/automerge-rs/post/towards-production/)
- [CRDT Research Papers](https://crdt.tech/)
- [@holoscript/crdt Package](../../packages/crdt/)

## License

MIT License - See [LICENSE](../../LICENSE) for details

---

**Benchmark Suite:** v1.0.0
**HoloScript:** Spatial Computing Platform
**Team:** Brian X Base / HoloScript Contributors
