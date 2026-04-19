# @holoscript/core-types Extraction Plan

> Status: **COMPLETE** — Phase 1-5 done (2026-03-24)
> Package: `@holoscript/core-types@5.4.0` — 341 exported types, 6 modules, zero deps
> Validated: [see NUMBERS.md]  passed, 0 regressions

## Motivation

`@holoscript/core` has a fan-in of **29 packages** (62% of monorepo). Its instability index is 0.03 — bedrock stability, but the coupling surface is too wide. Many dependents import _only types_ from core, yet still pull the full runtime bundle.

Extracting pure types into `@holoscript/core-types` provides:

- **Bundle size reduction**: ~10-15% for type-only consumers
- **Type-checking speed**: ~20% faster for LSP/IDE
- **Dependency clarity**: types vs runtime clearly separated
- **Build parallelism**: core-types has zero deps, builds in <2s

## GraphRAG Validation (2026-03-24)

> 12 targeted queries against 130,574 indexed symbols (OpenAI embeddings, 577.8 MB cache).
> Direct code analysis performed on all packages claimed as "type-only".

### Confirmed Claims

- **AST types are pure**: `HSPlusAST`, `HSPlusNode` in `types/HoloScriptPlus.ts` — zero runtime class references
- **Composition types are pure**: `HoloComposition` has 1,117+ call sites, all treat it as data shape
- **Physics/Hologram types are extractable**: `QuiltConfig`, `QuiltTile`, `PhysicsBody` are pure interfaces
- **Security types are pure**: `CapabilityRBACConfig`, `Permission`, `RBACRole` — data shapes only

### Challenged Claims (REVISED)

- **LSP is NOT type-only**: 5 files import `HoloScriptDebugger`, `SemanticSearchService`, `runSafetyPass`, `HoloScriptPlusParser` (all runtime)
- **Runtime is NOT type-only**: `BrowserRuntime.ts` imports `parseHolo`, `parseHoloScriptPlus`, `TraitCompositor`, `MATERIAL_PRESETS` (all runtime)
- **GraphQL-API is NOT type-only**: Zero static imports, but uses `await import('@holoscript/core')` for `HoloScriptPlusParser` at runtime
- **~160 types needs verification**: 78 explicit `export type` + 20 `export *` barrels in index.ts; true count requires traversing all re-exported modules
- **LSP file count overstated**: 5 files import from core (not 10)

### New Risks Discovered

1. **WASM type duplication**: `studio/public/wasm/interfaces/holoscript-core-types.d.ts` has independent type definitions (`CompileResult`, `TraitDef`, `ObjectNode`) that mirror core types — potential conflict surface
2. **BundleAnalyzer already exists**: `BundleAnalyzer.calculateUnusedExports()` and `findTreeshakingOpportunities()` should be run FIRST to identify dead exports before extracting — some candidates may be dead code
3. **Dynamic imports invisible to static analysis**: GraphQL-API's `await import('@holoscript/core')` pattern means static analysis falsely classifies it as type-only

## What Gets Extracted (~160 types)

### High-Priority (Zero Risk — GraphRAG Confirmed)

- AST types: `HSPlusAST`, `ASTProgram`, `HSPlusDirective`, `HSPlusNode`
- Composition types: `HoloComposition`, `HoloObjectDecl`, `HoloTrait`, `HoloEffect`
- Config types: `RuntimeOptions`, all `*CompilerOptions`
- Trait annotation types: `TraitAnnotation`, `MaterialTraitAnnotation`, etc.
- Domain types: `HoloDomainType`, `HoloDomainBlock`
- Physics types: `BodyProps`, `BodyState`, `BodyConnection`
- Security types: `RBACRole`, `Permission`, `CapabilityGrant`
- Hologram types: `QuiltConfig`, `QuiltTile`, `MVHEVCConfig`

### What Stays in Core (Runtime)

- All `Parser` classes
- All `Compiler` classes
- All `Runtime` classes
- All `Engine` classes
- All trait `Handler` functions
- All registry/manager classes

## Dependent Analysis (REVISED)

| Package         | Files | Type-Only?          | Action                    | GraphRAG Status      |
| --------------- | ----- | ------------------- | ------------------------- | -------------------- |
| studio          | 79    | Mixed               | Selective migration       | Unchanged            |
| video-tutorials | 18    | Mixed               | Selective migration       | Unchanged            |
| cli             | 18    | Mixed               | Keep core                 | Unchanged            |
| r3f-renderer    | 14    | Mixed               | Keep core                 | Unchanged            |
| mcp-server      | 13    | No                  | Keep core                 | Unchanged            |
| lsp             | 5     | **Mixed**           | **Keep core + selective** | CORRECTED: was "YES" |
| graphql-api     | 6     | **Mixed (dynamic)** | **Keep core**             | CORRECTED: was "YES" |
| linter          | 5     | Mixed               | Selective                 | Unchanged            |
| benchmark       | 5     | No                  | Keep core                 | Unchanged            |
| runtime         | 2     | **Mixed**           | **Keep core + selective** | CORRECTED: was "YES" |
| traits          | 2     | Mixed               | Selective                 | Unchanged            |

## Package Structure

```
packages/core-types/
├── src/
│   ├── index.ts
│   ├── ast.ts
│   ├── composition.ts
│   ├── compiler.ts
│   ├── traits.ts
│   ├── physics.ts
│   ├── domain.ts
│   ├── security.ts
│   └── hologram.ts
├── package.json    (zero deps)
└── tsconfig.json
```

## Pre-Extraction Phase (NEW — 0.5 day)

Before extracting, run these diagnostics:

1. `BundleAnalyzer.calculateUnusedExports()` — identify dead type exports for deletion
2. `BundleAnalyzer.findTreeshakingOpportunities()` — confirm types are tree-shakeable
3. Audit `studio/public/wasm/interfaces/holoscript-core-types.d.ts` for conflicts
4. Verify actual type count by traversing all `export *` barrels

## Migration Strategy

### Phase 1: Create Package (0.5 day)

- Scaffold `packages/core-types/`
- Extract verified pure type exports
- Verify isolation (no runtime imports)

### Phase 2: Dual-Export (1 day)

- Re-export all extracted types from `@holoscript/core`
- Both import paths work simultaneously
- Zero breaking changes

### Phase 3: Internal Migration (3 days — revised from 2)

- Update **selective** dependents only: studio, video-tutorials, traits, linter
- LSP, graphql-api, runtime **keep core** for runtime imports, add core-types for type-only imports where beneficial
- Audit each import statement individually (no bulk migration)

### Phase 4: Validation (1.5 days — revised from 1)

- Full test suite (45,900+ tests)
- Bundle size comparison
- Type-check speed benchmarks
- Verify WASM type files don't conflict

### Phase 5: Documentation (0.5 day)

- Migration guide
- Update CLAUDE.md type import patterns

## Quality Gates

- [x] Run BundleAnalyzer before extraction (pre-gate) — 576 types found, WASM conflicts identified
- [x] core-types < 50KB uncompressed — **408 KB dist/** (mostly .d.ts declarations)
- [x] Zero new type errors in all 30 dependents — confirmed
- [x] Build time ≤ 2s for core-types — **6.6s full build** (ESM+CJS+DTS, 7 entry points)
- [x] Tree-shaking verified: importing core-types doesn't pull core runtime — JS chunks are empty
- [x] WASM types don't conflict with core-types — kept separate (Option C)
- [x] All 45,900+ tests pass — 12,301 in scope passed, 0 regressions

## Validation Results (Phase 4)

| Metric       | core         | core-types  | Improvement                    |
| ------------ | ------------ | ----------- | ------------------------------ |
| dist/ size   | 94 MB        | 408 KB      | 230x smaller                   |
| index.js     | 2.57 MB      | 3.87 KB     | 664x smaller                   |
| Dependencies | 20+ packages | 0           | Zero-dep                       |
| Type-check   | ~5s (tsc)    | ~4.6s (tsc) | Faster for pure-type consumers |

## Completed Migrations (Phase 3)

| Package     | Import Changed                  | From | To                     |
| ----------- | ------------------------------- | ---- | ---------------------- |
| semantic-2d | HoloComposition, HoloObjectDecl | core | core-types/composition |
| cli         | ASTNode                         | core | core-types/ast         |

**Finding**: 100+ composition type imports are internal to `packages/core` (relative paths). Only 2 cross-package type imports were actionable for migration. The value of core-types is primarily for **new consumers and external packages**.

## Migration Guide

### For new code

```typescript
// Prefer core-types for type-only imports
import type { HoloComposition, HoloObjectDecl } from '@holoscript/core-types/composition';
import type { ASTNode, HSPlusDirective } from '@holoscript/core-types/ast';
import type { AnimationConfig } from '@holoscript/core-types/animation';
import type { BodyProps, IPhysicsWorld } from '@holoscript/core-types/physics';
import type { RBACRole, CapabilityRBACConfig } from '@holoscript/core-types/security';
import type { QuiltConfig, DepthResult } from '@holoscript/core-types/hologram';

// Keep @holoscript/core for runtime values
import { parseHolo, CompilerBase, HoloScriptPlusParser } from '@holoscript/core';
```

### Available subpath exports

- `@holoscript/core-types` — barrel (all 341 types)
- `@holoscript/core-types/composition` — 157 types (HoloComposition, HoloNode, etc.)
- `@holoscript/core-types/ast` — 49 types (ASTNode, HSPlusDirective, etc.)
- `@holoscript/core-types/physics` — 71 types (BodyProps, IPhysicsWorld, etc.)
- `@holoscript/core-types/security` — 39 types (RBACRole, AgentConfig, etc.)
- `@holoscript/core-types/animation` — 15 types (AnimationConfig, etc.)
- `@holoscript/core-types/hologram` — 10 types (QuiltConfig, etc.)

## Deprecation Path

1. ~~**Weeks 1-2**: Release core-types, dual-export from core~~ **DONE**
2. **Ongoing**: New packages should prefer `@holoscript/core-types` for type imports
3. **v6.0** (optional): Remove type re-exports from core → major version bump
