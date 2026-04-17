# Research Ticket: Tropical Semiring Formalization (v1)

## Current Status
We currently expose a heuristic 3×3 matrix (`TropicalSemiringDigest` via `computeTropicalSemiringDigest()`) and a canonical SHA-256 fingerprint (`provenance_semiring_digest: { scheme: 'sha256_canonical_v0' }`).
**The Delta:** The code outputs the matrix correctly bounded on max/plus vectors, but we cannot mathematically assert that this specific matrix guarantees a pure **homorphism** over all Loro CRDT merge events. 

## Objectives
1. **Define the Operators:** Explicitly finalize which Loro ops and audit events correspond to the Min-Plus ($\oplus$) and Max-Plus ($\otimes$) operations.
2. **Prove Monotonicity:** Generate mathematically robust unit tests asserting that no matter what order the peer tree merges `LoroWebRTCProvider` events, the resulting `TropicalSemiringDigest` resolves monotonically inside the algebraic graph without violating consistency.
3. **Formal Specification Draft:** Write out the formal equations mapping spatial states to the `HoloVM` operations. This creates the "algebraically irrefutable" IP defensibility.

## Acceptance Criteria
- [ ] A formal `.md` specification demonstrating the mathematical mapping.
- [ ] A dedicated `SemiringFormalism.test.ts` file running permutations showing identical matrix outcomes regardless of concurrent op order.
- [ ] Schema version bump in `GistPublicationManifest` once the constraints are merged, completing the transition from heuristical v0 to mathematically sound v1.
