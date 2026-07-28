# @holoscript/core-types

`@holoscript/core-types` is the lightweight type-definition package for
HoloScript consumers that need shared TypeScript types without pulling in the
full `@holoscript/core` runtime.

## Install

```bash
npm install @holoscript/core-types
```

## Use

```ts
import type { HoloComposition } from '@holoscript/core-types';
import type { AnimationConfig } from '@holoscript/core-types/animation';
import type { Capability } from '@holoscript/core-types/security';
```

## Entry Points

| Entry point                          | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `@holoscript/core-types`             | Barrel export for shared types            |
| `@holoscript/core-types/composition` | `.holo` composition types                 |
| `@holoscript/core-types/ast`         | HoloScript+ AST and directive types       |
| `@holoscript/core-types/animation`   | Animation state machine types             |
| `@holoscript/core-types/physics`     | Physics config types and small helpers    |
| `@holoscript/core-types/security`    | RBAC, UCAN, and capability-token types    |
| `@holoscript/core-types/hologram`    | Hologram, quilt, and depth-config types   |
| `@holoscript/core-types/utility`     | Generic type-level helpers                |
| `@holoscript/core-types/ans`         | ANS namespace and compiler identity types |

## Strategy Role

This package is supported tooling. It should stay dependency-light and
independently consumable. Canonical runtime implementations belong in
`@holoscript/core`; this package mirrors shared type contracts for consumers
that only need compile-time shape.

Promote it into fleet consumption only when a laptop, Jetson, or Vast consumer
needs direct type-only installation instead of receiving types through a runtime
package.

## Validation

```bash
corepack pnpm --filter @holoscript/core-types run build
corepack pnpm --filter @holoscript/core-types run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
