# Trait System Architecture

> How HoloScript's 2,000+ traits are defined, registered, resolved, and compiled.

## Overview

The trait system is the semantic core of HoloScript. Traits like `@physics`, `@grabbable`, and `@ai_agent` describe WHAT an entity is. The compiler converts them to platform-specific code for each of the 18+ compile targets.

## Architecture Diagram

```text
┌─────────────────────────────────────────────────────────┐
│  TRAIT DEFINITION                                       │
│  src/traits/constants/ (101 category files)             │
│  ├── core-vr-interaction.ts  (grabbable, throwable...)  │
│  ├── physics.ts              (rigidbody, collider...)   │
│  ├── audio.ts                (spatial_audio, reverb...) │
│  └── ... 98 more categories                             │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│  TRAIT REGISTRATION                                     │
│  CrossRealityTraitRegistry                              │
│  ├── register(trait)           Register single trait    │
│  ├── registerBuiltinTraits()   Bulk register all 2000+  │
│  ├── getByCategory(cat)        Query by category        │
│  └── getAllTraitIds()           List all registered IDs  │
│  File: src/compiler/platform/CrossRealityTraitRegistry  │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│  TRAIT RESOLUTION                                       │
│                                                         │
│  TraitDependencyGraph          TraitSupportMatrix        │
│  ├── objectTraits (map)        ├── detectCategory()     │
│  └── resolve dependencies     └── platform support      │
│                                                         │
│  MoMETraitDatabase (Mixture-of-Memory-Experts)          │
│  ├── listCategory(cat)                                  │
│  └── TraitExpert.category                               │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────┐
│  COMPILATION                                            │
│  CompilerDocumentationGenerator.groupTraitsByCategory()  │
│  → Feeds trait data to each platform compiler           │
│  → UnrealCompiler, VisionOSCompiler, WebGPUCompiler...  │
└─────────────────────────────────────────────────────────┘
```

## Key Classes

| Class                       | File                                                 | Role                                                  |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `CrossRealityTraitRegistry` | `src/compiler/platform/CrossRealityTraitRegistry.ts` | Central registry — register, query, bulk-load traits  |
| `TraitDependencyGraph`      | `src/compiler/TraitDependencyGraph.ts`               | Object-to-trait mapping and dependency resolution     |
| `TraitSupportMatrix`        | `src/traits/TraitSupportMatrix.ts`                   | Auto-detect trait category from file path and content |
| `MoMETraitDatabase`         | `src/traits/MoMETraitDatabase.ts`                    | Mixture-of-Memory-Experts — expert-based trait lookup |
| `ShaderTrait`               | `src/traits/ShaderTrait.ts`                          | Shader compilation across targets                     |
| `GLTFTrait`                 | `src/traits/GLTFTrait.ts`                            | glTF extension requirements                           |
| `AgentCardExporter`         | `src/export/agent-card/AgentCardExporter.ts`         | Export agent's supported traits                       |

## Adding a Custom Trait

```typescript
import { CrossRealityTraitRegistry } from '@holoscript/core';

const registry = new CrossRealityTraitRegistry();
registry.registerBuiltinTraits(); // Load all 2,000+ built-in traits

// Register a custom trait
registry.register({
  id: 'my_custom_trait',
  category: 'gameplay',
  properties: {
    damage: { type: 'number', default: 10 },
    range: { type: 'number', default: 5 },
  },
  platforms: ['unity', 'unreal', 'r3f'], // Supported targets
});
```

## Trait Categories

Traits are organized into 40+ high-level categories:

- **Spatial**: physics, audio, visual, interaction, navigation
- **AI**: agent, behavior, llm_agent, spatial_awareness
- **Networking**: networked, crdt_state, voice_chat, multiplayer
- **Domain**: iot, robotics, healthcare, education, web3, economy
- **Media**: shader, gaussian_splat, pbr_material, particles

See [docs/traits/](../traits/index.md) for the full per-category reference.
