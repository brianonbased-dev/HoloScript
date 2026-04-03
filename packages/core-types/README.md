# @holoscript/core-types

Pure TypeScript type definitions for the HoloScript ecosystem. Zero runtime dependencies. Use this package when you need HoloScript types without pulling in the full `@holoscript/core` runtime (parsers, compilers, engines).

## Install

```bash
npm install @holoscript/core-types
```

## What it provides

Seven type modules, each importable individually or through the barrel export:

| Module | What it covers |
|--------|----------------|
| `composition` | `.holo` declarative format AST -- `HoloComposition`, `HoloObjectDecl`, `HoloShape`, expressions, statements, domain blocks, narrative, NPC, quest, talent trees, norms |
| `ast` | HoloScript+ AST nodes and directives -- `HSPlusAST`, `ASTNode`, `HSPlusDirective` (23 directive types), `HoloScriptType` system, `VRTraitName`, compile results |
| `animation` | Animation state machine types -- clips, states, transitions, parameters, layers, blend modes, events |
| `physics` | Rigid bodies, collision shapes, constraints (8 joint types), spatial queries, PBD soft-body, unified particle buffer, helper factories |
| `security` | RBAC roles/permissions, UCAN capability tokens, delegation chains, confabulation validation, role trait permissions |
| `hologram` | Quilt rendering (Looking Glass), MV-HEVC stereo (Vision Pro), depth estimation configs |
| `utility` | `DeepPartial`, `DeepReadonly`, `TypedEventEmitter`, `Brand`, `StrictRecord`, `JsonValue`, `Extensible`, and other type-level tools replacing `any` casts |

## Usage

Import everything from the barrel:

```ts
import type { HoloComposition, ASTNode, IRigidBodyConfig } from '@holoscript/core-types';
```

Or import a specific module for narrower dependencies:

```ts
import type { AnimationConfig, AnimationTransition } from '@holoscript/core-types/animation';
import type { Capability, IntentTokenPayload } from '@holoscript/core-types/security';
import type { QuiltConfig, DepthResult } from '@holoscript/core-types/hologram';
import type { DeepPartial, Brand, TypedEventEmitter } from '@holoscript/core-types/utility';
```

The `physics` module also exports runtime helpers (the only non-type exports in the package):

```ts
import { sphereShape, dynamicBody, PHYSICS_DEFAULTS } from '@holoscript/core-types/physics';

const ball = dynamicBody('ball', sphereShape(0.5), 1.0, { x: 0, y: 5, z: 0 });
```

## Adding new types

1. If the types fit an existing module, add them to the corresponding file in `src/`.
2. If they represent a new domain, create a new file in `src/`, re-export it from `src/index.ts`, and add a subpath export entry to `package.json` under `"exports"`.
3. Keep files self-contained -- zero imports between modules. This prevents circular dependencies and keeps each subpath independently consumable.
4. Run `pnpm build` (uses tsup) to verify the output. Run `pnpm typecheck` to validate without emitting.

## Build

```bash
pnpm build      # compile with tsup
pnpm typecheck  # tsc --noEmit
```

## License

MIT
