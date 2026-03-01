# Hololand Integration Guide

This guide covers how to build worlds for the **Hololand VR Platform** using HoloScript.

> **Important:** HoloScript is a complete language with its own runtime. Hololand is a first-party VR social platform APPLICATION that uses HoloScript—think "Roblox for VR" or "Steam for spatial computing."

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Asset System](#asset-system)
4. [Semantic Framework](#semantic-framework)
5. [World Definition](#world-definition)
6. [Runtime Integration](#runtime-integration)
7. [Streaming Protocol](#streaming-protocol)
8. [Quick Start Examples](#quick-start-examples)

---

## Overview

### What is HoloScript?

HoloScript is a **complete programming language** for spatial computing with:

- **Full Language Runtime**: `@holoscript/runtime` provides `BrowserRuntime`, `HeadlessRuntime`, `PhysicsWorld`, and `TraitSystem`
- **Parser & Compiler**: Complete language toolchain in `@holoscript/core`
- **Trait System**: Composable behaviors like `@physics`, `@grabbable`, `@networked`
- **Multi-Target Compilation**: Outputs to Unity, Unreal, Godot, WASM, and more

### What is Hololand?

Hololand is a **VR social platform** that uses HoloScript:

- **World Hosting**: Upload and share HoloScript worlds
- **Multiplayer**: Server infrastructure for real-time sessions
- **Discovery**: Find and explore community-created worlds
- **Social**: Friends, avatars, voice chat, parties
- **Monetization**: Creators earn from their worlds

### What This Guide Covers

This guide covers the **HoloScript features** used by Hololand:

- **Asset Management**: Manifests, metadata, smart loading, and dependency resolution
- **Semantic Annotations**: Type-safe property annotations and data binding
- **World Definitions**: Comprehensive schemas for VR/AR worlds
- **Hololand Client**: Connection management and runtime services
- **Streaming Protocol**: Real-time entity synchronization

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HOLOSCRIPT                                   │
│                    (Complete Language + Runtime)                     │
├─────────────────────────────────────────────────────────────────────┤
│  @holoscript/core        │  @holoscript/runtime                     │
│  ├── Parser              │  ├── BrowserRuntime                      │
│  ├── Compiler            │  ├── HeadlessRuntime                     │
│  ├── Type System         │  ├── PhysicsWorld                        │
│  ├── WASM Target         │  ├── TraitSystem                         │
│  └── Traits              │  └── Events/Storage/Device               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  HOLOLAND VR PLATFORM (Application using HoloScript)                 │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Asset System   │  │ Semantic System │  │  World Definition   │  │
│  │                 │  │                 │  │                     │  │
│  │ - Manifest      │  │ - Annotations   │  │ - Metadata          │  │
│  │ - Metadata      │  │ - Bindings      │  │ - Config            │  │
│  │ - Loader        │  │ - Capabilities  │  │ - Environment       │  │
│  │ - Dependencies  │  │ - Registry      │  │ - Zones             │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │             │
│           └────────────────────┼──────────────────────┘             │
│                                ↓                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    HololandClient                             │  │
│  │  - Connection Management (to Hololand servers)                │  │
│  │  - World Registration/Discovery                               │  │
│  │  - Hololand-specific Services (friends, voice, store)         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   StreamProtocol                              │  │
│  │  - WebSocket/WebRTC Transport                                 │  │
│  │  - Entity Synchronization                                     │  │
│  │  - State Delta Compression                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Distinction

| Component      | What It Is                  | Repository                                        |
| -------------- | --------------------------- | ------------------------------------------------- |
| **HoloScript** | Complete language + runtime | `github.com/brianonbased-dev/HoloScript`          |
| **Hololand**   | VR social platform app      | `github.com/brianonbased-dev/Hololand` (separate) |

Hololand is built _with_ HoloScript, similar to how Unity games are built with C#.

---

## Asset System

### Asset Metadata

Define metadata for individual assets:

```typescript
import { createAssetMetadata, inferAssetType, getMimeType } from '@holoscript/core';

// Create asset metadata
const metadata = createAssetMetadata({
  id: 'character-model',
  path: 'assets/characters/hero.glb',
  name: 'Hero Character',
  tags: ['character', 'player', 'humanoid'],
  metadata: {
    author: 'Art Team',
    polyCount: 15000,
  },
});

// Infer asset type from extension
const type = inferAssetType('glb'); // Returns 'model'

// Get MIME type
const mime = getMimeType('glb'); // Returns 'model/gltf-binary'
```

### Asset Manifest

Organize assets into manifests:

```typescript
import { AssetManifest } from '@holoscript/core';

const manifest = new AssetManifest('main-manifest');

// Add assets
manifest.addAsset({
  id: 'hero-model',
  path: 'assets/hero.glb',
  name: 'Hero',
});

manifest.addAsset({
  id: 'hero-texture',
  path: 'assets/hero-diffuse.png',
  name: 'Hero Texture',
});

// Query assets
const models = manifest.findByType('model');
const textures = manifest.findByTag('character');

// Export to JSON
const json = manifest.toJSON();
```

### Asset Registry

Centralized asset management:

```typescript
import { getAssetRegistry } from '@holoscript/core';

const registry = getAssetRegistry();

// Register a manifest
registry.registerManifest('level-1', level1Manifest);

// Set active manifest
registry.setActiveManifest('level-1');

// Query across all manifests
const allModels = registry.findByType('model');
```

### Smart Asset Loader

Intelligent asset loading with priority queuing:

```typescript
import { SmartAssetLoader } from '@holoscript/core';

const loader = new SmartAssetLoader({
  maxConcurrent: 4,
  timeout: 30000,
  retryCount: 3,
});

// Load with priority
const asset = await loader.load('hero-model', { priority: 'high' });

// Batch loading
const assets = await loader.loadBatch(['model-1', 'model-2', 'texture-1']);

// Get loading stats
const stats = loader.getStats();
console.log(`Loaded: ${stats.loaded}, Failed: ${stats.failed}`);
```

### Dependency Graph

Resolve asset dependencies:

```typescript
import { AssetDependencyGraph } from '@holoscript/core';

const graph = new AssetDependencyGraph();

// Add dependencies
graph.addDependency('scene', 'hero-model');
graph.addDependency('hero-model', 'hero-texture');
graph.addDependency('hero-model', 'hero-skeleton');

// Get load order (topologically sorted)
const loadOrder = graph.getLoadOrder('scene');
// Returns: ['hero-texture', 'hero-skeleton', 'hero-model', 'scene']
```

---

## Semantic Framework

### Semantic Annotations

Add semantic meaning to entities:

```typescript
import { SemanticAnnotation, PropertyAnnotations } from '@holoscript/core';

// Create an annotation
const annotation = new SemanticAnnotation({
  entityId: 'player-character',
  category: 'character',
  type: 'player',
  properties: {
    movementSpeed: 5.0,
    jumpHeight: 2.0,
  },
});

// Property-specific annotations
const position = PropertyAnnotations.position('entity.position');
const rotation = PropertyAnnotations.rotation('entity.rotation');
const velocity = PropertyAnnotations.velocity('entity.velocity');
const color = PropertyAnnotations.color('entity.material.color');
```

### Semantic Registry

Organize and query semantic data:

```typescript
import { getSemanticRegistry } from '@holoscript/core';

const registry = getSemanticRegistry();

// Register annotations
registry.register(playerAnnotation);
registry.register(enemyAnnotation);

// Query by category
const characters = registry.findByCategory('character');

// Query by type
const players = registry.findByType('player');

// Get all registered
const all = registry.getAll();
```

### Data Binding

Create reactive data connections:

```typescript
import { createBinding, BindingManager } from '@holoscript/core';

// Create a binding
const binding = createBinding({
  source: 'player.health',
  target: 'healthBar.fillAmount',
  transform: (health) => health / 100, // Normalize 0-1
  bidirectional: false,
});

// Use the binding manager
const manager = new BindingManager();
manager.addBinding(binding);

// Update propagates through bindings
manager.setValue('player.health', 75);
// healthBar.fillAmount is now 0.75
```

### Capability Matrix

Define platform capabilities:

```typescript
import { CapabilityMatrix, CommonFeatures } from '@holoscript/core';

const matrix = new CapabilityMatrix();

// Register platform capabilities
matrix.registerPlatform('quest', {
  features: [CommonFeatures.PHYSICS, CommonFeatures.SPATIAL_AUDIO, CommonFeatures.HAND_TRACKING],
  limits: {
    maxTriangles: 750000,
    maxTextureMB: 256,
    maxDrawCalls: 100,
  },
});

// Check capabilities
const hasPhysics = matrix.hasFeature('quest', CommonFeatures.PHYSICS);
```

---

## World Definition

### Creating Worlds

```typescript
import { createWorldDefinition, createWorldMetadata, createWorldConfig } from '@holoscript/core';

// Create a complete world
const world = createWorldDefinition('my-world', 'My VR World');

// World includes:
// - metadata: id, name, version, platforms, etc.
// - config: physics, rendering, audio, networking
// - environment: skybox, lighting, post-processing
// - zones: spatial regions with triggers
// - spawnPoints: player entry points
// - sceneGraph: entity hierarchy
```

### World Configuration

```typescript
const config = createWorldConfig({
  maxUsers: 50,
  physics: {
    engine: 'rapier',
    gravity: { x: 0, y: -9.81, z: 0 },
  },
  rendering: {
    targetFPS: 72,
    shadows: true,
    shadowQuality: 'medium',
  },
  networking: {
    tickRate: 20,
    protocol: 'websocket',
    compression: 'lz4',
  },
});
```

### Zones and Spawn Points

```typescript
const world = createWorldDefinition('arena', 'Battle Arena', {
  zones: [
    {
      id: 'safe-zone',
      name: 'Safe Zone',
      bounds: {
        type: 'sphere',
        center: { x: 0, y: 0, z: 0 },
        radius: 50,
      },
      priority: 10,
      triggers: [
        {
          type: 'enter',
          action: 'disablePvP',
          params: {},
          cooldown: 0,
          filter: 'player',
        },
      ],
      tags: ['safe', 'spawn'],
    },
  ],
  spawnPoints: [
    {
      id: 'spawn-1',
      name: 'Blue Team Spawn',
      position: { x: -50, y: 0, z: 0 },
      rotation: { x: 0, y: 90, z: 0 },
      type: 'default',
      priority: 10,
      capacity: 25,
      tags: ['blue-team'],
    },
  ],
});
```

---

## Runtime Integration

### HololandClient

Connect to the Hololand runtime:

```typescript
import { getHololandClient, connectToHololand, disconnectFromHololand } from '@holoscript/core';

// Get singleton client
const client = getHololandClient();

// Connect
await connectToHololand({
  serverUrl: 'wss://hololand.example.com',
  authToken: 'user-token',
});

// Check connection
const info = client.getConnectionInfo();
console.log(`State: ${info.state}, Latency: ${info.latency}ms`);

// Register a world
const worldId = await client.registerWorld(world);

// Join a world
const worldDef = await client.joinWorld(worldId);

// Disconnect
await disconnectFromHololand();
```

### Event System

```typescript
const client = getHololandClient();

// Subscribe to events
const unsubscribe = client.on('connection:state_changed', (event) => {
  console.log(`Connection state: ${event.state}`);
});

client.on('worldJoined', ({ worldId, world }) => {
  console.log(`Joined world: ${world.metadata.name}`);
});

client.on('worldLeft', ({ worldId }) => {
  console.log(`Left world: ${worldId}`);
});

// Emit custom events
client.emit('custom:event', { data: 'value' });

// Unsubscribe
unsubscribe();
```

### Runtime Services

```typescript
const services = client.getServices();

// Asset streaming
await services.assets.prefetch(['model-1', 'texture-1']);
const asset = await services.assets.requestAsset('hero-model', 10);

// Networking
services.networking.send('game:action', { type: 'jump' });
services.networking.subscribe('game:state', (state) => {
  updateGameState(state);
});

// Audio
const handle = services.audio.play('explosion', {
  volume: 0.8,
  spatial: true,
  position: { x: 10, y: 0, z: 5 },
});

// Physics
// ... physics service methods
```

---

## Streaming Protocol

### Protocol Constants

```typescript
import { PROTOCOL_VERSION, MAX_MESSAGE_SIZE, HEARTBEAT_INTERVAL } from '@holoscript/core';

console.log(`Protocol v${PROTOCOL_VERSION}`);
console.log(`Max message: ${MAX_MESSAGE_SIZE / 1024}KB`);
console.log(`Heartbeat: ${HEARTBEAT_INTERVAL}ms`);
```

### StreamProtocol

```typescript
import { getStreamProtocol } from '@holoscript/core';

const protocol = getStreamProtocol();

// Check connection
if (protocol.isConnected()) {
  // Send entity update
  protocol.sendEntityUpdate({
    entityId: 'player-1',
    position: { x: 10, y: 0, z: 5 },
    rotation: { x: 0, y: 45, z: 0 },
  });
}

// Subscribe to message types
protocol.on('entity_update', (data) => {
  applyEntityUpdate(data);
});

protocol.on('state_sync', (data) => {
  synchronizeState(data);
});
```

---

## Quick Start Examples

### Basic World Setup

```typescript
import {
  createWorldDefinition,
  getHololandClient,
  connectToHololand,
  AssetManifest,
} from '@holoscript/core';

async function initializeWorld() {
  // 1. Create asset manifest
  const manifest = new AssetManifest('game-assets');
  manifest.addAsset({
    id: 'environment',
    path: 'assets/environment.glb',
    name: 'Environment',
  });

  // 2. Create world definition
  const world = createWorldDefinition('game-world', 'My Game World');

  // 3. Connect to Hololand
  const client = getHololandClient();
  await connectToHololand({
    serverUrl: 'wss://hololand.io',
  });

  // 4. Register and join world
  await client.registerWorld(world);
  await client.joinWorld(world.metadata.id);

  // 5. Load assets
  const services = client.getServices();
  await services.assets.prefetch(['environment']);

  console.log('World initialized!');
}
```

### Entity with Semantic Annotations

```typescript
import {
  SemanticAnnotation,
  PropertyAnnotations,
  createBinding,
  getSemanticRegistry,
  BindingManager,
} from '@holoscript/core';

// Define player entity semantics
const playerSemantics = new SemanticAnnotation({
  entityId: 'player-1',
  category: 'character',
  type: 'player',
  properties: {
    health: 100,
    maxHealth: 100,
    isAlive: true,
  },
});

// Register semantics
const registry = getSemanticRegistry();
registry.register(playerSemantics);

// Create UI bindings
const bindingManager = new BindingManager();

bindingManager.addBinding(
  createBinding({
    source: 'player-1.health',
    target: 'ui.healthBar.value',
    transform: (health) => health / 100,
  })
);

bindingManager.addBinding(
  createBinding({
    source: 'player-1.isAlive',
    target: 'ui.respawnButton.visible',
    transform: (alive) => !alive,
  })
);
```

---

## API Reference

### Asset Modules

| Export                 | Description                     |
| ---------------------- | ------------------------------- |
| `createAssetMetadata`  | Create asset metadata object    |
| `inferAssetType`       | Infer asset type from extension |
| `getMimeType`          | Get MIME type for extension     |
| `AssetManifest`        | Asset collection management     |
| `AssetRegistry`        | Global asset registry           |
| `AssetValidator`       | Validate asset metadata         |
| `SmartAssetLoader`     | Intelligent asset loading       |
| `AssetDependencyGraph` | Dependency resolution           |

### Semantic Modules

| Export                | Description                 |
| --------------------- | --------------------------- |
| `SemanticAnnotation`  | Entity semantic metadata    |
| `SemanticRegistry`    | Annotation registry         |
| `PropertyAnnotations` | Property annotation helpers |
| `createBinding`       | Create data binding         |
| `BindingManager`      | Manage bindings             |
| `CapabilityMatrix`    | Platform capabilities       |

### Hololand Modules

| Export                   | Description              |
| ------------------------ | ------------------------ |
| `createWorldDefinition`  | Create world definition  |
| `createWorldMetadata`    | Create world metadata    |
| `createWorldConfig`      | Create world config      |
| `HololandClient`         | Runtime client           |
| `getHololandClient`      | Get client singleton     |
| `connectToHololand`      | Connect to server        |
| `disconnectFromHololand` | Disconnect from server   |
| `StreamProtocol`         | Streaming protocol       |
| `getStreamProtocol`      | Get protocol singleton   |
| `PROTOCOL_VERSION`       | Protocol version string  |
| `MAX_MESSAGE_SIZE`       | Max message size (bytes) |
| `HEARTBEAT_INTERVAL`     | Heartbeat interval (ms)  |

---

## See Also

- [Graphics Integration](./HOLOLAND_GRAPHICS_INTEGRATION.md) - Graphics pipeline integration
- [Hololand Audit](./HOLOLAND_AUDIT.md) - Codebase audit and analysis
- [VRChat/Unity Guide](./VRCHAT_UNITY_GUIDE.md) - Unity platform integration
