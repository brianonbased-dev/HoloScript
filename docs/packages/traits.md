# @holoscript/traits

**Standard trait library for HoloScript.** 2,000+ semantic trait definitions covering spatial computing, AI, physics, networking, IoT, and more.

## Overview

Traits are **semantic annotations** that describe what something IS, not HOW it works. The compiler handles the HOW part. This separates intent from implementation.

```holo
object "Sword" {
  @grabbable        // Can be picked up by hand
  @throwable        // Can be thrown
  @physics          // Subject to gravity/collisions
  @collidable       // Can collide with bodies
  @damaging         // Can hurt things on hit
  @tracer           // Leaves a motion trail
  geometry: "model/sword.glb"
}
```

When compiled, `@grabbable` might translate to:

- **Unity**: An Interactable component using the XR Interaction Toolkit
- **Unreal**: A UGripMotionControllerComponent
- **WebGPU**: JavaScript grab detection based on pointer proximity
- **ROS2**: A graspable frame in tf2
- **DTDL**: A RW property for `graspable: boolean`

## Installation

```bash
npm install @holoscript/traits
# or included with core:
npm install @holoscript/core
```

## Trait Categories (2,000+)

### Interaction (200+ traits)

Control how objects respond to user input.

```holo
object "Button" {
  @clickable        // Can be clicked (pointer-based)
  @holdable         // Can be held down
  @draggable        // Can be moved by mouse/hand
  @scrollable       // Can be scrolled through
  @swipeable        // Responds to swipe gestures
}
```

[Browse interaction traits →](../../guides/traits.md#interaction)

### Physics (150+ traits)

Describe physical behavior.

```holo
object "Ball" {
  @collidable       // Has collision geometry
  @rigid            // Is a rigid body
  @physics          // Affected by gravity/forces
  @bouncy           // Has high restitution
  @rollable         // Can roll on surfaces
}
```

[Browse physics traits →](../../guides/traits.md#physics)

### Visual (200+ traits)

Control appearance and rendering.

```holo
object "Neon" {
  @glowing          // Emits light
  @emissive         // Has emission material
  @animated         // Has skeletal/property animation
  @transparent      // Has alpha blending
  @refractive       // Refracts light (if supported)
}
```

[Browse visual traits →](../../guides/traits.md#visual)

### Networking (100+ traits)

Enable multiplayer and replication.

```holo
object "SharedBall" {
  @networked        // Exists on all clients
  @synced           // State synchronized
  @owned            // Has an owner
  @persistent       // Survives sessions
  @replicated       // Replicated to all peers
}
```

[Browse networking traits →](../../guides/traits.md#networking)

### AI & Behavior (300+ traits)

Add intelligence and animation.

```holo
object "Enemy" {
  @npc              // Non-player character
  @pathfinding      // Can navigate
  @llm_agent        // Uses LLM for decisions
  @reactive         // Responds to events
  @state_machine    // Has state graph
}
```

[Browse AI traits →](../../guides/traits.md#ai)

### Spatial (150+ traits)

Control spatial relationships and anchoring.

```holo
object "Sign" {
  @world_locked     // Stays in world space
  @tracked          // Tracks a reference
  @plane_detected   // Snaps to detected planes
  @hand_tracked     // Follows hand position
}
```

[Browse spatial traits →](../../guides/traits.md#spatial)

### Audio (100+ traits)

Sound and acoustic properties.

```holo
object "Speaker" {
  @spatial_audio    // 3D audio positioning
  @ambient          // Background sound
  @reverb           // Room acoustic effects
  @voice_activated  // Responds to speech
}
```

[Browse audio traits →](../../guides/traits.md#audio)

### IoT & Robotics (180+ traits)

Industrial and automation domains.

```holo
object "Sensor" {
  @iot_sensor       // Exposes telemetry data
  @digital_twin     // Mirrors physical device
  @mqtt_bridge      // Connects to MQTT broker
  @telemetry        // Streams metrics
}
```

[Browse IoT traits →](../../guides/traits.md#iot)

### Web3 & Economy (120+ traits)

Blockchain and marketplace features.

```holo
object "Artifact" {
  @nft_asset        // Backed by NFT
  @token_gated      // Requires token to use
  @marketplace      // Can be listed/traded
  @wallet_connected // Requires wallet auth
}
```

[Browse Web3 traits →](../../guides/traits.md#web3)

### Security & Privacy (80+ traits)

Access control and encryption.

```holo
object "Secret" {
  @zk_private       // Zero-knowledge proof required
  @encrypted        // Content encrypted
  @audit_log        // All access logged
}
```

[Browse security traits →](../../guides/traits.md#security)

### Developer (150+ traits)

Debugging, monitoring, and tooling.

```holo
object "PerformanceWidget" {
  @debug            // Shows debug info
  @profiled         // Collects performance metrics
  @observable       // Can be inspected in studio
}
```

## Usage

### Basic

```holo
template "Door" {
  @clickable        // Already does what you need!
  geometry: "model/door.glb"
}
```

### Composition

```holo
object "SmartDoor" {
  @clickable        // User interaction
  @animated         // Door swing animation
  @networked        // Synchronized across players
  @voice_activated  // "Open sesame"

  state { locked: true }
  on_click { this.state.locked = !this.state.locked }
}
```

### Trait Parameters

Some traits accept configuration:

```holo
object "PhysicsObject" {
  @physics {
    mass: 2.5
    restitution: 0.8
    friction: 0.3
  }
  geometry: "sphere"
}
```

## Custom Traits

Define domain-specific traits:

```typescript
// Define a custom trait
const hyperlocal = {
  name: '@hyperlocal',
  category: 'spatial',
  compilers: {
    unity: () => `// Limit visibility to 10m radius`,
    webgpu: () => `// Cull if distance > 10m`,
    ros2: () => `// Broadcast on /hyperlocal topic`,
  },
};

registerTrait(hyperlocal);
```

Then use it:

```holo
object "LocalMarker" {
  @hyperlocal
}
```

## Discovering Traits

### In CLI

```bash
# List all traits
holo traits list

# Filter by category
holo traits list --category networking

# Search for trait
holo traits search "grab"

# Get trait details
holo traits info @grabbable
```

### In Code

```typescript
import { listTraits, getTrait, searchTraits } from '@holoscript/traits';

// Get all traits
const allTraits = listTraits();

// Get specific trait
const grabbable = getTrait('@grabbable');
console.log(grabbable.docString);

// Search
const physicTraits = searchTraits('physics');
```

## Reference

- **[Full trait index →](../../guides/traits.md)** — Complete 2,000+ trait catalog
- **[Trait categories →](../../guides/traits.md)** — Browse by domain
- **[Custom traits guide →](../../guides/extending-traits.md)** — Create your own
- **[Best practices →](../../guides/traits-best-practices.md)** — Design patterns

## Performance

Traits are **compile-time annotations** with zero runtime cost:

- No trait lookups at runtime
- No inheritance overhead
- Compiled away to native platform code
- Traits you don't use don't ship

## See Also

- [Guides: Traits](../../guides/traits.md) — In-depth trait usage
- [Core package](./core.md) — Parser and compilation details
