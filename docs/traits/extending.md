# HoloScript Trait Extension Guide

Create custom traits for spatial computing, robotics, XR, and AI scenarios.

## Overview

HoloScript's trait system is designed for extensibility. You can create custom traits that integrate seamlessly with the runtime, physics engine, networking, and AI systems.

## Quick Start

```typescript
import { registerTrait } from '@holoscript/core';

registerTrait({
  name: '@pulse_glow',
  defaultConfig: { color: 'blue', speed: 1.0 },

  onAttach(node, config, context) {
    node.userData.pulseTime = 0;
  },

  onUpdate(node, config, context, delta) {
    node.userData.pulseTime += delta * config.speed;
    const intensity = (Math.sin(node.userData.pulseTime) + 1) / 2;
    context.emit('glow_intensity', { nodeId: node.id, intensity });
  },
});
```

Use in HoloScript:

```holoscript
sphere {
  @pulse_glow(color=blue, speed=2.0)
}
```

## Trait Anatomy

```typescript
interface TraitHandler<TConfig = unknown> {
  // Unique trait identifier (must start with @)
  name: VRTraitName;

  // Default values for all config properties
  defaultConfig: TConfig;

  // Lifecycle hooks (all optional)
  onAttach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onDetach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onUpdate?: (node: HSPlusNode, config: TConfig, context: TraitContext, delta: number) => void;
  onEvent?: (node: HSPlusNode, config: TConfig, context: TraitContext, event: TraitEvent) => void;
}
```

## Lifecycle Hooks

### `onAttach(node, config, context)` 🟢

Called **once** when the trait is added to a node.

Use for: initialization, setup, resource allocation.

```typescript
onAttach(node, config, context) {
  // Create resources
  const sound = context.audio.createSource(config.soundUrl);
  node.userData.sound = sound;

  // Subscribe to events
  context.emit('trait_ready', { traitName: '@my_trait', nodeId: node.id });
}
```

### `onDetach(node, config, context)` 🔴

Called **once** when the trait is removed.

Use for: cleanup, resource disposal, event unsubscription.

```typescript
onDetach(node, config, context) {
  // Cleanup resources
  if (node.userData.sound) {
    node.userData.sound.stop();
    node.userData.sound = null;
  }
}
```

### `onUpdate(node, config, context, delta)` 🔵

Called **every frame** during active simulation.

Use for: animations, physics, AI ticks, state updates.

```typescript
onUpdate(node, config, context, delta) {
  // delta = seconds since last frame (typically ~0.016 for 60fps)
  node.userData.angle = (node.userData.angle || 0) + config.speed * delta;
  const angle = node.userData.angle;
  // Apply rotation...
}
```

> **⚡ Performance Tip:** Keep `onUpdate` extremely lightweight. It runs every frame for every trait on every object. Avoid allocations and complex computations.

### `onEvent(node, config, context, event)` 🟡

Called when the node receives an event.

Use for: user input, collision, network messages.

```typescript
onEvent(node, config, context, event) {
  switch (event.type) {
    case 'grab':
      config.isGrabbed = true;
      context.emit('grabbed', { nodeId: node.id });
      break;

    case 'release':
      config.isGrabbed = false;
      break;

    case 'collision':
      context.audio.playSound(config.impactSound, {
        position: event.payload.point,
        volume: Math.min(1, event.payload.impulse / 10)
      });
      break;
  }
}
```

## The TraitContext API

The `context` parameter provides access to all runtime systems:

### VR/XR Context

```typescript
context.vr.hands.left; // Left hand tracking data
context.vr.hands.right; // Right hand tracking data
context.vr.headset.position; // Head position [x, y, z]

// Get pointer ray from controller
const ray = context.vr.getPointerRay('right');
if (ray) {
  const { origin, direction } = ray;
}
```

### Physics Context

```typescript
// Apply forces
context.physics.applyVelocity(node, { x: 0, y: 5, z: 0 }); // Launch upward
context.physics.applyAngularVelocity(node, { x: 0, y: 1, z: 0 }); // Spin

// Raycasting
const hit = context.physics.raycast(origin, direction, 10.0);
if (hit) {
  console.log('Hit:', hit.nodeId, 'Distance:', hit.distance);
}

// Query body state
const vel = context.physics.getBodyVelocity(node.id);
const pos = context.physics.getBodyPosition(node.id);
```

### Audio Context

```typescript
// Spatial audio
context.audio.playSound('/sounds/whoosh.ogg', {
  position: { x: 0, y: 1, z: 0 },
  volume: 0.8,
  spatial: true, // 3D positional audio
});
```

### State & Events

```typescript
// Read/write reactive state
const health = context.getState().health as number;
context.setState({ health: health - 10 });

// Emit events to other traits/systems
context.emit('health_changed', { nodeId: node.id, health });
context.emit('death', { nodeId: node.id });
```

### Accessibility Context

```typescript
// Screen reader support
context.accessibility?.announce('Item picked up');
context.accessibility?.setAltText(node.id, 'A red cube (grabbable)');
```

## Configuration Schema

Define strongly-typed configuration with TypeScript:

```typescript
interface ParticleConfig {
  count: number;
  color: string;
  speed: number;
  lifetime: number;
  spread: number;
  loop: boolean;
}

const ParticleTrait: TraitHandler<ParticleConfig> = {
  name: '@particles' as any,
  defaultConfig: {
    count: 100,
    color: 'white',
    speed: 2.0,
    lifetime: 2.0,
    spread: 45,
    loop: true,
  },
  // ...
};
```

HoloScript syntax:

```holoscript
sphere {
  @particles(count=200, color=red, speed=3.0)
}
```

## Complete Examples

### 1. Health Bar Trait

Shows a floating health bar above objects:

```typescript
interface HealthBarConfig {
  maxHealth: number;
  height: number; // Offset above object
  width: number; // Bar width in meters
  showText: boolean; // Show numeric value
}

registerTrait<HealthBarConfig>({
  name: '@health_bar',
  defaultConfig: { maxHealth: 100, height: 1.5, width: 0.5, showText: true },

  onAttach(node, config, context) {
    // Create UI panel above object
    node.userData.healthBar = {
      currentHealth: config.maxHealth,
      barObject: createBarMesh(config.width),
    };
    context.emit('health_bar_created', { nodeId: node.id });
  },

  onUpdate(node, config, context, delta) {
    const bar = node.userData.healthBar;
    if (!bar) return;

    // Update bar fill based on health
    const percent = bar.currentHealth / config.maxHealth;
    bar.barObject.scale.x = percent;
    bar.barObject.material.color = percent > 0.5 ? 'green' : percent > 0.25 ? 'yellow' : 'red';
  },

  onEvent(node, config, context, event) {
    if (event.type === 'take_damage') {
      const damage = event.payload as number;
      node.userData.healthBar.currentHealth = Math.max(
        0,
        node.userData.healthBar.currentHealth - damage
      );

      if (node.userData.healthBar.currentHealth <= 0) {
        context.emit('death', { nodeId: node.id });
      }
    }

    if (event.type === 'heal') {
      const amount = event.payload as number;
      node.userData.healthBar.currentHealth = Math.min(
        config.maxHealth,
        node.userData.healthBar.currentHealth + amount
      );
    }
  },

  onDetach(node, config, context) {
    node.userData.healthBar = null;
  },
});
```

Usage:

```holoscript
enemy_robot {
  @health_bar(maxHealth=200, showText=true)
  @character
  @networked
}
```

### 2. MQTT Sensor Trait

Streams real-time IoT data into the scene:

```typescript
interface MQTTSensorConfig {
  brokerUrl: string;
  topic: string;
  updateRate: number; // Hz
  visualize: boolean; // Show sensor readings as color
}

registerTrait<MQTTSensorConfig>({
  name: '@mqtt_sensor',
  defaultConfig: {
    brokerUrl: 'mqtt://localhost:1883',
    topic: 'sensors/#',
    updateRate: 10,
    visualize: true,
  },

  onAttach(node, config, context) {
    // Connect to MQTT broker
    const client = connectMQTT(config.brokerUrl);
    client.subscribe(config.topic);

    client.on('message', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      node.userData.sensorData = data;
      context.emit('sensor_update', { nodeId: node.id, data });
    });

    node.userData.mqttClient = client;
  },

  onUpdate(node, config, context, delta) {
    if (!config.visualize || !node.userData.sensorData) return;

    // Visualize sensor value as color
    const value = node.userData.sensorData.value || 0;
    const normalized = Math.min(1, Math.max(0, value / 100));
    // Interpolate green → yellow → red based on value
    const color = lerpColor([0, 255, 0], [255, 0, 0], normalized);
    // Apply color to material...
  },

  onDetach(node, config, context) {
    node.userData.mqttClient?.end();
  },
});
```

### 3. LLM Behavior Trait

Drives object behavior with an LLM:

```typescript
interface LLMBehaviorConfig {
  model: string;
  systemPrompt: string;
  updateInterval: number; // Seconds between LLM calls
  responseTimeout: number; // Max wait time
}

registerTrait<LLMBehaviorConfig>({
  name: '@llm_behavior',
  defaultConfig: {
    model: 'claude-3-opus',
    systemPrompt: 'You control a game character. Respond with JSON actions.',
    updateInterval: 2.0,
    responseTimeout: 5.0,
  },

  onAttach(node, config, context) {
    node.userData.llmTimer = 0;
    node.userData.context = [];
  },

  onUpdate(node, config, context, delta) {
    node.userData.llmTimer += delta;

    if (node.userData.llmTimer < config.updateInterval) return;
    node.userData.llmTimer = 0;

    // Gather scene context
    const sceneContext = {
      position: context.physics.getBodyPosition(node.id),
      nearbyObjects: getNearbyObjects(node.id),
      playerDistance: getPlayerDistance(node.id),
    };

    // Async LLM call (non-blocking)
    queryLLM(config.model, config.systemPrompt, sceneContext)
      .then((response) => {
        const action = JSON.parse(response);
        context.emit('llm_action', { nodeId: node.id, action });
      })
      .catch((err) => {
        console.warn('LLM query failed:', err);
      });
  },
});
```

## Registering Traits

```typescript
import { registerTrait, TraitRegistry } from '@holoscript/core';

// Register a single trait
registerTrait(MyCustomTrait);

// Register multiple traits
TraitRegistry.registerBatch([HealthBarTrait, MQTTSensorTrait, LLMBehaviorTrait]);

// Plugin pattern - register with namespace
function installGamePlugin(registry: TraitRegistry) {
  registry.register('@game/health_bar', HealthBarTrait);
  registry.register('@game/inventory', InventoryTrait);
  registry.register('@game/respawn', RespawnTrait);
}
```

## Testing Traits

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMockContext, createMockNode } from '@holoscript/core/testing';
import { MyTrait } from './MyTrait';

describe('MyTrait', () => {
  it('initializes correctly on attach', () => {
    const node = createMockNode();
    const config = { ...MyTrait.defaultConfig };
    const context = createMockContext();

    MyTrait.onAttach?.(node, config, context);

    expect(node.userData.initialized).toBe(true);
  });

  it('emits event on update', () => {
    const node = createMockNode();
    const config = { ...MyTrait.defaultConfig };
    const context = createMockContext();
    const emitSpy = vi.spyOn(context, 'emit');

    MyTrait.onUpdate?.(node, config, context, 0.016);

    expect(emitSpy).toHaveBeenCalledWith('trait_updated', expect.any(Object));
  });

  it('handles events correctly', () => {
    const node = createMockNode();
    const config = { ...MyTrait.defaultConfig };
    const context = createMockContext();

    MyTrait.onEvent?.(node, config, context, {
      type: 'grab',
      payload: {},
    });

    expect(config.isGrabbed).toBe(true);
  });
});
```

## Trait Best Practices

### 1. Minimal `onUpdate`

```typescript
// ✅ Good - O(1) operation
onUpdate(node, config, context, delta) {
  node.userData.time += delta;
}

// ❌ Bad - allocates every frame
onUpdate(node, config, context, delta) {
  const newPos = new Vector3(...);  // Avoid allocations!
}
```

### 2. Use `userData` for State

```typescript
// ✅ Good - persists across frames
node.userData.pulsePhase = 0;

// ❌ Bad - local variable lost
let pulsePhase = 0;
```

### 3. Cleanup in `onDetach`

```typescript
onAttach(node, config, context) {
  node.userData.interval = setInterval(..., 1000);
},

onDetach(node, config, context) {
  clearInterval(node.userData.interval);  // Always cleanup!
}
```

### 4. Emit Events for Cross-Trait Communication

```typescript
// Trait A emits
context.emit('item_collected', { itemId: node.id, type: config.type });

// Trait B listens via onEvent
onEvent(node, config, context, event) {
  if (event.type === 'item_collected') {
    updateInventory(event.payload.itemId);
  }
}
```

### 5. TypeScript Types

```typescript
// ✅ Good - fully typed config
interface GlowConfig {
  color: `#${string}`;  // Hex color string
  intensity: number;     // 0.0 - 1.0
  pulsate: boolean;
}

// ❌ Bad - any type
defaultConfig: { color: 'blue' as any, intensity: 0.5 }
```

## Publishing Custom Traits

### 1. Package Structure

```
my-holoscript-traits/
├── src/
│   ├── index.ts          # Export all traits
│   ├── HealthBarTrait.ts
│   └── MQTTTrait.ts
├── package.json
│   # "name": "@myorg/holoscript-traits"
│   # "keywords": ["holoscript", "trait"]
└── README.md
```

### 2. Export Pattern

```typescript
// src/index.ts
export { HealthBarTrait } from './HealthBarTrait';
export { MQTTTrait } from './MQTTTrait';

// Auto-register on import
import { registerTrait } from '@holoscript/core';
registerTrait(HealthBarTrait);
registerTrait(MQTTTrait);
```

### 3. HoloScript Trait Registry

Submit your traits to the [HoloScript Trait Registry](https://holoscript.net/registry) to:

- Make traits discoverable by the community
- Get featured in MCP server suggestions
- Receive compatibility testing
- Access the trait documentation generator

---

## API Reference

Full TypeDoc-generated API reference: [API Reference](/api/)

Key interfaces: `TraitHandler<T>`, `TraitContext`, `VRTraitSystem`, `VRTraitRegistry`

> Run `pnpm docs:api` to generate full TypeDoc reference in `docs/api/`

---

**License:** MIT | **Version:** 3.4.0 | [GitHub](https://github.com/brianonbased-dev/HoloScript)
