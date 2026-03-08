# @holoscript/mvc-schema

Minimal Viable Context (MVC) schema for cross-reality agent state synchronization with authenticated CRDTs.

## Overview

Provides TypeScript types, JSON schemas, compression, and validation for **5 core MVC objects** that enable agent state synchronization across VR, AR, and traditional platforms:

1. **DecisionHistory** (G-Set CRDT) - Append-only decision log
2. **ActiveTaskState** (OR-Set + LWW hybrid) - Current active tasks
3. **UserPreferences** (LWW-Map) - Per-field user preferences
4. **SpatialContextSummary** (LWW + G-Set hybrid) - WGS84 geospatial anchors
5. **EvidenceTrail** (VCP v1.1 hash chain) - Tamper-proof evidence

## Features

- **CRDT-Compatible Types**: All objects use conflict-free replicated data type semantics
- **Two-Stage Compression**: Schema-based JSON compression + CBOR binary encoding
- **Size Targets**: <2KB per object, <10KB total compressed
- **WGS84 Geospatial**: Universal cross-reality spatial anchoring (works across all platforms)
- **VCP v1.1 Compliance**: Verifiable Credential Protocol for evidence trails
- **Comprehensive Validation**: JSON Schema validation with detailed error reporting

## Installation

```bash
pnpm add @holoscript/mvc-schema
```

## Usage

### Basic Validation

```typescript
import { DecisionHistory, validateDecisionHistory } from '@holoscript/mvc-schema';

const history: DecisionHistory = {
  crdtType: 'g-set',
  crdtId: 'abc-123',
  decisions: [
    {
      id: 'dec-456',
      timestamp: Date.now(),
      type: 'task',
      description: 'Implement MVC schema',
      choice: 'Use TypeScript + CBOR',
    },
  ],
  vectorClock: { 'did:key:agent1': 1 },
  lastUpdated: Date.now(),
};

const result = validateDecisionHistory(history);
console.log(result.valid); // true
```

### Compression Pipeline

```typescript
import { compressMVCFull, decompressMVCFull } from '@holoscript/mvc-schema';

// Compress with schema compression + CBOR
const compressed = compressMVCFull(history);

console.log(compressed.finalSize); // <2KB
console.log(compressed.totalCompressionRatio); // e.g., 0.65 (65% reduction)
console.log(compressed.validation.valid); // true

// Decompress
const decompressed = decompressMVCFull<DecisionHistory>(compressed.compressed);
```

### Base64 Encoding (for text transmission)

```typescript
import { compressMVCToBase64, decompressMVCFromBase64 } from '@holoscript/mvc-schema';

const base64 = compressMVCToBase64(history);
const restored = decompressMVCFromBase64<DecisionHistory>(base64);
```

### Batch Compression

```typescript
import { compressMVCBatch } from '@holoscript/mvc-schema';

const result = compressMVCBatch([history, taskState, prefs, spatial, evidence]);

console.log(result.totalFinalSize); // <10KB
console.log(result.allValid); // true
console.log(result.averageCompressionRatio); // e.g., 0.68
```

## MVC Objects

### 1. DecisionHistory

Append-only log of agent decisions with causal tracking.

```typescript
import type { DecisionHistory, DecisionEntry } from '@holoscript/mvc-schema';

const history: DecisionHistory = {
  crdtType: 'g-set',
  crdtId: 'history-123',
  decisions: [
    {
      id: 'dec-1',
      timestamp: Date.now(),
      type: 'task',
      description: 'Choose implementation approach',
      choice: 'Use CRDT for state sync',
      confidence: 0.85,
      outcome: 'success',
    },
  ],
  vectorClock: {},
  lastUpdated: Date.now(),
};
```

### 2. ActiveTaskState

Current active tasks with OR-Set for collection, LWW-Register for status.

```typescript
import type { ActiveTaskState } from '@holoscript/mvc-schema';

const taskState: ActiveTaskState = {
  crdtType: 'or-set+lww',
  crdtId: 'tasks-123',
  tasks: [
    {
      id: 'task-1',
      title: 'Implement compression',
      status: 'in_progress',
      priority: 'high',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  taskTags: {},
  statusRegisters: {},
  vectorClock: {},
  lastUpdated: Date.now(),
};
```

### 3. UserPreferences

Per-field preferences with LWW conflict resolution.

```typescript
import type { UserPreferences } from '@holoscript/mvc-schema';

const prefs: UserPreferences = {
  crdtType: 'lww-map',
  crdtId: 'prefs-123',
  agentDid: 'did:key:agent1',
  spatial: {
    movementSpeed: 2.5,
    personalSpaceRadius: 1.5,
  },
  communication: {
    style: 'technical',
    language: 'en',
  },
  lwwMetadata: {},
  lastUpdated: Date.now(),
};
```

### 4. SpatialContextSummary

WGS84 geospatial anchors for cross-reality positioning.

```typescript
import type { SpatialContextSummary } from '@holoscript/mvc-schema';

const spatial: SpatialContextSummary = {
  crdtType: 'lww+gset',
  crdtId: 'spatial-123',
  agentDid: 'did:key:agent1',
  primaryAnchor: {
    id: 'anchor-1',
    coordinate: {
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 10.0,
    },
    label: 'San Francisco Office',
    createdAt: Date.now(),
    lastVerified: Date.now(),
  },
  recentAnchors: [],
  lastUpdated: Date.now(),
};
```

### 5. EvidenceTrail

VCP v1.1 compliant hash chain for tamper-proof evidence.

```typescript
import type { EvidenceTrail } from '@holoscript/mvc-schema';

const evidence: EvidenceTrail = {
  crdtType: 'hash-chain',
  crdtId: 'evidence-123',
  vcpMetadata: {
    version: '1.1',
    hashAlgorithm: 'sha256',
    createdAt: Date.now(),
    creatorDid: 'did:key:agent1',
  },
  entries: [
    {
      sequence: 0,
      type: 'observation',
      timestamp: Date.now(),
      content: 'Genesis entry',
      hash: 'a'.repeat(64),
      previousHash: null,
      agentDid: 'did:key:agent1',
    },
  ],
  headHash: 'a'.repeat(64),
  lastUpdated: Date.now(),
};
```

## Compression Details

### Two-Stage Pipeline

1. **Schema-based JSON compression**:
   - Remove null/undefined values
   - Compact field names (crdtType → t, timestamp → ts)
   - Round floats to precision (default 4 decimals)
   - Remove schema-inferrable defaults

2. **CBOR binary encoding**:
   - Concise Binary Object Representation
   - More compact than JSON
   - Preserves data types (unlike JSON)

### Size Targets

| Object | Uncompressed | Target | Typical Compressed |
|--------|--------------|--------|-------------------|
| DecisionHistory | 800B-2KB | <2KB | 400B-1KB |
| ActiveTaskState | 600B-1.5KB | <2KB | 300B-800B |
| UserPreferences | 400B-1KB | <2KB | 200B-500B |
| SpatialContextSummary | 500B-1.2KB | <2KB | 250B-600B |
| EvidenceTrail | 1KB-3KB | <2KB | 500B-1.5KB |
| **Total** | 3.3KB-8.7KB | **<10KB** | **1.65KB-4.4KB** |

## API Reference

### Types

```typescript
import {
  DecisionHistory,
  ActiveTaskState,
  UserPreferences,
  SpatialContextSummary,
  EvidenceTrail,
  MVCObject,
  MVCType,
} from '@holoscript/mvc-schema/types';
```

### Schemas

```typescript
import {
  decisionHistorySchema,
  taskStateSchema,
  preferencesSchema,
  spatialContextSchema,
  evidenceTrailSchema,
  mvcSchemas,
} from '@holoscript/mvc-schema/schemas';
```

### Compression

```typescript
import {
  compressMVC,
  decompressMVC,
  encodeCBOR,
  decodeCBOR,
  compressMVCFull,
  decompressMVCFull,
  compressMVCToBase64,
  decompressMVCFromBase64,
  compressMVCBatch,
} from '@holoscript/mvc-schema/compression';
```

### Validation

```typescript
import {
  validateMVC,
  validateDecisionHistory,
  validateTaskState,
  validatePreferences,
  validateSpatialContext,
  validateEvidenceTrail,
  validateAuto,
  validateBatch,
} from '@holoscript/mvc-schema/validation';
```

## Integration with @holoscript/crdt

This package is designed to work seamlessly with `@holoscript/crdt`:

```typescript
import { LWWRegister, ORSet, DIDSigner } from '@holoscript/crdt';
import type { DecisionHistory } from '@holoscript/mvc-schema';

// Use CRDT operations to build MVC objects
const signer = await DIDSigner.create('did:key:agent1', privateKey);
const decisionsSet = new GSet('decisions-1', signer);

// ... build DecisionHistory from CRDT state
```

See `examples/crdt-integration.ts` for complete example.

## License

MIT

## Related

- [@holoscript/crdt](../crdt) - Authenticated CRDT implementations
- [@holoscript/core](../core) - HoloScript core compiler
- [@holoscript/agent-protocol](../agent-protocol) - Agent communication protocol
