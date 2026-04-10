# Research AUTONOMIZE: HoloScript GAPS Feature Roadmap -- Self-Perpetuating Directives

**Date**: 2026-03-21
**Phase**: 7 AUTONOMIZE
**Parent**: 2026-03-21_holoscript-gaps-feature-roadmap.md

## CEO-Level Summary

The GAPS_3-21-2026 planning document identifies 10 categories of upgrades needed to make Hololand a "truly great metaverse." This research cycle validates that **every category is technically feasible with current WebGPU compute shader technology and existing open-source libraries**. The core technologies are proven:

- **MLS-MPM fluid simulation**: 100K-300K particles in real-time on consumer GPUs
- **Position-Based Dynamics**: Unified solver for cloth, fluid, rigid, destruction in one framework
- **Loro CRDT v1.8**: Rust/WASM collaborative state with time-travel, actively maintained
- **PPA + RAG NPC architecture**: Industry standard in 2026, maps directly to HoloScript's @ai_agent + @behavior_tree
- **WebRTC spatial voice + viseme lip-sync**: Production-ready in browsers (Second Life shipped WebRTC voice March 18, 2026)

**The critical insight from re-intake**: The 10 GAPS categories collapse into 3 architectural pillars with heavy overlap. Naive individual implementation would take 24-34 weeks. With proper dependency ordering and shared infrastructure (PBD solver serves 4 traits, @weather hub drives 7 consumers, Loro CRDT serves 3 use cases), the total is **14-18 weeks**.

**The single most impactful architectural decision**: Adopt Two-Tier State Synchronization (W.156) -- CRDT for collaborative logic state, raw binary for physics particles. Getting this wrong (using CRDT for everything) would make multiplayer physics impossible at scale.

**Previous cycle integration**: The documentation/transparency cycle (2026-03-20) produced 3 completed artifacts (architecture diagram, backend audit, .well-known endpoint) and 9 outstanding TODOs. This feature cycle should execute in parallel with the remaining documentation TODOs, with specs-first development ensuring both documentation and implementation advance together.

**Recommended execution**: Start with Pillar A (PBD solver + @fluid + @weather) because it produces the most visible result ("water that looks real") and the PBD solver is the foundation for 4 other traits. Pillar B (CRDT + WebRTC) in parallel because it has no dependency on Pillar A. Pillar C (NPCs + economy) after Pillars A+B provide the infrastructure.

## Autonomous TODOs

### TODO-FEAT-001: PBD Unified Solver Package [IMMEDIATE - Week 1-2]

- **What**: Create `@holoscript/pbd-solver` package with Jacobi solver in WGSL compute shaders
- **Why**: Foundation for @fluid, @soft_body_pro, @destruction, @crowd_sim, and @cloth -- single implementation serves 5 traits
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: Particle buffer architecture, constraint types (distance, bending, density, collision), separate compute shader kernel per constraint, GPU readback for CPU-side logic
- **Reference**: InteractiveComputerGraphics/PositionBasedDynamics (MIT license)
- **Spec first**: Write `docs/specs/pbd-solver.md` before implementation
- **Expiry**: 14 days

### TODO-FEAT-002: MLS-MPM @fluid Trait [IMMEDIATE - Week 2-3]

- **What**: Implement @fluid trait using MLS-MPM algorithm with SSFR rendering
- **Why**: Physics realism is the #1 make-or-break feature per GAPS doc; "turns Hololand from floaty demo into feels real"
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: P2G/G2P compute shaders using atomicAdd, SSFR pipeline (depth, thickness, bilateral filter, normals, refraction), half-resolution by default with `resolution_scale` parameter
- **Reference**: matsuoka-601/WebGPU-Ocean
- **Dependency**: TODO-FEAT-001 (PBD solver for particle buffer)
- **Test target**: 100K particles, 60fps on iGPU
- **Expiry**: 21 days

### TODO-FEAT-003: Loro CRDT World State Integration [IMMEDIATE - Week 1-2]

- **What**: Integrate Loro CRDT v1.8+ for persistent world state with MV-Transformer spatial pattern
- **Why**: Foundation for persistence, multiplayer, and publishing pipeline -- serves 3 GAPS categories
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: Loro Rust/WASM binding, state model (LWW Map for objects, List for terrain heightmap, Tree for NPC memory), MV-Transformer for rotation (state-based, LWW), Railway persistent volume for snapshots
- **Reference**: ArXiv 2503.17826 for MV-Transformer pattern, Loro docs for API
- **CRITICAL**: Do NOT use Loro for physics particle sync -- use raw binary WebRTC (see W.156)
- **Test target**: 10K objects, 2 clients, <100ms convergence
- **Expiry**: 14 days

### TODO-FEAT-004: @weather Hub Trait [WEEK 2-3]

- **What**: Implement @weather as world simulation hub owning blackboard state consumed by 7 traits
- **Why**: Environmental coherence -- rain affects physics, clouds affect lighting, wind affects cloth
- **Agent**: `/holoscript`
- **Effort**: 1 week
- **Impl path**: Blackboard state (wind_vector, precipitation, temperature, sun_position, cloud_density), trait dependency declaration, day-night cycle via sun_position progression, @erosion writes terrain heightmap changes to Loro CRDT
- **Dependencies**: TODO-FEAT-001 (PBD solver), TODO-FEAT-003 (Loro CRDT for persistent erosion)
- **Expiry**: 21 days

### TODO-FEAT-005: WebRTC Physics Sync Protocol [WEEK 2-4]

- **What**: Binary WebRTC DataChannel protocol for physics particle synchronization
- **Why**: Multiplayer physics -- two players see the same water, cloth, and rigid bodies interacting
- **Agent**: `/hololand`
- **Effort**: 2 weeks
- **Impl path**: Binary message format (particle_id: u32, pos: vec3<f32>, vel: vec3<f32> = 28 bytes/particle), spatial relevance filtering (only sync within player's radius), server-authoritative collision resolution daemon
- **CRITICAL**: NOT CRDT. Raw binary. Server validates. See G.GAPS.07 anti-pattern.
- **Dependency**: TODO-FEAT-003 (Loro CRDT for object ownership layer)
- **Test target**: 2 players, 50K particles, <50ms P2P latency
- **Expiry**: 28 days

### TODO-FEAT-006: @volumetric_clouds + @god_rays [WEEK 3-5]

- **What**: Volumetric cloud raymarcher and screen-space god ray post-processor as separate traits
- **Why**: Visual fidelity that makes worlds "photoreal enough for people to want to live in them"
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: @volumetric_clouds: raymarching with Beer-Lambert absorption, Henyey-Greenstein phase function, light marching, reads from @weather blackboard. @god_rays: screen-space volumetric light scattering post-process (GPU Gems Ch.13). Quality tier: disabled on Low, basic on Med, full on High/Ultra.
- **Reference**: CK42BB/procedural-clouds-threejs
- **Dependency**: TODO-FEAT-004 (@weather hub)
- **Expiry**: 35 days

### TODO-FEAT-007: Quality-Tier Conditional Compilation [WEEK 4-6]

- **What**: Add `--tier` flag to compiler, generate per-device asset bundles and WGSL shaders
- **Why**: Single .holo source must run on Quest 3 (50K triangles, 90fps) AND desktop (300K triangles, 120fps)
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: Tier config objects, per-tier WGSL shader output (separate files, not dynamic branching), KTX2 texture compression pass, LOD mesh generation pass, draw call batching pass, device detection via WebXR API at runtime
- **Dependencies**: TODO-FEAT-001, TODO-FEAT-002, TODO-FEAT-006
- **Test target**: Same .holo compiles to Quest 3 (90fps) and desktop (120fps)
- **Expiry**: 42 days

### TODO-FEAT-008: @ai_companion Trait (PPA + RAG + SNN Hybrid) [WEEK 5-8]

- **What**: Persistent AI companion trait with hybrid SNN+LLM inference, vector memory, and social graph
- **Why**: "Worlds feel alive even when no humans are online" -- the GAPS #6 priority
- **Agent**: `/holoscript`
- **Effort**: 3 weeks
- **Impl path**: PPA loop (perception -> plan -> action cycle), Qdrant Edge or SQLite-vec for vector memory, local 3B-8B quantized LLM for dialogue, @snn (W.058) for reflex decisions (<1ms), social graph with weighted affinity and gossip propagation, NPC speech path (LLM text -> TTS -> viseme -> lip animation)
- **Dependencies**: @behavior_tree (existing), @snn (W.058), @lip_sync (from TODO-FEAT-009)
- **Test target**: 10 NPCs, persistent memory across sessions, emergent faction behavior
- **Expiry**: 56 days

### TODO-FEAT-009: @spatial_voice + @lip_sync [WEEK 5-7]

- **What**: WebRTC spatial voice with proximity attenuation and viseme-based lip-sync
- **Why**: Social immersion -- "hear people and see their mouths move"
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: @spatial_voice: WebRTC voice channels with HRTF spatialization, proximity volume curve. @lip_sync: WebAudio API frequency extraction -> ARKit viseme blend shape mapping -> avatar morph targets. Integration with @ai_companion for NPC speech visualization.
- **Reference**: met4citizen/TalkingHead, Wawa-lipsync
- **Dependency**: TODO-FEAT-005 (WebRTC infrastructure)
- **Expiry**: 49 days

### TODO-FEAT-010: Economy Layer (@token_gated + Zora + Publishing) [WEEK 8-10]

- **What**: On-chain minting, token gating, one-click publish, and in-world trading
- **Why**: "Creators actually earn real money -> viral growth"
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: @token_gated trait (wallet connect, NFT ownership check), Zora SDK integration for world minting on Zora Network L2, one-click Studio publish (Loro snapshot + CDN upload + Zora mint + Hololand registry), dynamic royalties for remixes, x402 in-world trading with $BRIAN gas
- **Dependencies**: TODO-FEAT-003 (Loro CRDT for versioning/rollback), Ed25519 (W.097)
- **Expiry**: 70 days

### TODO-FEAT-011: Soft Body + Destruction + Terrain [WEEK 8-10]

- **What**: @soft_body_pro, @destruction, @deformable_terrain traits using PBD solver
- **Why**: Physics variety beyond fluids -- tearing, fracture, erosion
- **Agent**: `/holoscript`
- **Effort**: 2 weeks
- **Impl path**: @soft_body_pro: PBD deformation constraints with parametric tearing. @destruction: fracture modes (Breaking Good algorithm), debris -> particle buffer. @deformable_terrain: GPU hydraulic erosion driven by @weather, writes heightmap changes to Loro CRDT for persistence.
- **Dependencies**: TODO-FEAT-001 (PBD solver), TODO-FEAT-004 (@weather), TODO-FEAT-003 (Loro CRDT)
- **Expiry**: 70 days

### TODO-FEAT-012: @crowd_sim Trait [WEEK 7-8]

- **What**: GPU-accelerated crowd simulation with spatial hash grid for 10K+ agents
- **Why**: Populated worlds with realistic crowd behavior
- **Agent**: `/holoscript`
- **Effort**: 1 week
- **Impl path**: Spatial hash grid + bitonic sort for neighbor search, position-based collision avoidance (short-range + long-range + tangential), integrates with PBD solver particle buffer, quality-tier-aware agent count (500 Low, 2000 Med, 10000 High)
- **Reference**: wayne-wu/webgpu-crowd-simulation
- **Dependencies**: TODO-FEAT-001 (PBD solver), TODO-FEAT-007 (quality tiers)
- **Expiry**: 56 days

### TODO-FEAT-013: @moderation + @anti_grief [WEEK 10-11]

- **What**: AI-powered content moderation and anti-griefing traits
- **Why**: "Keeps Hololand welcoming at scale"
- **Agent**: `/holoscript`
- **Effort**: 1 week
- **Impl path**: @moderation: OpenAI Moderation API or Perspective API for text/chat, 3D model NSFW scanning on world entry. @anti_grief: behavioral detection (rapid movement, object throwing, avatar collision patterns). Permission layers: world owner -> moderator -> trusted -> default -> restricted. Integrated with @token_gated for tiered economic-safety access.
- **Dependency**: TODO-FEAT-010 (@token_gated for permission integration)
- **Expiry**: 77 days

### TODO-FEAT-014: Quest PWA + visionOS + Tauri Desktop [WEEK 10-14]

- **What**: Platform-specific packaging and performance validation
- **Why**: "Works perfectly everywhere"
- **Agent**: `/frontend`
- **Effort**: 3 weeks (parallel: 1 week Quest, 1 week visionOS, 1 week Tauri)
- **Impl path**: Quest: PWA manifest with immersive-mode launch, Bubblewrap APK. visionOS: WebXR in Safari with transient-pointer input. Tauri v2: multi-window + system tray for background AI agents. Mobile AR: service worker offline caching.
- **Dependency**: TODO-FEAT-007 (quality tiers)
- **Expiry**: 98 days

## Skill Invocation Commands

### Phase 1: Foundation (Weeks 1-4)

```
/holoscript "Create @holoscript/pbd-solver package implementing Position-Based Dynamics with Jacobi solver in WGSL compute shaders. Single particle buffer architecture where all physics entities (fluid, cloth, rigid, crowd) are particles. Constraint types: distance (rigid), bending (cloth), density (fluid), collision (crowd). Each constraint type is a separate compute shader kernel writing to the same particle buffer. Test target: 500K particles, >30 FPS on discrete GPU. Write spec to docs/specs/pbd-solver.md FIRST, then implement. Reference: InteractiveComputerGraphics/PositionBasedDynamics (MIT license)."
```

```
/holoscript "Implement @fluid trait using MLS-MPM algorithm atop the PBD solver particle buffer. P2G and G2P stages using WebGPU atomicAdd in compute shaders. Screen-Space Fluid Rendering (SSFR) pipeline: depth render, thickness map, bilateral filter, normal computation, final shade with refraction. Default to half-resolution SSFR with resolution_scale parameter. Trait API: @fluid { type: liquid|gas, particle_count: number, viscosity: number }. Test: 100K particles, 60fps on integrated GPU. Reference: matsuoka-601/WebGPU-Ocean."
```

```
/holoscript "Integrate Loro CRDT v1.8+ for persistent world state. State model: LWW Map for objects, List for terrain heightmap, Tree for NPC memory, Map for inventory. Implement MV-Transformer pattern for spatial state: state-based CRDT with LWW for rotation (non-commutative), offset-based for position. Railway persistent volume for snapshot storage. CRITICAL: Do NOT use Loro for physics particle sync -- that uses raw binary WebRTC (separate implementation). Test: 10K objects sync between 2 clients with <100ms convergence."
```

```
/holoscript "Implement @weather as a world simulation hub trait. Owns blackboard state: wind_vector (vec3), precipitation (0-1), temperature (float), sun_position (vec3), cloud_density (0-1). Day-night cycle via sun_position progression. Declare trait dependency so @volumetric_clouds, @god_rays, @physics, @particle_system, @cloth, @fluid, and @erosion all read from @weather blackboard. @erosion writes terrain heightmap changes to Loro CRDT for persistent world evolution. Test: @weather changes propagate to all consumer traits within one frame."
```

```
/hololand "Implement binary WebRTC DataChannel protocol for physics particle synchronization. Message format: particle_id (u32) + position (vec3<f32>) + velocity (vec3<f32>) = 28 bytes per particle. Spatial relevance filtering: only send particles within player's view radius. Server-authoritative collision resolution daemon validates physics global rules (gravity, collisions). NOT CRDT -- raw binary, server validates disagreements. Test: 2 players, 50K particles, <50ms P2P latency."
```

### Phase 2: Experience Layer (Weeks 5-8)

```
/holoscript "Implement @volumetric_clouds trait using raymarching with Beer-Lambert absorption, Henyey-Greenstein phase function, and light marching for self-shadowing. Reads cloud_density and sun_position from @weather blackboard. Implement @god_rays as separate screen-space post-process trait using GPU Gems Chapter 13 volumetric light scattering algorithm. Both traits respect quality tiers: disabled on Low, basic on Med, full on High/Ultra. Reference: CK42BB/procedural-clouds-threejs. Test: 60fps on desktop at 1080p with full volumetric clouds."
```

```
/holoscript "Add --tier <low|med|high|ultra> flag to holoscript compile command. Tier definitions: low={triangles:50000, volumetrics:false, particles:10000}, med={triangles:100000, volumetrics:basic, particles:50000}, high={triangles:300000, volumetrics:true, particles:200000}, ultra={triangles:1000000, raytracing:true, particles:300000}. Generate SEPARATE WGSL shader files per tier (not dynamic branching -- avoids Quest 3 Adreno divergence cost). Add KTX2 texture compression, LOD mesh generation, and draw call batching as compiler passes. Test: same .holo compiles to Quest 3 (90fps) and desktop (120fps)."
```

```
/holoscript "Implement @ai_companion trait with hybrid SNN+LLM inference. PPA loop: perception (observe nearby entities + retrieve from vector memory), planning (local 3B-8B quantized LLM generates action plan), action (execute via @behavior_tree, update vector memory). Use @snn (W.058, WGSL, 10K neurons, 1.1ms) for reflex decisions (fight/flee/trade) -- GPU sub-millisecond. Reserve LLM for dialogue only (<100ms on NPU). Social graph: weighted affinity between NPCs, gossip propagation for emergent factions. NPC speech: LLM text -> browser TTS -> WebAudio -> viseme -> @lip_sync. Test: 10 NPCs with persistent memory across sessions."
```

```
/holoscript "Implement @spatial_voice trait using WebRTC voice channels with HRTF spatialization and proximity volume attenuation curve. Implement @lip_sync trait using WebAudio API frequency extraction mapped to ARKit viseme blend shapes on 3D avatar morph targets. Integration: @spatial_voice feeds audio stream to @lip_sync on remote player avatars. Also integrate with @ai_companion for NPC lip-synced speech. Reference: met4citizen/TalkingHead, Wawa-lipsync. Test: 10-player room with spatial voice and visible lip-sync, <200ms audio-to-visual latency."
```

### Phase 3: Economy + Polish (Weeks 9-14)

```
/holoscript "Implement @token_gated trait that checks wallet connection + NFT ownership before allowing entry to world areas. Integrate Zora SDK for one-click world minting on Zora Network L2 with dynamic royalties for remixes. Wire into Studio one-click publish flow: compile + Loro snapshot + CDN asset upload + Zora mint + Hololand registry entry. Versioning via Loro checkpoints, rollback via snapshot restore. x402 in-world trading with $BRIAN gas for agent actions. Test: token-gated room requiring Zora NFT, one-click publish from Studio, version rollback."
```

```
/holoscript "Implement @soft_body_pro (PBD deformation with parametric tearing), @destruction (fracture modes from Breaking Good algorithm, debris feeds particle buffer), and @deformable_terrain (GPU hydraulic erosion driven by @weather precipitation and wind). @erosion writes terrain heightmap changes to Loro CRDT for persistence -- rain permanently erodes terrain over time even when players offline. Test: rain erodes terrain, changes persist across sessions, soft body tears under force, rigid object shatters on impact."
```

```
/holoscript "Implement @crowd_sim trait using spatial hash grid + bitonic sort for GPU neighbor search. Position-based collision avoidance with three constraint types: short-range penetration prevention, long-range predictive collision, tangential dense-crowd flow. Quality-tier-aware agent count: low=500, med=2000, high=10000. Integrates with PBD solver particle buffer. Reference: wayne-wu/webgpu-crowd-simulation. Test: 10K agents at 60fps on discrete GPU with spatial hash grid enabled."
```

```
/frontend "Create Quest 3 PWA package with immersive-mode launch manifest (no 2D landing page). Generate Bubblewrap APK for Horizon Store submission. Create visionOS WebXR configuration for Safari with transient-pointer input mode. Create Tauri v2 desktop app with multi-window support and system tray for background AI agents. Automated 90fps performance validation test for Quest 3 target. Test: same Hololand world accessible on Quest 3 PWA, Vision Pro Safari, Tauri desktop, and mobile browser."
```

## Follow-Up Research Cycles

1. **CRDT Particle Sync Bandwidth Analysis**: Measure actual bandwidth cost of spatial-relevance-filtered binary particle sync at various player counts (2, 10, 50, 100). Determine the practical player-count ceiling for physics-heavy worlds.

2. **Quest 3 Adreno Compute Shader Profiling**: Profile actual dispatch limits, shared memory size, workgroup constraints, and compute shader execution time on Quest 3's Adreno 740 GPU. Validate whether MLS-MPM can run within the thermal/power envelope.

3. **Local LLM Inference Benchmarking**: Benchmark 3B-8B quantized models (Llama, Phi, Gemma) on consumer NPUs (Snapdragon, Apple Neural Engine, Intel Arc). Determine realistic NPC dialogue latency per platform.

4. **Zora SDK Integration Feasibility**: Evaluate Zora SDK's TypeScript API for world minting use case. Determine gas costs, minting flow, and dynamic royalty enforcement for scene NFTs.

5. **Hytale Node Editor Pattern Study**: Research Hytale's visual node editor for procedural world generation. Determine if this pattern can be adapted for HoloScript Studio's trait composition editor.

6. **EU AI Act NPC Compliance Deep Dive**: Research Article 50-52 requirements for AI-generated content in virtual worlds. Determine minimum compliance requirements for NPC disclosure and provenance tagging.

7. **Server-Side World Simulation Daemon**: Design the server-side daemon that runs physics + weather + erosion + NPC behavior when no players are online. Determine Railway hosting costs for always-on world simulation.

## Dependency Graph (Mermaid)

```mermaid
graph TD
    FEAT001[PBD Solver] --> FEAT002[@fluid MLS-MPM]
    FEAT001 --> FEAT004[@weather Hub]
    FEAT001 --> FEAT011[Soft Body + Destruction]
    FEAT001 --> FEAT012[@crowd_sim]
    FEAT003[Loro CRDT] --> FEAT004
    FEAT003 --> FEAT005[WebRTC Physics Sync]
    FEAT003 --> FEAT010[Economy + Publishing]
    FEAT003 --> FEAT011
    FEAT004 --> FEAT006[@volumetric_clouds + @god_rays]
    FEAT004 --> FEAT011
    FEAT002 --> FEAT007[Quality Tiers]
    FEAT006 --> FEAT007
    FEAT005 --> FEAT009[@spatial_voice + @lip_sync]
    FEAT009 --> FEAT008[@ai_companion PPA+RAG]
    FEAT007 --> FEAT012
    FEAT007 --> FEAT014[Quest + visionOS + Tauri]
    FEAT010 --> FEAT013[@moderation + @anti_grief]
```
