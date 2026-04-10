# @holoscript/vm-bridge

**VM Bridge** — Connects HoloVM (60fps spatial scene execution) with uAAL VM (7-phase cognitive agent cycles).

Enables spatial cognitive agents that perceive ECS worlds, run autonomous decision cycles, and mutate scenes in real-time.

## Quick Start

```ts
import { HoloVM } from '@holoscript/holo-vm';
import { UAALVirtualMachine } from '@holoscript/uaal';
import { SpatialCognitiveAgent } from '@holoscript/vm-bridge';

// 1. Initialize both VMs
const holoVM = new HoloVM();
const uaalVM = new UAALVirtualMachine();

// 2. Create spatial cognitive agent
const agent = new SpatialCognitiveAgent(
  holoVM.getWorld(), // ECS world reference
  uaalVM,
  {
    cognitiveHz: 2, // Run cognitive cycle every 500ms
    enableLogging: true,
    maxActionsPerTick: 50,
  }
);

// 3. Run the combined tick loop (60fps HoloVM + 2Hz cognitive cycles)
let time = 0;
const dt = 16.67; // 60fps

function mainLoop() {
  // HoloVM physics/rendering tick
  holoVM.tick(dt);

  // Agent cognitive tick (perceive → decide → mutate)
  agent.tick(time).then((result) => {
    if (result.decided) {
      console.log(`Cognitive cycle executed: ${result.actionsApplied} actions applied`);
      console.log(`Scene entities: ${result.sceneSnapshot?.entityCount}`);
    }
  });

  time += dt;
  requestAnimationFrame(mainLoop);
}

mainLoop();
```

## SceneSnapshot & Perception

```ts
import { captureSceneSnapshot } from '@holoscript/vm-bridge';

const world = holoVM.getWorld();
const snapshot = captureSceneSnapshot(world);

console.log(`Entities: ${snapshot.entityCount}`);

for (const entity of snapshot.entities) {
  console.log(`Entity ${entity.id} (${entity.name}):`);
  console.log(`  Position: ${entity.transform?.position}`);
  console.log(`  Geometry: ${entity.geometry?.type}`);
  console.log(`  Traits: ${entity.traits}`);
}
```

## Agent Actions

```ts
import { AgentAction, applyActions } from '@holoscript/vm-bridge';

const actions: AgentAction[] = [
  // Spawn a new cube at (1, 2, 3)
  {
    type: 'spawn',
    name: 'MyCube',
    position: { x: 1, y: 2, z: 3 },
    geometryType: 0, // GeometryType.Cube
  },

  // Move entity 42 to (5, 0, 5)
  {
    type: 'move',
    entityId: 42,
    position: { x: 5, y: 0, z: 5 },
  },

  // Apply trait ID 100 to entity 42
  {
    type: 'applyTrait',
    entityId: 42,
    traitId: 100,
  },

  // Set custom component
  {
    type: 'setComponent',
    entityId: 42,
    componentType: 0x05, // Custom component type
    data: { health: 100, armor: 50 },
  },

  // Despawn entity 99
  {
    type: 'despawn',
    entityId: 99,
  },
];

const spawnedIds = applyActions(world, actions);
console.log(`Spawned entities: ${spawnedIds}`);
```

## Queuing Actions from Cognitive Cycles

```ts
// Inside a cognitive handler or decision function
agent.queueAction({
  type: 'spawn',
  name: 'TargetMarker',
  position: { x: 0, y: 1, z: 0 },
});

agent.queueActions([
  { type: 'move', entityId: 1, position: { x: 10, y: 0, z: 10 } },
  { type: 'move', entityId: 2, position: { x: -5, y: 0, z: 8 } },
]);

// Actions will be applied during the next tick()
const result = await agent.tick(Date.now());
console.log(`Applied ${result.actionsApplied} queued actions`);
```

## Spatial Opcodes

The bridge automatically registers spatial opcodes in the uAAL VM:

| Opcode                  | Name                   | Purpose                            |
| ----------------------- | ---------------------- | ---------------------------------- |
| `INTAKE`                | Perception             | Captures ECS world snapshot        |
| `EXECUTE`               | Mutation               | Applies queued actions to world    |
| `OP_EXECUTE_HOLOSCRIPT` | HoloScript Integration | Returns scene snapshot             |
| `OP_SPATIAL_ANCHOR`     | Create Anchor          | Spawns entity at (x, y, z)         |
| `OP_RENDER_HOLOGRAM`    | Render Geometry        | Sets geometry + material on entity |
| `OP_VR_TELEPORT`        | Teleport Entity        | Moves entity to (x, y, z)          |

Example usage in uAAL bytecode:

```ts
import { UAALOpCode } from '@holoscript/uaal';

// Spawn spatial anchor at (0, 2, 0)
vm.push('AnchorPoint');
vm.push(0);
vm.push(2);
vm.push(0);
vm.execute(UAALOpCode.OP_SPATIAL_ANCHOR);
const anchorId = vm.pop();

// Render hologram on entity
vm.push(anchorId);
vm.push(0); // GeometryType.Cube
vm.push(0x00ffff); // Cyan color
vm.execute(UAALOpCode.OP_RENDER_HOLOGRAM);
```

## Cognitive Frequency

The bridge runs cognitive cycles at a configurable frequency (default: 2Hz):

```ts
const agent = new SpatialCognitiveAgent(world, cognitiveVM, {
  cognitiveHz: 4, // 4 cognitive cycles per second (every 250ms)
});

// HoloVM runs at 60fps, but cognitive decisions are only made 4x/second
// This balances responsiveness with computational cost
```

## Architecture

- **SceneSnapshot**: Serializable ECS world state for agent perception
- **AgentAction**: Typed mutation primitives (spawn, despawn, move, setComponent, applyTrait)
- **SpatialCognitiveAgent**: Core bridge — perceive() → decide() → mutate()
- **captureSceneSnapshot()**: Extracts Transform, Geometry, Material, RigidBody components
- **applyActions()**: Batch-applies agent actions to ECS world
- **Cognitive Frequency**: Decoupled from render loop for efficient decision-making

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
