# @holoscript/sdk

**JavaScript/TypeScript SDK for Web** and Node.js applications. Create and manage HoloScript scenes programmatically.

## Installation

```bash
npm install @holoscript/sdk
```

## Quick Start

```typescript
import { HoloScene, createObject } from '@holoscript/sdk';

// Create a scene
const scene = new HoloScene('MyWorld');

// Add objects
const cube = createObject('Cube', {
  geometry: 'box',
  traits: ['@grabbable', '@physics'],
  position: [0, 1, 0],
});

scene.add(cube);

// Render to Three.js
const renderer = new HoloRenderer(canvas);
renderer.render(scene);
```

## Scene Management

```typescript
import { HoloScene } from '@holoscript/sdk';

const scene = new HoloScene('Game');

// Add objects
scene.add(object);

// Query
const objects = scene.getObjects();
const cube = scene.getObject('Cube');

// Events
scene.on('objectAdded', (obj) => console.log('Added:', obj.name));

// Serialize
const json = scene.toJSON();
localStorage.setItem('scene', json);

// Load
const loaded = HoloScene.fromJSON(json);
```

## Object API

```typescript
const obj = scene.getObject('Player');

// Properties
obj.position = [0, 0, 0];
obj.rotation = [0, Math.PI / 2, 0];
obj.scale = 1;

// State
obj.state.health = 100;
obj.state.subscribe('health', (val) => console.log(val));

// Traits
obj.hasT rait('@grabbable');
obj.addTrait('@physics');

// Animation
obj.animate({
  property: 'position.y',
  to: 2,
  duration: 1000,
  easing: 'easeInOut'
});
```

## Rendering

### Three.js

```typescript
import { HoloThreeRenderer } from '@holoscript/sdk/renderers/three';

const renderer = new HoloThreeRenderer(canvas);
renderer.render(scene);

// Interactive
renderer.onGrab = (obj) => {
  obj.state.grabbed = true;
};
```

### WebGPU

```typescript
import { HoloWebGPURenderer } from '@holoscript/sdk/renderers/webgpu';

const renderer = new HoloWebGPURenderer(canvas);
renderer.render(scene);
```

## See Also

- [Runtime](./runtime.md) — Browser scene execution
- [CLI](./cli.md) — Command-line tools
