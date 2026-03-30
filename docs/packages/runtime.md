# @holoscript/runtime

**Browser runtime for HoloScript scenes.** Executes compiled HoloScript compositions in the browser with React Three Fiber, event bus, device API integration, and persistent storage.

## Overview

The runtime is the execution layer that brings HoloScript compositions to life in web environments. It handles:

- **Scene graph execution** — Instantiate objects, manage state, handle events
- **Physics & interactions** — Detect clicks, hovers, grabs, and gesture inputs
- **Rendering** — Three.js integration via React Three Fiber
- **Device APIs** — Access hand tracking, eye gaze, audio input, haptics
- **State management** — Reactive properties, computed values, observers
- **Network sync** — Replicate state across multiplayer connections
- **Persistence** — Save/load game state to browser storage or cloud

## Installation

```bash
npm install @holoscript/runtime
```

## Quick Start

```typescript
import { createSceneRuntime } from '@holoscript/runtime';
import { parseComposition } from '@holoscript/core';

// Parse a .holo composition
const source = `
  composition "MyScene" {
    object "Cube" {
      @grabbable
      @physics
      geometry: "box"
      position: [0, 1, 0]
    }
  }
`;

const ast = parseComposition(source);

// Create and run runtime
const runtime = createSceneRuntime(ast, {
  container: document.getElementById('scene'),
  physics: { gravity: [0, -9.8, 0] },
  eventsEnabled: true,
});

runtime.start();
```

## Core API

### Scene Lifecycle

```typescript
// Create runtime
const runtime = createSceneRuntime(ast, options);

// Start execution
runtime.start();

// Pause/resume
runtime.pause();
runtime.resume();

// Stop and cleanup
runtime.stop();
```

### Object Queries

```typescript
// Find objects by name or type
const cube = runtime.getObject('Cube');
const dancers = runtime.getObjectsByType('Dancer');

// Iterate all objects
runtime.getObjects().forEach((obj) => {
  console.log(obj.name, obj.position);
});
```

### State & Events

```typescript
// Access object state
const health = cube.state.get('health');
cube.state.set('health', 100);

// Listen to state changes
cube.state.subscribe('health', (newValue) => {
  console.log('Health changed:', newValue);
});

// Emit events
cube.emit('customEvent', { data: 'payload' });

// Listen to events
cube.on('customEvent', (event) => {
  console.log('Event received:', event.data);
});
```

### Animation & Physics

```typescript
// Play animation
cube.animate({
  property: 'position.y',
  to: 2,
  duration: 1000,
  easing: 'easeInOut',
});

// Apply force (if physics enabled)
cube.physics.applyForce([10, 0, 0]);
cube.physics.setVelocity([1, 0, 0]);
```

## Player Input

### Pointer & Grab

```typescript
// Listen to pointer events
cube.on('pointEnter', () => console.log('Pointed at'));
cube.on('pointExit', () => console.log('Not pointed'));
cube.on('grabbed', (event) => console.log('Grabbed by:', event.hand));
cube.on('released', () => console.log('Released'));
```

### Hand Tracking

```typescript
// Get hand positions (if available)
const leftHand = runtime.getHand('left');
if (leftHand) {
  console.log('Left hand position:', leftHand.position);
  console.log('Palm normal:', leftHand.palmNormal);
}
```

### Gestures

```typescript
// Listen to gesture detection
cube.on('gesture', (event) => {
  if (event.name === 'pinch') {
    console.log('Pinch detected');
  }
});
```

## Network Multiplication

For multiplayer scenes, sync state across clients:

```typescript
// Enable network replication for an object
const sharedBall = runtime.getObject('Ball');
await sharedBall.network.claim(); // Claim ownership
sharedBall.network.sync('position', 'rotation'); // Sync these properties
sharedBall.on('stateChanged', (data) => {
  // Another player modified this object
});
```

## Storage & Persistence

```typescript
// Save current scene state
await runtime.save('myGame');

// Load previously saved state
await runtime.load('myGame');

// Get available saves
const saves = await runtime.listSaves();
```

## Configuration

```typescript
const runtime = createSceneRuntime(ast, {
  // Rendering
  container: domElement,
  width: 800,
  height: 600,
  pixelRatio: window.devicePixelRatio,

  // Physics
  physics: {
    gravity: [0, -9.8, 0],
    substeps: 2,
    solverIterations: 4,
  },

  // Input
  input: {
    pointerEnabled: true,
    grabEnabled: true,
    gestureEnabled: true,
    handTrackingEnabled: true,
    eyeTrackingEnabled: false,
  },

  // Performance
  lod: { enabled: true, maxDistance: 100 },
  shadowQuality: 'medium', // 'low' | 'medium' | 'high'

  // Debug
  debug: false,
  showPhysicsDebug: false,
});
```

## Best Practices

- **Lazy load** heavy models and textures for better startup performance
- **Use LOD** (Level of Detail) for complex scenes with many objects
- **Optimize physics** — Disable physics on non-interactive objects
- **Batch state updates** to reduce re-renders
- **Clean up** listeners and timeouts in object destruction hooks
- **Test on device** — Behavior may differ on mobile/VR hardware

## See Also

- [Compiler targets](../compilers/) — Where runtime output actually runs
- [Animation guide](../guides/animations.md) — Advanced animation techniques
- [Physics setup](../guides/physics.md) — Physics configuration
- [Multiplayer networking](../guides/networking.md) — Sync across players
