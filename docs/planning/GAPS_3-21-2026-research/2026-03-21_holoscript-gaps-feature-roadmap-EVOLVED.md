# Research EVOLVED: HoloScript GAPS Feature Roadmap -- Agent-Mapped Implementation Plan

**Date**: 2026-03-21
**Phase**: 6 EVOLVE
**Parent**: 2026-03-21_holoscript-gaps-feature-roadmap.md
**Growth**: 2026-03-21_holoscript-gaps-feature-roadmap-GROW.md

## RE-INTAKE Delta (What Changed After Re-Absorbing)

1. **CRDT scope correction**: Loro CRDT should NOT sync particle buffers. Particles are ephemeral simulation state changing at 60fps -- CRDT metadata overhead (version vectors, tombstones) would make this bandwidth-prohibitive. Correct architecture: CRDT for high-level state (object ownership, world structure, NPC memories, inventory, terrain heightmap), raw binary WebRTC DataChannel for physics particle positions. Two-tier state synchronization.

2. **Effort timeline compression**: Individual category estimates sum to 24-34 weeks. But 7 cross-domain relationships reveal heavy overlap: the PBD solver serves physics + crowd + cloth + soft body (one implementation, four traits). @weather hub drives volumetrics + physics + erosion (one state, five consumers). CRDT layer serves persistence + multiplayer + publishing (one infrastructure, three use cases). Realistic total: **14-18 weeks for the full GAPS roadmap** with proper dependency ordering.

3. **Missed connection: @weather -> @erosion -> persistence**. Weather drives erosion, erosion modifies persistent terrain state. This IS the "time-progression" system (worlds evolve when offline). Falls out naturally from the @weather hub architecture without separate implementation -- just wire @erosion as another @weather consumer that writes to the CRDT terrain heightmap.

4. **Missed connection: Lip-sync + PPA NPC = talking AI companions**. NPC generates text (local LLM) -> TTS -> WebAudio -> viseme mapper -> avatar lip animation. No other spatial computing platform offers real-time lip-synced AI companions. This is a differentiating feature requiring zero new technology (all components researched and production-ready).

5. **Missed connection: Token gating + moderation = economic safety**. @token_gated + @moderation create tiered access: free areas with strict AI moderation, paid areas with lighter moderation (economic friction = natural griefing deterrent). This is an architectural insight, not a feature -- it means moderation and economy should share a permission system.

6. **SNN integration gap**: HoloScript's @snn trait (W.058, WGSL, 10K neurons in 1.1ms) could replace LLM inference for NPC reflex-level decisions (fight/flee/trade), reserving the quantized LLM for complex dialogue. Hybrid NPC architecture: SNN for real-time reflexes (GPU, sub-millisecond) + local LLM for conversation (NPU, <100ms).

## Corrected Architecture: Three Pillars

The 10 GAPS categories collapse into **three architectural pillars** after re-intake analysis:

### Pillar A: Unified Physics Engine (GAPS 1, 2, 7)

**Scope**: PBD solver + MLS-MPM fluid + raymarched volumetrics + quality tiers
**Agent**: `/holoscript`
**Effort**: 6-8 weeks

Components:

- PBD Jacobi solver (compute shader, single particle buffer)
- MLS-MPM fluid module (P2G/G2P compute shaders + SSFR rendering)
- Soft body + destruction + tearing modules (PBD constraints)
- @crowd_sim module (spatial hash grid + bitonic sort)
- Volumetric cloud raymarcher (@volumetric_clouds)
- God ray post-processor (@god_rays)
- @weather hub trait (blackboard state driving all consumers)
- Quality-tier conditional compilation (separate WGSL per tier)
- KTX2 + LOD + draw call batching compiler passes

### Pillar B: Persistent Multiplayer World (GAPS 3, 4, 8)

**Scope**: CRDT high-level state + WebRTC physics sync + spatial voice + publishing pipeline
**Agent**: `/holoscript` + `/hololand`
**Effort**: 5-7 weeks

Components:

- Loro CRDT integration for high-level world state (objects, terrain, NPC memory)
- MV-Transformer pattern for spatial state (state-based CRDT for rotation)
- Raw WebRTC DataChannel for physics particle sync (binary protocol)
- Server authority daemon for physics "global rules"
- WebRTC spatial voice + proximity chat
- Viseme lip-sync (@lip_sync trait)
- World portals + instancing
- Studio -> Hololand one-click publish (Loro snapshot + CDN + Zora mint)
- Versioning + rollback via Loro time-travel

### Pillar C: Living Economy (GAPS 5, 6, 9, 10)

**Scope**: Agentic NPCs + economy layer + device platform support + moderation
**Agent**: `/holoscript` + `/hololand` + `/frontend`
**Effort**: 5-7 weeks

Components:

- @ai_companion trait (PPA loop + RAG vector memory)
- Hybrid NPC inference: @snn for reflexes (GPU) + local LLM for dialogue (NPU)
- Social graph propagation (NPC-to-NPC gossip, emergent factions)
- NPC lip-synced speech (LLM -> TTS -> viseme -> avatar)
- Zora on-chain minting + dynamic royalties
- @token_gated trait for economic access control
- x402 in-world trading + $BRIAN gas for agent actions
- @moderation + @anti_grief traits
- Tiered access: token gating + moderation unified permission system
- Quest PWA + visionOS WebXR + Tauri desktop

## Agent-Mapped Execution Plan

### Phase 1: Foundation (Weeks 1-4) -- Ship Core Physics + Persistence

#### For holoscript (v5.0.0, 68 packages)

**Directive 1: PBD Unified Solver**

- Implement Position-Based Dynamics Jacobi solver as compute shader package
- Single particle buffer architecture: all physics entities are particles
- Constraint types: distance (rigid), bending (cloth), density (fluid), collision (crowd)
- Package: `@holoscript/pbd-solver` with WGSL compute shaders
- Test: 500K particles, >30 FPS on discrete GPU

**Directive 2: MLS-MPM @fluid Trait**

- Implement MLS-MPM fluid simulation using PBD solver particle buffer
- P2G/G2P stages using WebGPU atomicAdd
- Screen-Space Fluid Rendering (SSFR) pipeline at half resolution by default
- Trait API: `@fluid { type: "liquid" | "gas", particle_count: number, viscosity: number }`
- Test: 100K particles on iGPU, 300K on discrete GPU

**Directive 3: @weather Hub Trait**

- @weather owns blackboard state: wind_vector, precipitation, temperature, sun_position, cloud_density
- Other traits read @weather state as inputs
- Trait dependency: @weather -> [@physics, @volumetric_clouds, @god_rays, @particle_system, @cloth, @fluid, @erosion]
- Day-night cycle via sun_position progression
- Test: @weather changes propagate to all consumer traits within one frame

**Directive 4: Loro CRDT World State Layer**

- Integrate Loro CRDT v1.8+ for high-level world state
- State model: objects (LWW Map), terrain heightmap (List), NPC memory (Tree), inventory (Map)
- MV-Transformer pattern for spatial state: state-based CRDT for rotation (LWW), offset-based for position
- Separate from physics particle sync (raw binary, not CRDT)
- Railway persistent volume for snapshot storage
- Test: 10K objects sync between 2 clients with <100ms convergence

#### For hololand

**Directive 5: WebRTC Physics Sync Protocol**

- Binary WebRTC DataChannel protocol for physics particle positions
- NOT CRDT -- raw binary, server-authoritative for collision resolution
- Spatial partitioning: only sync particles within player's relevance radius
- Server daemon validates physics "global rules" (gravity, collision)
- Test: 2 players, 50K particles, <50ms P2P latency

### Phase 2: Experience Layer (Weeks 5-8) -- Rendering + Voice + NPCs

#### For holoscript

**Directive 6: @volumetric_clouds + @god_rays Traits**

- @volumetric_clouds: raymarching with Beer-Lambert, Henyey-Greenstein, light marching
- Reads cloud_density and sun_position from @weather blackboard
- @god_rays: screen-space post-process (GPU Gems Ch.13 algorithm)
- Quality tier: disabled on Quest 3 (Low tier), basic on Med, full on High/Ultra
- Test: 60fps on desktop at 1080p with volumetric clouds

**Directive 7: @ai_companion Trait (PPA + RAG)**

- Perception: observe nearby entities + retrieve memories from vector store (Qdrant Edge or embedded SQLite-vec)
- Planning: local quantized LLM (3B-8B, INT4) generates action plan
- Action: execute plan via @behavior_tree, update vector memory store
- Social graph: weighted affinity between NPCs, gossip propagation
- Hybrid inference: @snn for reflex decisions (fight/flee, <1ms), LLM for dialogue (<100ms)
- Test: 10 NPCs with persistent memory across sessions, emergent faction behavior

**Directive 8: @spatial_voice + @lip_sync Traits**

- @spatial_voice: WebRTC voice with HRTF spatialization and proximity attenuation
- @lip_sync: WebAudio frequency analysis -> viseme blend shape mapping
- Integration: @spatial_voice feeds audio stream to @lip_sync on remote avatars
- NPC speech path: LLM text -> browser TTS -> @lip_sync -> avatar animation
- Test: 10-player room with spatial voice, lip-sync at <200ms latency

**Directive 9: Quality-Tier Conditional Compilation**

- Add `--tier <low|med|high|ultra>` flag to `holoscript compile`
- Tier definitions: { low: {triangles: 50000, volumetrics: false, particles: 10000}, med: {triangles: 100000, volumetrics: "basic", particles: 50000}, high: {triangles: 300000, volumetrics: true, particles: 200000}, ultra: {triangles: 1000000, raytracing: true, particles: 300000} }
- Separate WGSL shader output per tier (not dynamic branching -- avoids Quest 3 divergence cost)
- KTX2 texture compression + LOD mesh generation + draw call batching as compiler passes
- Test: Same .holo source compiles to Quest 3 tier (90fps) and desktop tier (120fps)

### Phase 3: Economy + Polish (Weeks 9-14) -- Marketplace + Publishing + Devices

#### For holoscript

**Directive 10: @token_gated Trait + Zora Minting**

- @token_gated: wallet connection + NFT ownership check before area entry
- Zora SDK integration: one-click mint world composition as on-chain asset
- Dynamic royalties: creator earns from remixes and usage
- @moderation + @anti_grief integrated with permission system
- Test: Token-gated room that requires Zora NFT ownership to enter

**Directive 11: Studio One-Click Publish**

- Publish = compile + Loro snapshot + CDN asset upload + Zora mint + Hololand registry
- Live preview: WebSocket state sync from Studio to Hololand (hot-reload)
- Versioning: each publish = Loro checkpoint, rollback = restore snapshot
- Test: Create world in Studio, one-click publish, enter in Hololand, rollback to previous version

**Directive 12: Soft Body + Destruction + Terrain**

- @soft_body_pro: PBD constraint deformation with parametric tearing
- @destruction: fracture modes (Breaking Good algorithm), debris generation
- @deformable_terrain: GPU erosion compute shader, @weather-driven changes
- @erosion writes terrain heightmap changes to Loro CRDT (persistent world evolution)
- Test: Rain erodes terrain over time, changes persist across sessions

#### For frontend

**Directive 13: Quest PWA + visionOS Packaging**

- Quest: PWA manifest with immersive-mode launch, Bubblewrap APK generation
- visionOS: WebXR in Safari with transient-pointer input mode
- Tauri: multi-window desktop app with system tray for background agents
- Performance validation: automated 90fps test on Quest 3 Adreno
- Test: Same world accessible on Quest 3 PWA, Vision Pro Safari, and Tauri desktop

## Corrected Priority Matrix (Post-RE-INTAKE)

| Priority | Deliverable                    | Agent      | Impact                                | Effort  | Dependencies        |
| -------- | ------------------------------ | ---------- | ------------------------------------- | ------- | ------------------- |
| 1        | PBD Unified Solver             | holoscript | Critical (foundation for all physics) | 2 weeks | None                |
| 2        | MLS-MPM @fluid                 | holoscript | Critical (GAPS #1 priority)           | 2 weeks | PBD Solver          |
| 3        | Loro CRDT World State          | holoscript | Critical (foundation for persistence) | 2 weeks | None                |
| 4        | @weather Hub Trait             | holoscript | High (environmental coherence)        | 1 week  | PBD Solver          |
| 5        | WebRTC Physics Sync            | hololand   | Critical (foundation for multiplayer) | 2 weeks | Loro CRDT           |
| 6        | Quality-Tier Compilation       | holoscript | High (enables all devices)            | 2 weeks | PBD Solver, @fluid  |
| 7        | @volumetric_clouds + @god_rays | holoscript | High (visual fidelity)                | 2 weeks | @weather            |
| 8        | @ai_companion (PPA+RAG)        | holoscript | Very High (world liveness)            | 3 weeks | @behavior_tree      |
| 9        | @spatial_voice + @lip_sync     | holoscript | High (social immersion)               | 2 weeks | WebRTC              |
| 10       | @token_gated + Zora            | holoscript | High (economy foundation)             | 1 week  | Ed25519             |
| 11       | One-Click Publish              | holoscript | Very High (creator pipeline)          | 2 weeks | Loro CRDT, Zora     |
| 12       | Soft Body + Destruction        | holoscript | Medium-High (physics variety)         | 2 weeks | PBD Solver          |
| 13       | @crowd_sim                     | holoscript | Medium-High (world population)        | 1 week  | PBD Solver          |
| 14       | @moderation + @anti_grief      | holoscript | Medium (safety)                       | 1 week  | Permission system   |
| 15       | Quest PWA + visionOS           | frontend   | High (platform reach)                 | 2 weeks | Quality Tiers       |
| 16       | Tauri Desktop                  | frontend   | Medium (agent platform)               | 2 weeks | None                |
| 17       | @deformable_terrain + @erosion | holoscript | Medium (world evolution)              | 2 weeks | @weather, Loro CRDT |

## Evolved W/P/G Additions

### W.156 | Two-Tier State Sync: CRDT for Logic, Binary for Physics

CRDT metadata (version vectors, tombstones) makes per-particle sync at 60fps bandwidth-prohibitive. Correct architecture: Loro CRDT for high-level state (objects, terrain, NPC memory, inventory) + raw binary WebRTC DataChannel for ephemeral physics particles. Physics particles are simulation state that converges via deterministic solver, not collaborative state that needs conflict resolution. Server authority resolves physics disagreements, not CRDT merge.

### W.157 | @weather as World Simulation Hub Trait

@weather is not a rendering trait -- it is a world simulation trait that drives both rendering AND physics. Blackboard state (wind_vector, precipitation, temperature, sun_position, cloud_density) feeds: @volumetric_clouds, @god_rays, @physics (friction), @particle_system (rain), @cloth (wind), @fluid (viscosity), @erosion (terrain). This single hub trait creates the "environmental coherence" that makes worlds feel real. Implementation: one blackboard, seven consumers.

### W.158 | Hybrid NPC Inference: SNN Reflexes + LLM Dialogue

HoloScript's @snn trait (10K neurons in 1.1ms on WGSL) can handle NPC reflex decisions (fight/flee/trade/approach) on GPU in sub-millisecond time. Reserve the expensive local LLM (3B-8B, <100ms) for complex dialogue only. Architecture: @snn processes perception input every frame -> reflex action. When dialogue is triggered -> switch to LLM for text generation -> TTS -> @lip_sync. This hybrid approach gives NPCs instantaneous reactions AND thoughtful conversation.

### W.159 | Talking AI Companions: LLM -> TTS -> Viseme -> Avatar

Combining PPA NPC architecture with browser-native lip-sync creates AI companions that speak with lip-synced animation. Pipeline: local LLM generates text -> browser TTS API synthesizes speech -> WebAudio API extracts frequency data -> viseme mapper converts to ARKit blend shapes -> avatar mouth animates. All components are production-ready in 2026 browsers. No other spatial computing platform offers this end-to-end.

### W.160 | 10 GAPS Categories Collapse to 3 Architectural Pillars

After cross-domain analysis, the 10 GAPS categories reduce to: Pillar A (Unified Physics Engine: PBD + rendering + quality tiers), Pillar B (Persistent Multiplayer World: CRDT + WebRTC + voice + publishing), Pillar C (Living Economy: NPCs + marketplace + devices + moderation). Total realistic effort: 14-18 weeks with proper dependency ordering, not the naive 24-34 weeks sum. Overlap comes from: shared PBD solver (4 traits), shared CRDT layer (3 use cases), shared @weather hub (5 consumers).

### P.GAPS.09 | Two-Tier State Synchronization Pattern

Pattern: Use CRDT for collaborative high-level state (ownership, structure, memory) and raw binary channels for ephemeral simulation state (particle positions, velocities). Why: CRDTs add metadata overhead that makes per-frame per-particle sync prohibitive. Binary channels are fast but lack conflict resolution. The two tiers serve different consistency guarantees: CRDT = eventual consistency for logic, binary = server-authoritative for physics. When: Any distributed simulation with both collaborative and physics state. Result: Bandwidth-efficient synchronization that scales.

### P.GAPS.10 | Hub Trait Architecture Pattern

Pattern: A "hub" trait owns a blackboard state and multiple "consumer" traits read from it. Example: @weather -> [@clouds, @god_rays, @physics, @particles, @cloth, @fluid, @erosion]. Why: Ensures environmental coherence (all systems respond to same weather state). Avoids trait-to-trait coupling (consumers only depend on hub, not each other). When: Multiple traits need shared driving state. Result: Coherent world behavior with minimal coupling.

### G.GAPS.07 | CRDT for Particle Physics Sync Anti-Pattern

Symptom: Bandwidth exceeds available network capacity when syncing physics particles via CRDT.
Cause: CRDT metadata (version vectors, timestamps, tombstones) adds 20-40 bytes per entry. At 100K particles _ 40 bytes overhead _ 60fps = ~240MB/s -- impossible over WebRTC.
Fix: Use raw binary WebRTC DataChannel for particle positions (12 bytes per particle = ~72MB/s at 100K). Use spatial relevance filtering to only send particles within player's view (reduces to ~7MB/s at 10K relevant particles).
Prevention: Never use CRDTs for high-frequency ephemeral simulation state. Reserve CRDTs for collaborative logic state that changes infrequently.
