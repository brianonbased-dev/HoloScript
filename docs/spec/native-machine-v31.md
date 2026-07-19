# Native machine contract v31: compositional transitive borrow summaries

## Status

`hs-machine-v31` replaces the native compiler's one-hop borrowed-return special cases with typed,
deterministic summaries composed across an acyclic HoloScript call graph. It is an internal
capability/evidence contract under the [native machine release ladder](native-machine-release-ladder.md),
not a public SemVer release.

V31 supports shared and mutable caller-tied results for:

- nominal aggregates and static aggregate subobjects;
- scalar fields reached through static aggregate projections;
- ordinary slices and checked slice elements; and
- aggregate-owned-buffer elements, checked half-open sub-slices, and whole slices.

## Summary model

Each borrowed function result is represented by a closed typed summary. The summary retains:

- result target type and mutability;
- the exact source parameter position carrying the declared result lifetime;
- nominal source and target layout fingerprints where aggregates participate;
- the exact static field byte offset for aggregate projections; and
- exact `i32` parameter positions for element indices or half-open range coordinates.

The summary is compiler-only. Native ABI values remain one pointer for scalar or aggregate
references and `(base, length)` for slices.

## Composition

For a direct forwarding return `return callee(arguments)`, the compiler resolves the callee summary
first, then remaps every provenance-bearing parameter position through the call arguments to an
exact parameter position in the caller. The static projection and type components are preserved
unchanged. This operation repeats until a non-forwarding leaf is reached, so chain depth is bounded
by the finite acyclic call graph rather than an arbitrary hop count.

Composition is admitted only when:

- caller and callee both declare explicit lifetimed reference results;
- each forwarding function has one direct top-level final named-function call return;
- every source, index, start, and end position maps through an exact identifier naming a caller
  parameter;
- parameter ABI type and mutability remain identical, with lifetime binder names allowed to differ;
- the composed source position is the caller's unique declared lifetime source; and
- the composed result target type and mutability match the caller declaration.

Functions may reorder parameters between hops. The typed positional remap preserves the exact
mapping rather than relying on parameter names or source order. Summary resolution follows source
declaration order, memoizes completed functions, and emits identical object bytes for identical
source.

## Fail-closed boundary

V31 rejects recursive or mutually recursive borrowed-summary cycles, unknown callees, ambiguous
lifetime sources, type or mutability changes, local aliases, temporaries, computed coordinate
substitutions, conditional or multiple forwarding returns, dead/moved/dropped owners, and shared or
exclusive alias conflicts. Raw pointers, casts, globals/statics, asynchronous capture, concurrency,
atomics, foreign borrowed ABIs, custom destructors, and unwinding remain outside the contract.

Runtime pointer, length, bounds, alignment, allocator-provenance, exact-projection, and whole-root
lease checks inherited from V19-V30 remain active at every leaf, relay, and outer caller.

## Evidence

The shared/mutable three-edge conformance matrix and adversarial rejection matrix live in
`packages/compiler-native/tests/native_smoke.rs`. They cover all supported result shapes, verify
deterministic object bytes, and run linked executables that exit 5. The canonical whole-slice
program is `examples/native/compositional-borrow-summary-exit-five.hs`.

The immediate predecessor is
[native machine contract v30](native-machine-v30.md).
