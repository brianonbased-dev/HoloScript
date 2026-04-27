# Milestone digest — 2026-04-21

* **Program / theme:** SECURITY-mode Option C hardening + Route 2b/2d cross-adapter ε-tolerance + lights-out recipe infrastructure (Wave-1 → Wave-1.5 → Wave-2 → SECURITY arc, spanning 2026-04-19 → 2026-04-21)
* **PR / commit:** 325 commits across HoloScript + ai-ecosystem over the 2.5-day window; cumulative release captured in `.changeset/2026-04-21-option-c-route-2b-lights-out.md` and `CHANGELOG.md` [Unreleased] — 2026-04-21. Representative HEAD commits: HoloScript `8d415f0ad` (recipe consolidated doc), HoloScript `76f533b38` (Option C integration tests, 103/103 green), ai-ecosystem `e3a708e` (paper-level Option C inheritance across 6 papers).

## Three bullets

1. **What shipped:** Option C adversarial-peer opt-in hardening via `useCryptographicHash: true` flag (all three hash sites — CAEL chain, geometry, state digests — through single `hashBytes(bytes, mode)` dispatcher); paper-3 Property 4 lifted from same-adapter bit-identity to cross-adapter ε-tolerance via per-step `computeStateDigest` + per-field `FIELD_QUANTUM_REGISTRY` + `stateDigests[]`; TVCG Rev-1 bundle 5/5 patches landed locally; paper-3 Appendix A Lemmas 1-3 formal (contractivity under L≤1); 4 lights-out recipe components shipped (precedent-query-first CLI, peer-drift detection doc, action-reversibility registry, consolidated onboarding doc); stale-shadow prevention gate + 1,662-file one-time sweep closes the supply-chain recurrence surface.
2. **Proof:** 103/103 tests across `sha256.test.ts` + `SimulationContract.test.ts` + `CAELPhase1.test.ts`; 116/116 across the full contract + CAEL surface including `CAELPhase2Embodied` + `CRDTCAELBridge`; RFC 6234 §B.1-2 SHA-256 test vectors + random-input cross-check against native; pure-JS SHA-256 bench tables at `research/2026-04-20_sha256-feature-flag-design.md` (FNV-1a vs native vs pure-JS across 5 payload sizes, 9-24× pure-JS overhead drove Option B → Option C reversal); paper-3 §Limitations / TBC §Limitations inline threat-model paragraphs; `graduate.py verify` 168/168 pass on existing vault; 3 new GOLD entries (W.GOLD.191/192/193) sealed with real SHA-256.
3. **Constraint / risk:** Adapter-fingerprint attestation remains externally blocked on browser-vendor signing APIs (`navigator.gpu.requestAdapter().info` signature) — forgery surface documented inline in paper-3 §Limitations but not fully closable inside HoloScript alone. Cross-adapter empirical rows (per pre-registered protocol v1.0.1's 6-row vendor matrix) still hardware-gated — closes the last 2-5% conviction on paper-3 Property 4 from current ~95-98%. Option C's default-FNV-1a is threat-model-driven (non-adversarial majority); if deployment mix shifts toward adversarial multi-agent, the default should flip per the scoped-by-default discipline captured in W.GOLD.193.

## Mirror

Paste this block into Team Connect / HoloMesh handoff so the repo and the room stay aligned.

**Release surface**: `@holoscript/core` 6.0.4 → **7.0.0** (fixed-7 group bumps via core), `@holoscript/engine` 6.0.4 → **7.0.0**, `@holoscript/crdt` 1.0.0 → 1.1.0, `@holoscript/mcp-server` 6.0.4 → **7.0.0**, `@holoscript/studio` 6.0.3 → **7.0.0** (catches lane drift). **Audit note (2026-04-26, wmxc):** Actual bump was 7.0.0 (platform major), not the predicted 6.1.0 — see CHANGELOG [7.0.0] section.

**Board state**: 8 of 10 lights-out-recipe tasks I seeded on 2026-04-21 shipped within the same day (peer-agent execution); only remaining open are hardware-gated (cross-adapter empirics) + one low-priority memory-audit housekeeping task. 9+ of 20 pre-session seeded tasks consumed.

**Vault**: 180 → 183 entries (4 Diamond / 4 Platinum / 175 Gold). GOLD additions this window encode the audit-peer-loop mechanism (W.GOLD.191), the Route 2b technical pattern (W.GOLD.192), and the threat-model-driven-default design principle (W.GOLD.193). Reading all three traces the SHA-256 Option B → Option C reversal at three layers.
