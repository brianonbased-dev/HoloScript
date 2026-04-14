/**
 * @holoscript/core-types
 *
 * Pure type definitions for HoloScript — zero runtime dependencies.
 * This package provides type-only imports for consumers that don't need
 * the full @holoscript/core runtime (parsers, compilers, engines).
 *
 * ## Relationship with @holoscript/core/src/types/
 *
 * The **canonical** type definitions live in `packages/core/src/types/` and are
 * the actively-developed source of truth. This package (`@holoscript/core-types`)
 * is a **lightweight extraction** — it re-declares the same shapes from scratch
 * with zero imports from core so that downstream packages (e.g. `semantic-2d`,
 * `cli`) can consume HoloScript types without pulling in parsers, compilers,
 * or engines.
 *
 * ## Sync Protocol (future: `pnpm sync`)
 *
 * Today this package is manually maintained. The planned `sync` script will:
 * 1. Read all `export type` / `export interface` declarations from `packages/core/src/types/`.
 * 2. Strip any runtime imports (parsers, compilers, engines).
 * 3. Write the pure type-only declarations into this package's `src/` modules.
 * 4. Run `tsc --noEmit` to verify the result compiles with zero runtime deps.
 *
 * Until the script exists, follow this manual process:
 * 1. Make the change in `packages/core/src/types/` first (canonical).
 * 2. Mirror the change here if external consumers need it.
 * 3. Keep this package at zero runtime dependencies.
 *
 * Categories:
 * - composition: .holo declarative format types (HoloComposition, HoloObjectDecl, etc.)
 * - ast: HoloScript+ AST nodes and directives (HSPlusAST, HSPlusNode, etc.)
 * - animation: Animation system types (clips, states, transitions, parameters)
 * - physics: Physics engine types (bodies, constraints, joints, worlds)
 * - security: RBAC, capabilities, permissions
 * - hologram: Quilt, MV-HEVC, depth estimation configs
 *
 * @packageDocumentation
 */

// ── Composition Types ─────────────────────────────────────────────────────────
export * from './composition';

// ── AST & Directive Types ─────────────────────────────────────────────────────
export * from './ast';

// ── Animation Types ───────────────────────────────────────────────────────────
export * from './animation';

// ── Physics Types ─────────────────────────────────────────────────────────────
export * from './physics';

// ── Security Types ────────────────────────────────────────────────────────────
export * from './security';

// ── Hologram Types ────────────────────────────────────────────────────────────
export * from './hologram';

// ── Utility Types ────────────────────────────────────────────────────────────
export * from './utility';

// ── ANS Capability Paths ─────────────────────────────────────────────────────
export * from './ans';
