/**
 * @holoscript/core-types
 *
 * Pure type definitions for HoloScript — zero runtime dependencies.
 * This package provides type-only imports for consumers that don't need
 * the full @holoscript/core runtime (parsers, compilers, engines).
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
