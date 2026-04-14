---
title: HoloScript Semantic Dictionary
description: Official guidelines, naming conventions, design principles, and best practices for creating and extending HoloScript traits.
---

# HoloScript Semantic Dictionary

**Version 0.2** — March 2026  
**Purpose**: A living, authoritative reference that defines semantic guidelines, naming conventions, design principles, and best practices for creating and extending traits. This ensures traits remain consistent, highly composable, performant across all registered compile targets, and naturally AI-generatable.

## 1. What Is a Semantic Trait?

A **trait** is a declarative decorator (`@trait_name`) that attaches rich meaning, behavior, runtime state, lifecycle hooks, and cross-platform logic to objects, primitives, compositions, environments, or entire scenes.

Traits are **semantic** when they focus on _what_ something is or does in human-understandable terms, rather than low-level implementation details of any specific runtime.  
Good example: `@physics`  
Poor example: `@addRigidBodyWithColliderAndGravity`

Core trait counts grow with each release — verify via `docs/NUMBERS.md` or `holoscript list-traits`.

## 2. Core Design Principles

1. **Semantic Priority**  
   Always name and design by real-world intent or domain meaning first. Implementation details belong in the compiler or target overrides.

2. **Single Responsibility & Orthogonality**  
   Each trait should handle one clear concept. Traits are meant to be stacked (3–10+ per object is common and encouraged).

3. **Progressive Enhancement**  
   Zero-configuration usage must deliver immediate value. Advanced parameters unlock deeper control without breaking simplicity.

4. **Scale Awareness**  
   Built-in support for scale keywords: `micro | normal | macro | galactic | cosmic`. Use these especially for large-scale geometry, terrain, and world traits.

5. **Explicit State & Lifecycle**  
   Every trait must clearly define initialization, per-frame updates, destruction, and relevant event hooks (e.g., `on_interact`, `on_enter`, `on_exit`).

6. **Metadata for Discoverability**  
   Include `name`, `version`, `category`, `description`, `tags`, and optional `target_support` information.

7. **Safe Composition & Conflict Handling**  
   Define explicit precedence or merge strategies when traits may interact (e.g., physics + ghosting behavior).

8. **AI-Native Design**  
   Configuration fields and trait names should read naturally so language models can generate, modify, and explain scenes with minimal friction.

## 3. Naming Conventions

- **Decorator style** (`@trait_name`): Use `lower_snake_case` or `camelCase` consistently across the ecosystem (recommend `lower_snake_case` for clarity in .holo/.hsplus files).
- **Internal/TypeScript name**: Use `PascalCase` for the exported constant (e.g., `MacroGroundEvolver`).
- **Optional prefixes** for large modules or categories:
  - `env_` – Environment & terrain
  - `vfx_` – Visual effects
  - `narr_` – Narrative & agents
  - `perf_` – Performance & streaming
  - `ai_` – Intelligence & behaviors
- Recommended examples:
  - `@macro_ground_evolver`
  - `@adaptive_lighting`
  - `@live_gaussian_splat`
  - `@story_emergent`
  - `@procedural_biome`

## 4. Trait Structure (Recommended TraitDefinition Pattern)

```typescript
import { TraitDefinition, TraitContext, TraitConfig } from '@holoscript/core';

interface MyTraitConfig extends TraitConfig {
  intensity?: number; // 0.0 – 1.0 typical range
  mode?: 'default' | 'high_fidelity' | 'performance';
  scale?: 'normal' | 'macro' | 'galactic';
}

interface MyTraitState {
  lastUpdate: number;
  internalData?: any; // runtime-only
}

export const MySemanticTrait: TraitDefinition<MyTraitConfig, MyTraitState> = {
  name: 'my_semantic_trait',
  version: '1.0.0',
  category: 'environment/visual',
  description: 'Provides real-time adaptive behavior for large surfaces and scenes.',
  tags: ['adaptive', 'terrain', 'visual', 'performance'],
  defaultConfig: {
    intensity: 1.0,
    mode: 'default',
    scale: 'normal',
  },

  init(ctx: TraitContext<MyTraitConfig>) {
    // One-time setup per instance
  },

  update(ctx: TraitContext<MyTraitConfig>, state: MyTraitState, delta: number) {
    // Per-frame logic (respect target capabilities)
  },

  methods: {
    // Exposed runtime API
    triggerEffect(ctx, params: any) {
      /* ... */
    },
  },

  destroy(ctx, state) {
    // Cleanup resources
  },

  // Optional: per-target overrides or extensions
  targetOverrides: {
    webxr: {
      /* lighter implementation */
    },
    unity: {
      /* deeper native integration */
    },
  },
};
```

## 5. Trait Categories (Official Taxonomy v0.2)

- **Geometry & Scale**
- **Visual & Material** (PBR, procedural, splatting, etc.)
- **Physics & Interaction**
- **Environment & Atmosphere**
- **Performance & Streaming** (LOD, progressive loading)
- **Narrative & AI Agents**
- **Multiplayer & Synchronization**
- **Procedural & Generative**
- **Cross-Reality & Live Capture**
- **Core System** (lifecycle, metadata, debugging)

New traits should map clearly into one primary category while remaining orthogonal to others.

## 6. Best Practices for Groundbreaking Traits

- Keep configuration self-documenting and readable as natural language.
- Ship every trait with at least one ready-to-copy `.hsplus` example.
- Include suggested AI prompts for common use cases.
- Test on minimum: WebXR + one native target (Unity or Godot recommended).
- Use semantic versioning and provide clear deprecation paths.
- Document performance characteristics and scale recommendations.

## 7. Trait Evaluation Checklist (New in v0.2)

Before publishing a trait, verify:

- [ ] Is the name purely semantic?
- [ ] Does it compose cleanly with 3–5 existing traits?
- [ ] Zero-config usage works immediately?
- [ ] Scale keywords are respected where applicable?
- [ ] Lifecycle hooks and cleanup are complete?
- [ ] Metadata (category, tags, description) is present?
- [ ] Examples and AI prompt templates are included?
- [ ] Tested on at least two compile targets?

## 8. Anti-Patterns (New in v0.2)

- God-traits that do too many unrelated things.
- Names that describe implementation (e.g., `@useWebGPUBackend`).
- Hard dependencies on a single target’s features.
- Missing destroy/cleanup logic (memory leaks across targets).
- Overly complex configuration on first use.

## 9. How to Contribute a New Trait

1. Implement using the TraitDefinition pattern in your module.
2. Register it via `holoscript.config.ts`.
3. Add full documentation and examples.
4. Publish to HoloHub or submit PR to core for standard library inclusion.
5. Update this Semantic Dictionary with the new trait as a reference example.
