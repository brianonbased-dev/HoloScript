# @holoscript/core-types Extraction Plan

> Status: **PLANNED** (validated via GraphRAG, 2026-03-24)
> Risk: **Medium-High** — 30 dependent packages; fewer type-only consumers than initially estimated
> Effort: **~8 dev-days** across 2-3 weeks (revised upward from 6)

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

| Package | Files | Type-Only? | Action | GraphRAG Status |
|---------|-------|-----------|--------|-----------------|
| studio | 79 | Mixed | Selective migration | Unchanged |
| video-tutorials | 18 | Mixed | Selective migration | Unchanged |
| cli | 18 | Mixed | Keep core | Unchanged |
| r3f-renderer | 14 | Mixed | Keep core | Unchanged |
| mcp-server | 13 | No | Keep core | Unchanged |
| lsp | 5 | **Mixed** | **Keep core + selective** | CORRECTED: was "YES" |
| graphql-api | 6 | **Mixed (dynamic)** | **Keep core** | CORRECTED: was "YES" |
| linter | 5 | Mixed | Selective | Unchanged |
| benchmark | 5 | No | Keep core | Unchanged |
| runtime | 2 | **Mixed** | **Keep core + selective** | CORRECTED: was "YES" |
| traits | 2 | Mixed | Selective | Unchanged |

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

- [ ] Run BundleAnalyzer before extraction (pre-gate)
- [ ] core-types < 50KB uncompressed
- [ ] Zero new type errors in all 30 dependents
- [ ] Build time ≤ 2s for core-types
- [ ] Tree-shaking verified: importing core-types doesn't pull core runtime
- [ ] WASM types don't conflict with core-types
- [ ] All 45,900+ tests pass

## Deprecation Path

1. **Weeks 1-2**: Release core-types, dual-export from core
2. **Weeks 3-8**: Migrate internal packages (selective only)
3. **Week 9+**: (Optional) Remove re-exports from core → major version bump

## Decision

This is a **high-value, medium-high-risk** refactor. The core types ARE pure and extractable, but the benefit is **smaller than initially estimated** because LSP, runtime, and graphql-api all require core runtime and cannot fully migrate away.

Recommended for **v5.4 timeframe** (not v5.3). Do NOT attempt in a single session.

**Key insight from GraphRAG**: The value proposition shifts from "many packages can drop core" to "types build faster and the dependency graph is clearer." Bundle size savings apply mainly to studio's selective imports and new external consumers.
