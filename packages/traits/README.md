# @holoscript/traits

> Standard trait library for HoloScript — 2,000+ semantic traits across 40+ categories.

## Overview

The traits package provides the complete vocabulary of HoloScript traits organized into domain-specific categories. Traits are semantic annotations (`@physics`, `@grabbable`, `@ai_agent`) that describe WHAT an entity is — the compiler handles HOW it runs on each platform.

## Trait Architecture

```
CrossRealityTraitRegistry          TraitDependencyGraph
  ├── register(trait)               ├── objectTraits (mapping)
  ├── getByCategory(cat)            └── resolve dependencies
  ├── getAllTraitIds()
  └── registerBuiltinTraits()

TraitSupportMatrix                 MoMETraitDatabase
  └── detectCategory(path)          ├── listCategory(cat)
                                    └── TraitExpert.category
```

## Categories

| Category | Examples | Count |
|----------|----------|-------|
| **Core VR** | `@grabbable`, `@throwable`, `@pointable`, `@teleport` | 50+ |
| **Physics** | `@rigidbody`, `@collider`, `@force_field`, `@joint` | 80+ |
| **Audio** | `@spatial_audio`, `@reverb`, `@audio_zone` | 30+ |
| **Visual** | `@pbr_material`, `@glass_material`, `@toon_material` | 600+ |
| **AI/Agents** | `@agent`, `@llm_agent`, `@patrol`, `@behavior_tree` | 65+ |
| **IoT** | `@iot_sensor`, `@digital_twin`, `@mqtt_bridge` | 40+ |
| **Robotics** | `@joint_revolute`, `@force_torque_sensor`, `@urdf` | 213+ |
| **Economy** | `@credit`, `@marketplace`, `@escrow` | 20+ |
| **Networking** | `@networked`, `@crdt_state`, `@voice_chat` | 50+ |
| **Shader** | `@gaussian_splat`, `@subsurface`, `@toon_shader` | 100+ |

See `src/traits/constants/` for the full list of 101 category files.

## Usage

```typescript
import { VR_TRAITS } from '@holoscript/traits';           // All traits
import { PHYSICS_TRAITS } from '@holoscript/traits';       // Physics only
import { MAGIC_FANTASY_TRAITS } from '@holoscript/traits'; // Magic/Fantasy only
```

### Registering Custom Traits

```typescript
import { CrossRealityTraitRegistry } from '@holoscript/core';

const registry = new CrossRealityTraitRegistry();
registry.registerBuiltinTraits();
registry.register({
  id: 'my_custom_trait',
  category: 'gameplay',
  properties: { damage: 'number', range: 'number' },
});
```

### Detecting Trait Category

```typescript
import { detectCategory } from '@holoscript/core';

const category = detectCategory('src/traits/constants/physics.ts', content);
// → 'physics'
```

## Key Classes

| Class | File | Purpose |
|-------|------|---------|
| `CrossRealityTraitRegistry` | `core/src/compiler/platform/` | Register, query, and manage traits across platforms |
| `TraitDependencyGraph` | `core/src/compiler/` | Track trait-to-object mappings and dependencies |
| `TraitSupportMatrix` | `core/src/traits/` | Category detection and platform support matrix |
| `MoMETraitDatabase` | `core/src/traits/` | Mixture-of-Memory-Experts trait database |
| `ShaderTrait` | `core/src/traits/` | Shader compilation for all targets |
| `GLTFTrait` | `core/src/traits/` | glTF extension requirements |

## Related

- [Traits Reference](../../docs/traits/index.md) — Usage docs for all categories
- [CrossRealityTraitRegistry](../../docs/architecture/TRAIT_SYSTEM.md) — Architecture deep-dive

## License

MIT
