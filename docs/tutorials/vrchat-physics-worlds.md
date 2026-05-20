# VRChat Physics Worlds with HoloScript

Build physics-interactive VRChat worlds — cloth simulation, fluid effects, structural dynamics, and multi-body interactions — without writing a single line of Unity physics code.

HoloScript compiles `.holo` compositions to VRChat SDK3 + UdonSharp automatically. What would take days of manual Unity scripting takes minutes.

> **対象読者 / Target audience**: VRChat world creators who already use Unity + VRChat SDK3. This tutorial assumes you can import a Unity package and run Play mode. No C# or UdonSharp knowledge required.

> **日本語版**: [HoloScriptでVRChat物理ワールドを作る](./vrchat-physics-worlds-ja.md)

---

## Why HoloScript for VRChat Physics?

Standard VRChat workflow:
- Write UdonSharp C# manually
- Wire up Rigidbody, Collider, VRC_Pickup, network sync by hand
- Physics interactions require deep Unity + PhysX knowledge
- Cloth/fluid simulation needs external plugins or baked caches

HoloScript workflow:
- Describe your world in `.holo` (HoloScript's domain language)
- `compile_to_vrchat` generates all UdonSharp, prefab hierarchy, and world descriptor
- Real multi-domain physics solvers: structural, cloth, fluid, acoustic

---

## Prerequisites

1. **Unity 2022.3 LTS** with VRChat SDK3 (Worlds) installed
2. **HoloScript MCP** access — get your API key at `holoscript.studio`
3. A VRChat account with world publishing access

---

## Tutorial 1: Cloth Simulation Room

### 1. Write the composition

Create `cloth-room.holo`:

```holo
world ClothRoom {
  environment {
    skybox: "studio_dark"
    ambient: [0.1, 0.1, 0.15]
  }

  object Floor {
    geometry: box
    scale: [10, 0.1, 10]
    position: [0, 0, 0]
    @physics { mass: 0, static: true }
  }

  object ClothPanel {
    geometry: plane
    scale: [2, 2, 1]
    position: [0, 3, 0]
    @cloth {
      stiffness: 0.8
      damping: 0.2
      mass: 0.1
      pinTopEdge: true
    }
    @interaction { pickup: true, throwable: true }
  }

  object HeavyBall {
    geometry: sphere
    scale: [0.4, 0.4, 0.4]
    position: [0, 5, 0]
    @physics { mass: 5.0, restitution: 0.3 }
    @interaction { pickup: true, throwable: true }
    @sync { networked: true }
  }
}
```

### 2. Compile to VRChat

**Via MCP tool** (in Claude, Cursor, or any MCP-connected AI):

```
compile_to_vrchat composition=ClothRoom sdkVersion=3.5 worldName="Cloth Physics Demo"
```

**Via CLI**:

```bash
holoscript compile --target vrchat cloth-room.holo -o cloth-room-vrchat/
```

### 3. Output files

The compiler produces:

```
cloth-room-vrchat/
├── GeneratedWorld.cs          # UdonSharp world controller
├── ClothPanel_Udon.cs         # Per-object Udon script (pickup, throw, sync)
├── HeavyBall_Udon.cs
├── PrefabHierarchy.txt        # Unity scene structure to recreate
└── WorldDescriptor.json       # VRC World Descriptor settings
```

### 4. Import into Unity

1. Copy all `.cs` files into your Unity project under `Assets/HoloWorld/Scripts/`
2. Open your VRChat world scene
3. Create GameObjects matching `PrefabHierarchy.txt` (or use an existing layout)
4. Attach each `*_Udon.cs` to its corresponding GameObject
5. For cloth: add Unity's **Cloth** component to `ClothPanel` and configure per the generated constraints
6. Run **VRChat SDK → Build & Test**

---

## Tutorial 2: Fluid Effects Room

### Composition

```holo
world FluidRoom {
  environment {
    skybox: "night_city"
    fog: { density: 0.02, color: [0.05, 0.05, 0.1] }
  }

  object Tank {
    geometry: box
    scale: [3, 2, 3]
    position: [0, 1, 0]
    @physics { mass: 0, static: true, transparent: true }
  }

  domain fluid {
    FluidVolume {
      container: Tank
      particleCount: 8000
      viscosity: 0.001       # Water
      surfaceTension: 0.072
      density: 1000
    }
  }

  object FluidBall {
    geometry: sphere
    scale: [0.3, 0.3, 0.3]
    position: [0, 2.5, 0]
    @physics { mass: 0.5 }
    @interaction { pickup: true }
    @sync { networked: true }
  }

  state {
    fluidActive: true
  }
}
```

Compile:

```bash
holoscript compile --target vrchat fluid-room.holo -o fluid-room-vrchat/
```

The fluid domain block generates Unity particle system configuration and Udon sync logic. The `FluidVolume` keyword triggers HoloScript's Navier-Stokes solver to pre-bake particle behavior at compile time, outputting Unity particle system parameters that approximate real fluid dynamics without runtime solver cost.

---

## Tutorial 3: Structural Collapse Scene

Showcase HoloScript's structural solver — objects that fracture and collapse under load, impossible to achieve with standard VRChat Unity physics.

```holo
world CollapseDemo {
  object Platform {
    geometry: box
    scale: [4, 0.3, 4]
    position: [0, 2, 0]
    @physics { mass: 50, static: false }
    @structural {
      material: concrete
      yieldStrength: 30e6      # 30 MPa (concrete)
      fractureMode: brittle
    }
  }

  object SupportLeft {
    geometry: cylinder
    scale: [0.3, 2, 0.3]
    position: [-1.5, 1, 0]
    @physics { mass: 20, static: false }
    @structural { material: steel, yieldStrength: 250e6 }
  }

  object SupportRight {
    geometry: cylinder
    scale: [0.3, 2, 0.3]
    position: [1.5, 1, 0]
    @physics { mass: 20, static: false }
    @structural { material: steel, yieldStrength: 250e6 }
  }

  object DropWeight {
    geometry: box
    scale: [0.8, 0.8, 0.8]
    position: [0, 6, 0]
    @physics { mass: 500, restitution: 0.1 }
    @interaction { pickup: true, throwable: true }
    @sync { networked: true }
  }

  zone ImpactZone {
    bounds: [[-2, 0, -2], [2, 5, 2]]
    onEnter: "triggerStructuralSim"
  }
}
```

The structural solver computes pre-baked fracture patterns at compile time. In Unity, this outputs Voronoi-fractured mesh variants with Udon state machines switching between intact and fractured states when the `DropWeight` exceeds yield stress.

---

## Tutorial 4: Multi-Physics Interactive Gallery

Combine cloth, rigid body, and acoustic physics in a single world — ideal for showcasing HoloScript's simulation fidelity to the VRChat creator community.

```holo
world PhysicsGallery {
  environment {
    skybox: "museum_interior"
    reverb: 0.6     # Large room acoustics
  }

  # Cloth curtains at entrance
  object EntranceCurtainL {
    geometry: plane
    scale: [1.5, 3, 1]
    position: [-0.8, 1.5, -5]
    @cloth { stiffness: 0.5, pinTopEdge: true, windResponse: 0.3 }
  }

  object EntranceCurtainR {
    geometry: plane
    scale: [1.5, 3, 1]
    position: [0.8, 1.5, -5]
    @cloth { stiffness: 0.5, pinTopEdge: true, windResponse: 0.3 }
  }

  # Newton's cradle
  object CradleStand {
    geometry: box
    scale: [2, 0.1, 0.5]
    position: [0, 2, 0]
    @physics { mass: 0, static: true }
  }

  object Ball1 {
    geometry: sphere
    scale: [0.2, 0.2, 0.2]
    position: [-0.4, 1, 0]
    @physics { mass: 1.0, restitution: 0.99 }
    @interaction { pickup: true }
    @sync { networked: true }
  }

  object Ball2 {
    geometry: sphere
    scale: [0.2, 0.2, 0.2]
    position: [-0.2, 1, 0]
    @physics { mass: 1.0, restitution: 0.99 }
    @sync { networked: true }
  }

  # Acoustic demo corner
  domain audio {
    ReverbZone {
      position: [3, 1.5, 3]
      radius: 4
      reverbPreset: cavern
      wetMix: 0.7
    }
  }

  # Fluid fountain
  domain fluid {
    Fountain {
      emitter: { position: [0, 0.5, 4], radius: 0.2 }
      particleCount: 3000
      viscosity: 0.001
      looped: true
    }
  }
}
```

---

## Physics Traits Reference

| Trait | VRChat output | Notes |
|-------|--------------|-------|
| `@physics { mass, restitution, friction }` | Rigidbody + PhysicsMaterial | `mass: 0, static: true` → Static Collider |
| `@interaction { pickup: true }` | VRC_Pickup + Udon | `throwable: true` → EnableGravity on drop |
| `@sync { networked: true }` | UdonSynced fields + VRC_ObjectSync | Sync interval configurable |
| `@cloth { stiffness, damping, pinTopEdge }` | Unity Cloth component + constraints | Pre-baked from HoloScript solver |
| `@structural { material, yieldStrength }` | Voronoi fractured mesh + Udon state machine | Fracture pre-baked at compile |
| `domain fluid { ... }` | Particle System + Udon fluid sim | 8K particles ≈ real-time in VRChat |
| `domain audio { ReverbZone }` | VRC_SpatialAudioSource zone | Maps to VRC reverb zones |

---

## Compile Options

```typescript
interface VRChatCompilerOptions {
  worldName?: string;         // VRC world display name
  sdkVersion?: '3.0' | '3.1' | '3.2' | '3.3' | '3.4' | '3.5';  // default: '3.5'
  useUdonSharp?: boolean;     // default: true (false = raw Udon graph JSON)
  namespace?: string;         // C# namespace — default: 'HoloWorld'
  className?: string;         // World controller class — default: 'GeneratedWorld'
  provenanceHash?: string;    // For SimulationContract receipt linkage
}
```

---

## Network Sync Pattern

HoloScript generates `[UdonSynced]` fields and `OnDeserialization()` handlers automatically for any object annotated `@sync { networked: true }`. The world controller class handles:

- Ownership transfer on pickup
- State sync when objects are thrown or reach rest
- Late-joiner sync via `OnPlayerJoined`

You do not need to write any UdonSharp sync code manually.

---

## Testing Locally Before Upload

```bash
# Build and validate (no VRChat account needed for local test)
holoscript compile --target vrchat --validate my-world.holo

# Open in Unity, then VRChat SDK → Build & Test
# Unity play mode runs the generated UdonSharp locally
```

Common issues:
- **Cloth pinning wrong edges**: verify `pinTopEdge` / `pinBottomEdge` / `pinCorners` in the `@cloth` trait
- **Object not syncing**: add `@sync { networked: true }` to any pickup you want networked
- **Fluid too expensive**: reduce `particleCount` or add `maxParticles` budget to the domain block

---

## Wireless Quest Preview With HoloTunnel

If you do not have a Link cable, keep the VRChat upload path in desktop Unity
and use HoloTunnel for headset preview loops:

```bash
# Start your local Studio or WebXR preview first, then expose it.
node packages/studio/scripts/holotunnel-client.mjs --port 3101
```

Open the printed `/live` URL in Quest Browser. This is a WebXR preview path for
checking scale, readability, interaction intent, and target-device comfort
before you package the VRChat world in Unity. It does not replace VRChat SDK
`Build & Test`; it removes the need for a cable during iteration.

Agents with MCP access can also call `holo_tunnel_create` for the same
local-to-cloud bridge.

---

## Publishing

1. In Unity: **VRChat SDK → Build & Publish for Windows**
2. Fill out world name, description, tags
3. Add tags: `physics`, `interactive`, `HoloScript` — helps the Japanese creator community discover worlds built with this workflow
4. Recommended companion post: share on the [VRChat Discord](https://discord.gg/vrchat) `#world-dev` + Booth marketplace

---

## See Also

- [VRChatCompiler.ts](../../packages/core/src/compiler/VRChatCompiler.ts) — Compiler source
- [Physics Solver Overview](../physics/) — Underlying solvers (cloth, fluid, structural)
- [Tutorial 01: Multi-Agent Workflow](./01_MultiAgentWorkflow.md) — AI agents in HoloScript worlds
- [USD/Omniverse Integration](../targets/usd-omniverse.md) — Export to NVIDIA simulation
- [VRChat Creator Docs](https://creators.vrchat.com/worlds/) — Official VRChat world creation docs
- [Current VRChat Unity Version](https://creators.vrchat.com/sdk/upgrade/current-unity-version/) — Official supported Unity version
- [HoloLand Japan Outreach Brief](../marketing/vrchat-japan-hololand-physics-outreach.md) — Japanese community posting package
