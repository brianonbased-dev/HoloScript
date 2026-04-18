# Core ↔ engine dependency cycle

## Package graph

`@holoscript/engine` depends on `@holoscript/core` (workspace `dependencies`).

`@holoscript/core` declares `@holoscript/engine` as an optional **peer** but several **production** modules still import engine implementations (traits, editor, headless runtime shim). That creates a compile-time / bundling coupling that we want to unwind.

`scripts/check-architecture-coupling.js` explicitly allowlists the mutual runtime pair `@holoscript/core` ↔ `@holoscript/engine` until the split is complete.

## Validate with madge

From repo root (slow on first run):

```bash
npx madge packages/core/src --circular --extensions ts
```

Internal cycles inside `core/src` (e.g. `types.ts` ↔ `AdvancedTypeSystem`) are tracked separately. The **cross-package** concern is engine imports from core.

## Production ↔ engine surface (inventory)

Many production modules under `packages/core/src` still import `@holoscript/engine` (traits, editor, barrels, CLI). **Do not assume a short list** — run:

```bash
pnpm run verify:core-engine-imports
```

That prints a sorted inventory (and optionally enforces a max count via `VERIFY_CORE_ENGINE_IMPORTS_MAX=` for CI experiments). Representative categories:

- **Runtime shim:** `runtime/HeadlessRuntime.ts`
- **Traits:** fluid, GPU physics, MQTT, orbital, weather, volumetrics, etc.
- **Editor:** ECS world/entity, inspectors, assets, gizmos
- **Barrels / CLI:** aggregate exports that pull engine symbols into the public surface.

Tests under `packages/core/src/__tests__/` are excluded from the inventory.

## Target end state (board task / synthesis)

1. **`@holoscript/core-ir`** (or slim `core`): parsers, AST, types, compiler pipeline — **no** `@holoscript/engine` imports.
2. **`@holoscript/core-runtime`** (new): headless wrapper, engine-backed traits, editor glue — depends on `core-ir` + `engine`.
3. **`engine`** continues to depend on `core-ir` only.

Until that split lands, **do not add** new production imports from `packages/core/src` to `@holoscript/engine` without updating the allowlist script and this doc.
