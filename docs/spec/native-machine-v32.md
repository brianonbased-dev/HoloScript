# Native machine contract v32: exact conditional borrow-summary joins

## Status

`hs-machine-v32` extends V31's deterministic transitive borrow summaries across exhaustive
`if`/`else` control flow. A borrowed result may leave through multiple reachable branches only
when every branch composes to the same exact typed provenance summary. V32 is an internal
capability/evidence contract under the
[native machine release ladder](native-machine-release-ladder.md), not a public SemVer release.

## Admitted control-flow shape

A conditional borrowed-summary function contains one final top-level `if` with an `else`. Every
reachable branch terminates in exactly one direct named HoloScript call return. Nested exhaustive
conditionals are admitted recursively. The condition uses the existing typed native control-flow
contract; it does not participate in result provenance.

Direct forwarding functions remain valid, so an acyclic call graph may freely compose V31 relays
before and after a V32 join. Each branch call remaps the callee's source, index, start, and end
positions through exact caller parameter identifiers before the join is compared.

## Exact join identity

Branches join only when their complete `MachineResult` summaries are equal. Equality includes:

- result type and mutability;
- caller source-parameter position;
- nominal source and target layout fingerprints;
- static field byte offset; and
- dynamic index or half-open range parameter positions.

The compiler performs this proof before native lowering. Existing branch lowering then emits each
return against the one joined ABI/provenance summary. No runtime tag, union, or erased pointer is
introduced.

## Fail-closed boundary

V32 rejects a missing `else`, fallthrough, non-call return, statements alongside a branch return,
loops in the result-selection region, divergent sources, layouts, field coordinates, range or index
coordinates, mutability, unknown callees, and recursive summary cycles. V31's rejection of locals,
temporaries, computed coordinate substitutions, dead or moved owners, alias conflicts, raw pointers,
casts, globals/statics, asynchronous capture, concurrency, atomics, foreign borrowed ABIs, custom
destructors, and unwinding remains inherited.

## Evidence

The shared/mutable conformance matrix and adversarial join matrix live in
`packages/compiler-native/tests/native_smoke.rs`. They cover scalar fields, aggregate references,
ordinary slices, checked slice elements, and aggregate-buffer sub-slices; compile identical object
bytes twice; and run optimized host executables that exit 5. The canonical program is
`examples/native/conditional-borrow-summary-exit-five.hs`.

The immediate predecessor is
[native machine contract v31](native-machine-v31.md).
