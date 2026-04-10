# @holoscript/runtime

HoloScript browser runtime - React Three Fiber integration, event bus, storage, and device APIs.

## Installation

```bash
npm install @holoscript/runtime
```

## Overview

The runtime is the execution engine that brings HoloScript code to life in the browser. It handles scene rendering, physics, input, trait execution, and provides utility APIs for events, storage, timing, math, and navigation.

## Entry Points

| Import                           | Description                     |
| -------------------------------- | ------------------------------- |
| `@holoscript/runtime`            | All APIs                        |
| `@holoscript/runtime/events`     | Event bus                       |
| `@holoscript/runtime/storage`    | Storage adapters                |
| `@holoscript/runtime/device`     | Device detection                |
| `@holoscript/runtime/timing`     | Timing utilities                |
| `@holoscript/runtime/math`       | Math helpers                    |
| `@holoscript/runtime/navigation` | Client-side routing             |
| `@holoscript/runtime/browser`    | Scene loader + Three.js runtime |
| `@holoscript/runtime/global`     | IIFE bundle for `<script>` tags |

## Usage

### Unified Runtime Object

```typescript
import { runtime, initRuntime } from '@holoscript/runtime';

// Initialize (registers on globalThis.HoloScriptRuntime)
initRuntime();

// Event bus
runtime.on('player:move', (data) => console.log(data));
runtime.emit('player:move', { x: 0, y: 1, z: -2 });

// Storage
await runtime.storage.set('score', 100);
const score = await runtime.storage.get('score');

// Device
if (runtime.device.isVRCapable) {
  /* enter VR */
}

// Timing
runtime.after(1000, () => console.log('delayed'));
runtime.tween(0, 1, 500, (v) => (mesh.opacity = v), runtime.easing.easeOut);

// Math
const pos = runtime.vec3.lerp(start, end, 0.5);

// Navigation
runtime.navigate('/lobby');
```

### Browser Runtime (Three.js)

```typescript
import { createRuntime } from '@holoscript/runtime/browser';

const rt = createRuntime({
  container: document.getElementById('app'),
  antialias: true,
});

await rt.loadScene('scene.holo');
```

### Event Bus

```typescript
import { on, once, emit, off } from '@holoscript/runtime/events';

const unsub = on('collision', (data) => {
  /* handle */
});
emit('collision', { objectA: 'ball', objectB: 'wall' });
unsub(); // unsubscribe
```

### Storage

```typescript
import { get, set, remove, createIndexedDBStorage } from '@holoscript/runtime/storage';

// Default adapter (localStorage with memory fallback)
await set('key', { nested: 'value' });
const data = await get('key');

// IndexedDB for larger data
const db = createIndexedDBStorage('myApp', 'scenes');
await db.set('scene1', largeSceneData);
```

### Device Detection

```typescript
import { device, isMobile, isVRCapable } from '@holoscript/runtime/device';

if (await device.supportsVR()) {
  /* enable VR button */
}
if (device.prefersReducedMotion) {
  /* disable animations */
}
console.log(device.getMaxTextureSize()); // e.g. 4096
```

### Timing

```typescript
import {
  after,
  every,
  debounce,
  throttle,
  wait,
  createLoop,
  tween,
  easing,
} from '@holoscript/runtime/timing';

const cancel = every(16, () => update());
const loop = createLoop((delta) => animate(delta));
await wait(1000);
tween(0, 100, 2000, (v) => (el.style.left = v + 'px'), easing.easeOutElastic);
```

### Math

```typescript
import { lerp, clamp, vec3, distance3D, noise1D, fbm } from '@holoscript/runtime/math';

const v = vec3.normalize(vec3.sub(target, origin));
const d = distance3D(0, 0, 0, 1, 1, 1);
const n = fbm(x * 0.1, 4, 2.0, 0.5); // fractal noise
```

## Trait System

The runtime includes 50+ trait implementations organized by category:

### Interaction (18 traits)

`GrabbableTrait`, `ThrowableTrait`, `PointableTrait`, `HoverableTrait`, `ClickableTrait`, `DraggableTrait`, `ScalableTrait`, `CollidableTrait`, `PhysicsTrait`, `GravityTrait`, `TriggerTrait`, `GlowingTrait`, `TransparentTrait`, `SpinningTrait`, `FloatingTrait`, `PulseTrait`, `OutlineTrait`, `AnimatedTrait`

### Physics (10 traits)

`ClothTrait`, `SoftBodyTrait`, `FluidTrait`, `BuoyancyTrait`, `RopeTrait`, `WindTrait`, `JointTrait`, `RigidbodyTrait`, `DestructionTrait`, `LookAtTrait`

### AI/Behavior (5 traits)

`BehaviorTreeTrait`, `EmotionTrait`, `GoalOrientedTrait`, `PerceptionTrait`, `MemoryTrait`

### Extended (11 traits)

`RotatableTrait`, `StackableTrait`, `SnappableTrait`, `BreakableTrait`, `CharacterTrait`, `PatrolTrait`, `NetworkedTrait`, `AnchorTrait`, `SpatialAudioTrait`, `ReverbZoneTrait`, `VoiceProximityTrait`

### Advanced (10 traits)

`TeleportTrait`, `HandTrackingTrait`, `HapticTrait`, `UIPanelTrait`, `ParticleSystemTrait`, `WeatherTrait`, `DayNightTrait`, `LODTrait`, `PortalTrait`, `MirrorTrait`

## Physics Engine

Built on Cannon.js (`cannon-es`):

```typescript
import { PhysicsWorld } from '@holoscript/runtime';

const physics = new PhysicsWorld({ gravity: [0, -9.81, 0] });
physics.addBody('ball', mesh, 'dynamic', 1.0);
physics.onCollision('ball', (event) => console.log('hit!', event));
physics.applyImpulse('ball', [0, 5, 0]);
```

## Peer Dependencies

- `react` ^18.0.0 (optional)
- `@react-three/fiber` ^8.0.0 (optional)
- `three` ^0.160.0 (optional)

## License

MIT
