# core-types ⟷ core/src/types overlap audit

**Date**: 2026-04-29
**Scope**: Audit item from session — *"core-types exports ~200+ interfaces that likely overlap with core/src internal types. Worth an audit."*
**Methodology**: name-collision diff via `comm -12` of sorted `^export interface` names, followed by full-body diff of every collision.

## TL;DR

The audit's framing was misleading. The actual numbers:

| | Count | Status |
|---|---|---|
| Name collisions between core-types and core/src/types | **43** | most are correct mirrors |
| Of those, IDENTICAL bodies | **41** | mirror is working |
| Of those, DRIFTED bodies | **2** | real bugs — see below |
| In `core-types` only (no collision) | 240 | legitimate type-only extractions (animation, capability, cutscenes, etc.) |
| In `core/src/types` only (no collision) | 184 | legitimate internal-only types (trait interfaces — runtime-bound) |

Total interfaces: 283 in core-types, 227 in core/src/types. The "200+ overlap" framing conflated total surface with collision surface.

## The 2 real drifts

### 1. `ASTNode` (core-types/src/ast.ts ⟷ core/src/types/base.ts)

`core/src/types/base.ts` carries a 7-line `provenance?` field for algebraic-weight provenance threading; the core-types mirror is missing it.

```diff
 export interface ASTNode extends BaseASTNode {
   /** HS+ Directives */
   directives?: HSPlusDirective[];
   /** HS+ Traits (Pre-processed map) */
   traits?: Map<VRTraitName, Record<string, unknown>>;
+  /** Spatial Feed Provenance */
+  provenance?: {
+    author: string;
+    timestamp: number;
+    provenanceHash: string;
+    context?: ProvenanceContext; // Algebraic weight threading
+  };
 }
```

**Impact**: Consumers importing `ASTNode` from `@holoscript/core-types` (e.g. CLI, semantic-2d when it lived as a separate package) write code that doesn't account for `node.provenance`. Provenance-threaded AST nodes pass through their type system as `provenance: never` rather than the structured object — silent loss of compile-time guidance.

### 2. `HSPlusNode` (core-types/src/ast.ts ⟷ core/src/types/HoloScriptPlus.ts)

Three drifts in one interface:

- **`rotation` / `scale` typing**: core uses `Vector3 | Quaternion` aliases; core-types uses raw tuple types `[number, number, number]` / `[number, number, number, number]`. Functionally identical at runtime, but downstream type narrowing differs (`Vector3` is its own alias in core; type-narrowing utilities that key on those aliases miss in core-types).
- **Missing `state` block field**: core has a `state?: Record<string, unknown>` field populated by the parser when a `state { key = value }` block appears inside a node declaration. core-types has no equivalent.
- **Missing inferred-type field**: core has a field populated by `TypeInferencePass`. core-types misses it.

**Impact**: Consumers importing `HSPlusNode` from core-types can't write code that uses the parsed-state block or the type-inference results. Anyone authoring tooling against core-types' `HSPlusNode` is working with a stale shape.

## Structural finding: the planned sync script doesn't exist yet

`packages/core-types/src/index.ts` lines 14-30 explicitly describe a planned `pnpm sync` script that would:

1. Read `export type` / `export interface` from `packages/core/src/types/`
2. Strip runtime imports
3. Write pure type-only declarations to core-types
4. `tsc --noEmit` to verify zero runtime deps

**The script doesn't exist.** Until it does, drift will keep happening — the 2 cases above are evidence. The 41 identical interfaces are the developers-being-careful baseline; the 2 drifts are the inevitable result of manual mirroring without tooling.

## Recommendations (ranked by leverage)

1. **Fix the 2 drifts** (small, mechanical): patch `ASTNode` and `HSPlusNode` in core-types to match core. ~30 min total.
2. **Build the sync script** (one-time, prevents recurrence): the README describes it; build it. ~1 session. Dependencies: ts-morph or simple regex parsing of `export type`/`export interface` blocks. CI step that fails if running it would produce a diff.
3. **(Optional) Audit the 184 core-only trait interfaces**: most of these are `*Trait` runtime-bound types and should NOT be in core-types. A one-pass review can confirm; flag any that public consumers actually need.

The audit's catastrophising framing ("200+ interfaces overlap") would have justified a multi-session deep refactor. The honest finding justifies ~1 session of cleanup + one-time tool build.

## Coordinates

- Audit script: in-shell (no committed harness yet) — `comm -12` over sorted `^export interface` names from both trees
- Drift verification: `awk "/^export interface $name /,/^}/"` on each side, diff the bodies
- Drifted interfaces:
  - [packages/core-types/src/ast.ts](packages/core-types/src/ast.ts) — `ASTNode`, `HSPlusNode`
  - [packages/core/src/types/base.ts](packages/core/src/types/base.ts) — canonical `ASTNode`
  - [packages/core/src/types/HoloScriptPlus.ts](packages/core/src/types/HoloScriptPlus.ts) — canonical `HSPlusNode`
- Sync-script spec: [packages/core-types/src/index.ts:14-30](packages/core-types/src/index.ts:14)

## Filed tasks

Filed against the HoloMesh team board (`team_1775935947314_f0noxi`):

| Task ID | Priority | Title |
|---|---|---|
| `task_1777526366319_mobj` | high | Fix ASTNode drift in @holoscript/core-types |
| `task_1777526366932_d16p` | high | Fix HSPlusNode drift in @holoscript/core-types |
| `task_1777526367629_270g` | medium | Build pnpm sync script for @holoscript/core-types |

Trace artifacts (debug-probe tasks left open during the response-shape investigation; safe to ignore or close): `task_1777529045078_rg8h`, `task_1777529108397_5fwt`.
