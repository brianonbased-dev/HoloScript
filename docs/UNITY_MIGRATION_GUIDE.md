# Unity → HoloScript Migration Guide

**Version**: 4.0  
**Audience**: Unity developers migrating to HoloScript / HoloLand  
**Time to first scene**: ~30 minutes

---

## Why Migrate?

| Pain Point | Unity | HoloScript |
|---|---|---|
| Licensing | Proprietary (runtime fees reinstated risk) | MIT — irrevocable, zero risk |
| Revenue share | 70/30 Asset Store | 90/10 HoloLand Marketplace |
| Distribution | APK / EXE download | URL — instant play, no install |
| 3D generation | No AI scene generation | `SpatialAgentOrchestrator` (text → 3D) |
| Local LLM agents | Plugin-dependent | `LocalLLMTrait` (Ollama/LM Studio built-in) |
| Privacy | No ZKP support | `ZkPrivateTrait` (Aztec Noir) |

---

## Quick Start

### 1. Export Your Unity Scene

From **Unity Editor**:
```
Tools → HoloScript Exporter → Export Scene as JSON
```

Or manually construct a `UnityScene` JSON object (see schema below).

### 2. Convert with the CLI

```bash
# Install HoloScript CLI
npm install -g @holoscript/cli

# Convert a Unity scene JSON to HoloScript DSL
holoscript convert unity-scene my-scene.json --output my-scene.holo

# Or import into an existing project
holoscript import unity my-scene.json
```

### 3. Convert Programmatically

```typescript
import { convertUnityScene } from '@holoscript/core/traits/UnityToHoloScriptConverter';

const result = convertUnityScene({
  name: 'MyCyberpunkCity',
  gameObjects: [
    {
      name: 'NeonBuilding',
      position: { x: 0, y: 5, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 10, z: 1 },
      components: [
        { type: 'MeshFilter', properties: { mesh: 'Box' } },
        { type: 'MeshRenderer', properties: { material: 'neon_glass' } },
        { type: 'Rigidbody', properties: { mass: 100, isKinematic: true } },
      ],
    },
  ],
  materials: {
    neon_glass: {
      name: 'neon_glass',
      shader: 'Universal Render Pipeline/Lit',
      properties: {
        _Color: { r: 0.1, g: 0.8, b: 1.0, a: 0.7 },
        _Metallic: 0.9,
        _Glossiness: 0.95,
        _EmissionColor: { r: 0, g: 0.5, b: 1, a: 1 },
      },
    },
  },
});

console.log(result.dsl);           // HoloScript DSL
console.log(result.traits);        // Required traits: ['PhysicsTrait']
console.log(result.warnings);      // Any conversion warnings
```

---

## Component → Trait Mapping

| Unity Component | HoloScript Trait | Notes |
|---|---|---|
| `Rigidbody` | `PhysicsTrait` | Full gravity, mass, drag support |
| `BoxCollider` | `ColliderTrait` | Layer mask → collision group |
| `SphereCollider` | `ColliderTrait` | |
| `CapsuleCollider` | `ColliderTrait` | |
| `CharacterController` | `CharacterTrait` | Step height, slope limit |
| `NavMeshAgent` | `PatrolTrait` | Waypoints via agent config |
| `Animator` | `AnimationTrait` | State machine → trait states |
| `AudioSource` | `AudioTrait` | 3D spatial audio preserved |
| `Light` | `LightTrait` | All light types supported |
| `Camera` | `CameraTrait` | FOV, near/far planes |
| `ParticleSystem` | `ParticleTrait` | Basic emission, simplified |
| `Canvas` | `UITrait` | World-space UI panels |
| `NetworkIdentity` | `MultiplayerTrait` | Authority model differs |

### Unsupported Components (Workarounds)

| Unity Component | Status | HoloScript Alternative |
|---|---|---|
| `TerrainCollider` | ⚠️ Partial | Use `ColliderTrait` with mesh |
| `WheelCollider` | ❌ Manual | Custom physics via `PhysicsTrait` |
| `Cloth` | ❌ Manual | Shader-based cloth simulation |
| `Joint` (all types) | ⚠️ Partial | Constraint system in v4.1 |
| `VideoPlayer` | ❌ Manual | `MediaTrait` (v4.2) |

---

## Material / Shader Mapping

| Unity Shader | HoloScript Type | Notes |
|---|---|---|
| `Standard` | `pbr` | Full metalness/roughness workflow |
| `URP/Lit` | `pbr` | |
| `URP/Unlit` | `unlit` | No lighting calculations |
| `Unlit/Color` | `unlit` | |
| `Toon/Lit` | `toon` | Cel shading preserved |
| `Holographic/Additive` | `holographic` | AR overlay mode |
| Custom shaders | ⚠️ Manual | Use Visual Shader Editor |

### Color Space

Unity uses **gamma-corrected** colors in Inspector but **linear** internally. HoloScript uses linear. The converter handles gamma→linear conversion automatically for `_Color` properties.

---

## Scene Structure Mapping

**Unity hierarchy → HoloScript DSL:**

```
Unity                          HoloScript
─────                          ──────────
Scene                      →   scene MyScene { }
  │
  ├── GameObject             →   object my_go : box { }
  │     ├── Transform        →   position/rotation/scale fields  
  │     ├── MeshFilter       →   geometry type (box/sphere/etc)
  │     ├── MeshRenderer     →   material: my_material
  │     ├── Rigidbody        →   traits: ["PhysicsTrait"]
  │     └── BoxCollider      →   traits: ["ColliderTrait"]
  │
  ├── Directional Light      →   light sun : directional { }
  └── Main Camera            →   camera { fov: 60 }
```

---

## Migrating C# Scripts

Unity `MonoBehaviour` → HoloScript requires a rewrite, but the patterns map well:

### Unity MonoBehaviour
```csharp
public class EnemyAI : MonoBehaviour {
    public float speed = 3f;
    private NavMeshAgent agent;
    
    void Start() {
        agent = GetComponent<NavMeshAgent>();
    }
    
    void Update() {
        // Move toward player
        agent.SetDestination(player.transform.position);
    }
}
```

### HoloScript Equivalent
```holoscript
// In your .holo scene file:
object enemy : capsule {
  position: [0, 0, 0]
  traits: ["PatrolTrait", "AgentMemoryTrait"]
  
  config PatrolTrait {
    speed: 3.0
    mode: "chase"
    target_tag: "player"
  }
}
```

Or via TypeScript trait:
```typescript
import { agentMovementSystem, ECSWorld } from '@holoscript/core/traits/ECSWorldTrait';

// Register your AI system
world.addSystem(agentMovementSystem);
```

---

## Performance: TypeScript vs WASM

Run the built-in benchmark to validate your target performance:

```typescript
import { runECSBenchmark } from '@holoscript/core/traits/ECSWorldTrait';

const result = runECSBenchmark(1000, 300, 60); // 1K entities, 300 frames, 60fps target
console.log(`Average frame: ${result.avgFrameMs.toFixed(2)}ms`);
console.log(`Meets 60fps: ${result.meetsTarget}`);
console.log(`Entities/sec: ${result.entitiesPerSecond.toFixed(0)}`);
```

**Expected results (Apple M1, 2024):**

| Entity Count | Avg Frame (TS) | Meets 60fps |
|---|---|---|
| 100 | <0.1ms | ✅ |
| 1,000 | <1ms | ✅ |
| 5,000 | ~4ms | ✅ |
| 10,000 | ~16ms | ⚠️ Borderline |
| 50,000 | ~80ms | ❌ Use WASM path |

For 10K+ entities, use the compiled WASM path via:
```bash
holoscript build --target wasm --optimize performance
```

---

## Step-by-Step Migration Checklist

- [ ] Export scene JSON from Unity Editor (or build manually)
- [ ] Run `holoscript convert unity-scene` CLI command
- [ ] Review conversion warnings in output
- [ ] Manually migrate unsupported components (see table above)
- [ ] Port C# scripts to HoloScript traits or TypeScript systems
- [ ] Run benchmark: `holoscript bench --entities 1000`
- [ ] Test in HoloLand Preview: `holoscript preview`
- [ ] Publish to HoloLand Marketplace

---

## Getting Help

- **Discord**: `discord.gg/holoscript` — `#unity-migration` channel
- **Docs**: `docs.holoscript.dev/migration/unity`
- **HoloLand Founders**: One-on-one migration support for Founders program members
- **Issues**: `github.com/holoscript/core/issues` — tag `unity-migration`

---

*See also: [IMMUTABILITY_MANIFESTO.md](../IMMUTABILITY_MANIFESTO.md) — our binding commitment on licensing and revenue splits.*
