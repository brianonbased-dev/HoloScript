# HoloScript Core Build Issues

**Created:** 2026-02-09  
**Updated:** 2026-02-09  
**Status:** Partially Resolved  
**Priority:** Medium  
**Affects:** `@holoscript/core` package tsc declaration generation

## Summary

The `@holoscript/core` package **bundling works** (ESM + CJS via tsup), but tsc declaration generation has ~30 remaining TypeScript errors. All **4,746 unit tests pass**.

## Current Status

| Component         | Status                      |
| ----------------- | --------------------------- |
| ESM Bundle        | ✅ Builds successfully      |
| CJS Bundle        | ✅ Builds successfully      |
| Unit Tests        | ✅ 4,746 passing, 5 skipped |
| Type Declarations | ⚠️ ~30 errors remain        |

## Recent Fixes Applied

### ✅ WebGPU Types (Fixed)

- **Issue:** 184 errors for missing GPU\* types (GPUDevice, GPUBuffer, GPUTexture, etc.)
- **Fix:** Added `@webgpu/types@^0.1.40` to devDependencies and `"types": ["@webgpu/types"]` to tsconfig.json
- **Result:** Reduced errors from 324 → 140

### ✅ Audio Module Types (Fixed)

- Added `SpatialModel`, `RolloffType`, `LoopMode`, `SequencerState` types
- Added `IEqualizerBand`, `IEqualizerEffect`, `ISpatialEffect`, `IAudioBus`, `ISequencerConfig`, `IPatternRef` interfaces
- Extended `EffectType` and `AudioEventType` unions
- Fixed `createPattern`, `createNote` helper functions

### ✅ WebGPU Buffer Types (Fixed)

- Added type assertions for `writeBuffer` calls in WebGPURenderer.ts

### ✅ ShaderGraph Serialization (Fixed)

- Created `ISerializedShaderGraph` interface
- Updated `toJSON` return type and `fromJSON` parameter type

### ✅ Swarm Module (Fixed)

- Updated `ICollectiveIntelligenceService` interface to match implementation
- Fixed `IHiveContribution.content` type from `unknown` to `string`
- Added `converged` and `iterations` to `refineWithACO` return type

### ✅ Messaging Types (Fixed)

- Added `MessageAckStatus` type and updated `MessageAck` interface
- Extended `MessagePriority` to include string aliases

### ✅ TraitBehavior (Added)

- Created `TraitBehavior` interface in `types/index.ts`

---

## Remaining Issues (~30 Errors)

### Export Conflicts in index.ts

Multiple modules export the same symbols:

- `HeartbeatMessage` (hololand, negotiation)
- `Vote`, `VotingResult` (negotiation)
- `IVector3`, `IQuaternion`, `zeroVector` (physics)
- `ConnectionState`, `createMessage` (hololand, physics)
- `MessageHandler` (swarm)

**Fix:** Use explicit named exports instead of `export *`

### AgentManifest/AgentCapability Export

`AgentTypes.ts` uses `export default` but files try to import as named export.

### Message Interface Properties

`AgentMessaging.ts` uses `recipientId` and `channelId` not in interface

### BinarySerializer Types

- `ArrayBuffer | SharedArrayBuffer` assignment issue
- `IMeshPrimitive` attributes type mismatch

---

## Action Items

1. [ ] Resolve export conflicts in `src/index.ts`
2. [ ] Fix `AgentTypes.ts` export pattern
3. [ ] Extend `Message` interface with missing properties
4. [ ] Fix `BinarySerializer` type assertions

- `ISequencerConfig` - interface not exported
- `IPatternRef` - interface not defined

**Property Mismatches:**

- `IDelayEffect` missing `time` property
- `INote` missing `start` property
- `IPattern` missing `length`, `loop` properties
- `ITrack` missing `sourceId` property
- `ISequence` missing `patternOrder`, `timeSignature`, `loop` properties

**Suggested Fix:**

1. Audit `AudioTypes.ts` interface definitions
2. Add missing exports to `index.ts`
3. Align interface properties with usage

---

### Shader Module (~7 errors)

**File:** `src/shader/graph/ShaderGraph.ts`

**Issues:**

- Line 454: `'id' is specified more than once` - spread operator overwrites property
- Lines 465-468: Type assertion on `json` object missing `name`, `id`, `description`, `version`, `metadata`, `connections` properties

**Suggested Fix:**

```typescript
// Line 454-455: Remove duplicate id
const nodeWithId = {
  ...node,
  // id already in node, don't duplicate
};

// Line 465: Add type assertion
interface ShaderGraphJSON {
  name: string;
  id?: string;
  description?: string;
  version?: string;
  metadata?: unknown;
  nodes: IShaderNode[];
  connections?: unknown[];
}
const graph = new ShaderGraph((json as ShaderGraphJSON).name, (json as ShaderGraphJSON).id);
```

---

### Swarm Module (~12 errors)

**Files:**

- `src/swarm/CollectiveIntelligence.ts`
- `src/swarm/ContributionSynthesizer.ts`
- `src/swarm/SwarmCoordinator.ts`

**Issues:**

- Method signatures don't match `ICollectiveIntelligenceService` interface
- Methods return sync values but interface expects `Promise<T>`

**Misaligned Methods:**
| Method | Interface | Implementation |
|--------|-----------|----------------|
| `createSession` | `Promise<string>` | `IHiveSession` |
| `join` | `Promise<void>` | `void` |
| `leave` | `Promise<void>` | `void` |
| `contribute` | `Promise<void>` | `IHiveContribution` |
| `vote` | 3 params | 4 params |
| `synthesize` | `Promise<unknown>` | `SynthesisResult` |
| `resolve` | `Promise<void>` | `void` |

**Suggested Fix:**
Either update interface to match implementation or wrap returns in `Promise.resolve()`.

---

### Other Modules (~46 errors)

**Files with type issues:**

- `src/consensus/RaftConsensus.ts` - 1 error
- `src/debug/AgentDebugger.ts` - 1 error
- `src/debug/AgentInspector.ts` - 2 errors
- `src/debug/TelemetryCollector.ts` - 1 error
- `src/export/BinarySerializer.ts` - 2 errors
- `src/export/SceneSerializer.ts` - 1 error
- `src/hierarchy/AgentHierarchy.ts` - 2 errors
- `src/hierarchy/DelegationEngine.ts` - 1 error
- `src/hierarchy/HierarchyTypes.ts` - 2 errors
- `src/index.ts` - 10 errors (missing exports)
- `src/messaging/AgentMessaging.ts` - 16 errors
- `src/messaging/MessagingTrait.ts` - 3 errors
- `src/render/postprocess/index.ts` - 3 errors
- `src/render/postprocess/PostProcessEffect.ts` - 48 errors
- `src/render/postprocess/PostProcessPipeline.ts` - 17 errors
- `src/render/postprocess/PostProcessTypes.ts` - 14 errors

---

## Build Success Prerequisites

To achieve a clean build:

1. **Audio Module Refactor** (Highest Priority)
   - Define all missing interfaces
   - Export all types from index
   - Align property names

2. **Swarm Module Async Alignment**
   - Update implementations to match interface contracts
   - Add async/await where needed

3. **Shader Graph Type Safety**
   - Add proper JSON type for deserialization
   - Fix spread operator duplicate key

4. **PostProcess Module**
   - Complete WebGPU integration types
   - Fix effect type definitions

---

## Test Status

| Suite               | Status           | Notes                |
| ------------------- | ---------------- | -------------------- |
| Unit Tests (vitest) | ✅ 4700+ passing | Works without dist   |
| Puppeteer Tests     | ✅ 34/34 passing | New feature complete |
| MCP Server E2E      | ✅ Passing       | No core dependency   |
| Live Integration    | ❌ Blocked       | Requires dist build  |
| tree-sitter         | ❌ Skipped       | CLI not installed    |

---

## Workaround

For development, tests can be run directly via vitest without building:

```bash
pnpm --filter @holoscript/core test
```

The tsup bundler successfully creates ESM/CJS bundles (Build success in 9061ms), but tsc declaration generation fails.

---

## Action Items

- [ ] Fix audio module type definitions
- [ ] Align swarm module with interface contracts
- [ ] Add ShaderGraph JSON type assertion
- [ ] Complete postprocess module types
- [ ] Re-run full build
- [ ] Enable live integration tests
