# HoloScript Language Features

> **Version**: v4.1 | **Status**: Production Ready

This document covers the core language-level features of HoloScript beyond the trait library.

---

## Table of Contents

1. [@import / @export Module System](#1-import--export-module-system)
2. [Trait Composition](#2-trait-composition)
3. [Local Reactive State](#3-local-reactive-state)
4. [Async / Await](#4-async--await)
5. [Type Inference](#5-type-inference)

---

## 1. @import / @export Module System

Split large scenes into reusable modules. Import named exports, wildcards, or entire files.

### Syntax

```holoscript
// Named imports
import { PhysicsTrait, AnimationTrait } from './shared/physics-pack'

// Aliased import
import { Cube as C } from './shapes'

// Wildcard import (all exports under namespace)
import * as fx from './effects'

// Bare import (runs module, injects all exports into scope)
import './environment/skybox'
```

### Exporting

Annotate any object, template, or scene node with `@export`:

```holoscript
// physics-pack.hs
object PhysicsWorld {
  @export
  gravity: [0, -9.8, 0]
  bounce_factor: 0.7
}

template RigidBody {
  @export
  mass: 1.0
  collision_shape: 'box'
}
```

### Full Example

```holoscript
// main.hs
import { PhysicsWorld, RigidBody } from './physics-pack'
import { SkyboxHDRI } from './environment'

composition GameScene {
  environment { use: SkyboxHDRI }

  object Player {
    template: RigidBody
    position: [0, 2, 0]
  }
}
```

### Features

| Feature | Support |
|---|---|
| Named imports `{ X, Y }` | ✅ |
| Aliased imports `{ X as Y }` | ✅ |
| Wildcard imports `* as ns` | ✅ |
| Bare path import | ✅ |
| Circular dependency detection | ✅ DFS with cycle chain reporting |
| Transitive resolution | ✅ up to 32 levels deep (configurable) |
| Parse caching | ✅ each module parsed once |
| Browser & Node support | ✅ `readFile` injection |

### Programmatic API

```typescript
import { ImportResolver } from '@holoscript/core/parser';

const resolver = new ImportResolver();
const result = await resolver.resolve(parseResult, '/src/main.hs', {
  baseDir: '/src',
  readFile: async (path) => fs.readFile(path, 'utf-8'), // or fetch() in browser
  maxDepth: 32,    // max import chain depth
  disabled: false, // set true for sandboxed eval / REPL
});

// result.scope  → Map<name, HSPlusNode>  — all imported exports
// result.modules → Map<path, ResolvedModule> — all resolved files
// result.errors  → ImportResolutionError[] — any resolution failures
```

---

## 2. Trait Composition

Define composite traits by combining existing ones. No property re-declaration needed.

> **Status**: Planned (v4.1) — `TraitDependencyGraph` is wired, parser extension in progress.

### Syntax (Upcoming)

```holoscript
// Define a compound trait
@define HoverVehicle = @physics + @navmesh + @antigravity

// Use it
object SpeedBike {
  @HoverVehicle
  max_speed: 120
  hover_height: 1.5
}
```

### Merge Rules

- Properties from all constituent traits are merged at attach time
- Later traits override earlier traits for the same property key
- Events from all traits are emitted independently (no deduplication)

---

## 3. Local Reactive State

Declare per-scene state that automatically re-renders affected bindings on mutation.

> **Status**: Planned (v4.1) — Parser has `hasState` flag. Reactivity runtime in progress.

### Syntax (Upcoming)

```holoscript
composition GameUI {
  state {
    score: int = 0
    lives: int = 3
    level: string = "Tutorial"
  }

  // Reactive assignment
  on click #enemy: state.score += 10

  // State watch triggers
  on state.score > 100: emit('level_complete')
  on state.lives == 0: emit('game_over')

  // Bound to UI
  ui {
    text ScoreDisplay { content: bind(state.score) }
    text LivesDisplay { content: bind(state.lives) }
  }
}
```

### State Binding

- `bind(state.x)` — one-way binding: UI updates when state changes
- `state.x = value` — direct mutation (triggers reactive update)
- `state.x += n` — compound assignment (equivalent to `state.x = state.x + n`)

---

## 4. Async / Await

Call async operations inside trait handlers and scene logic.

> **Status**: Parser handles the `async` keyword as a code block node. Full first-class support planned for v4.2.

```holoscript
object DataFetcher {
  @LocalLLM(model: "llama3.2")

  on attach: async {
    let result = await llm.complete("Describe this scene")
    emit("description_ready", { text: result })
  }
}
```

---

## 5. Type Inference

> **Status**: Planned (v4.2). Currently types must be explicit.

```holoscript
// Future: inferred
let pos = [0, 1, 0]   // → vec3
let speed = 5.0        // → float
let name = "player"    // → string

// Current: explicit
let pos: vec3 = [0, 1, 0]
let speed: float = 5.0
```

---

## Related Docs

- [Trait Library Reference](./TRAIT_LIBRARY.md)
- [HoloScript DSL Syntax](./syntax/HOLOSCRIPT_SYNTAX.md)
- [Unity Migration Guide](./UNITY_MIGRATION_GUIDE.md)
- [WASM Performance](./WASM_PERFORMANCE.md)
