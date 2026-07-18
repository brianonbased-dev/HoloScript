# The Dumb Glass Architecture (Epoch 8)

> **Current-state boundary (2026-07-18).** This document defines a target
> architecture, not a shipped invariant. The current Paper 13 artifact is a
> narrow CPU provenance-hashing slice. A WGSL path exists, but there is no
> validated GPU benchmark, full per-pixel provenance chain, or cross-backend
> identity result. Current frontends still contain presentation logic,
> fallbacks, and caching, so "zero logic" is an acceptance criterion.

> **"The Dumb Glass"** codifies HoloLand's transition from a monolithic application into a pure, agent-native spatial rendering environment.

The Dumb Glass names the intended transition away from centralized application
logic toward a projection-oriented frontend. Legacy surfaces and frontend
control paths still exist; all physics, semantics, and economic constraints are
not yet enforced exclusively by HoloMesh.

## 1. Core Philosophy

The Dumb Glass target is evaluated against three primary directives:

1. **Zero-Logic Rendering**: move game-loop physics and business semantics out
   of the render boundary and into declared HoloScript behavior.
2. **CRDT-backed source state**: make spatial entity ingestion converge through
   explicit shared-state contracts rather than assuming migration is complete.
3. **Agent-native policy**: make moderation, governance, and placement
   independently inspectable rather than hiding them in frontend control flow.

## 2. Spatial Feed Architecture (V3)

The current prototype seam is **Spatial Feed V3**, with a chunk-based
incremental AST subscriber (`SpatialFeedRenderer.tsx`). Incoming agent content
can be parsed into 3D scene nodes, but this seam does not establish the full
Dumb Glass contract.

### Trait-Driven Moderation

Architecture beats algorithms in spatial moderation:

- **Spam Control**: Low-reputation or flagged entities are intrinsically tagged with heavy gravitational constraints (`@gravity(1.5)`), causing them to quickly fall out of the user's field of view or sink into "gravity traps" embedded in the floor geometry.
- **Reputation Clustering**: High-value logic clusters are tagged with `@attraction(radius: 30)` and positive buoyancy, dynamically aggregating together in the user's primary field of view like floating constellations.

## 3. GAPS (Geometric And Physics Scaling)

The design proposes **GAPS** for planetary-scale swarms. Its target is to
monitor compute budget and adjust visual Level-of-Detail without changing
underlying peer-mesh state.

The proposed overload policy includes:

1. Progressively dropping expensive spatial shaders (`transmission`, `glass`).
2. Halting cosmetic rendering loops (e.g., stopping the `Float` component).
3. Utilizing aggressive `useMemo` caching logic down to the individual AST node boundary.

## 4. V4 Gossip & x402 Sovereign Economy

The target economic boundary uses HoloKey/x402-backed identity and settlement.
The following are design requirements, not blanket claims about every current
entity path:

1. **Wallet Signatures**: Inbound gossip payloads run through `verifyGossipSender` asserting Ed25519 or EVM wallet ownership derived from the agent ID.
2. **Proof-of-Play (PoP)**: Insights tagged with `on_interact` natively wrap math challenges, functioning as distributed micro-jobs settled dynamically between agent wallets.
3. **Peer Convergence**: Instead of handling conflict reconciliation, agents strictly append to the `LoroText` document as an ever-growing `.hs` syntax trace. The HoloScript AST interpreter natively manages the conflict-free compilation.

## 5. Next-Generation Pillar Extrapolations

The target decoupling is intended to support future edge capabilities:

- **SNN WebGPU Computing**: Nodes utilizing `@TensorOp` or `@NeuralForge` instantly compile neural weights direct to spatial memory.
- **IoT Digital Twins**: Entities with `@WoTThing` pipe pure real-world MQTT streams straight to the spatial buffer.
- **Temporal Scrubbing**: Since `worldstate.crdt` holds the pure byte-differential history, the rendering canvas supports native "Time-Travel", allowing the mesh to reverse time and halt physics dynamically for playback and auditing.

---

_Generated via uAA2++ Evolution | HoloMesh Ecosystem_
