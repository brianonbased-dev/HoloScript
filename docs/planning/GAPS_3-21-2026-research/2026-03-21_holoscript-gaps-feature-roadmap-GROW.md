# Research GROW: HoloScript GAPS Feature Roadmap -- Cross-Domain Relationships

**Date**: 2026-03-21
**Phase**: 4 GROW
**Parent**: 2026-03-21_holoscript-gaps-feature-roadmap.md

## Cross-Domain Relationship Map

### Relationship 1: Unified Particle Physics x CRDT State Sync x Persistence = "Living World" Architecture

The most profound connection across the 10 GAPS categories is that physics, persistence, and multiplayer are NOT three separate problems. They are one problem: **distributed simulation of a continuous physical world.**

If HoloScript adopts Unified Particle Physics (PBD solver with everything-as-particles), then the world state IS a particle buffer. CRDT synchronization of that particle buffer IS multiplayer. Persisting that particle buffer IS world persistence. Time-progression IS running the solver on the server when players are offline.

**Architecture insight:** A single `WorldStateBuffer` backed by Loro CRDT, containing all particles (fluid, cloth, rigid, crowd agents), synchronized via P2P WebRTC with server authority for physics "global rules" (gravity, collisions), persisted to Railway volume snapshots.

This unifies GAPS categories 1, 3, and 4 into a single engineering artifact.

**New question:** Can Loro CRDT efficiently sync a large particle buffer (100K+ entries) at 60fps? Or does the CRDT overhead require a different approach (e.g., CRDT for high-level state, raw WebRTC DataChannel for particle positions)?

### Relationship 2: Quality Tiers x Compiler Optimization x Trait Resolution = "Adaptive Compilation"

The performance optimization problem (GAPS #7) is actually a compiler problem. HoloScript's unique advantage is that the compiler can generate different code for different targets. This means quality tiers aren't runtime feature flags -- they're compile-time code paths.

The compiler should generate:

- **Quest 3 tier**: MLS-MPM at 50K particles, half-res SSFR, no volumetrics, mesh-based hair, SSR instead of ray tracing, LOD-aggressive meshes
- **Desktop tier**: MLS-MPM at 200K particles, full-res SSFR, volumetric clouds, screen-space god rays, hybrid ray tracing, full-detail meshes
- **Vision Pro tier**: Desktop + eye-tracked foveated rendering + RealityKit passthrough bridge

This connects trait resolution (from the previous research cycle's TODO-GAP-005/006) directly to performance: @fluid on Quest 3 compiles to a completely different compute shader than @fluid on desktop.

**New question:** Should the compiler generate separate WGSL shaders per tier, or a single shader with dynamic branching? Separate shaders = faster but larger binary. Dynamic branching = smaller binary but branch divergence cost.

### Relationship 3: Agentic NPCs x Economy x Social Layer = "Emergent Metaverse Economy"

The three features that make Hololand "feel alive" are interconnected:

- **NPCs** run shops, guard areas, tell stories, and create quest content
- **Economy** provides the incentive structure (NPCs price goods via reinforcement learning)
- **Social** layer means NPC economic decisions are influenced by player community behavior

If NPCs use the PPA + RAG architecture with economic learning (reward = profit - risk - reputation damage), and those NPCs participate in the x402/Zora economy layer, then:

- NPC shopkeepers dynamically price items based on supply/demand
- NPC factions form alliances and rivalries based on economic interactions
- Player-created items feed into NPC trading networks
- $BRIAN gas powers NPC reasoning (cost-constrained agency)

This is not just "NPCs in a marketplace" -- it's an emergent economic simulation where AI agents and human players participate in the same economy.

**New question:** Should NPC agents use the same x402 payment rails as human players? This would make the economy truly unified but requires NPC wallet management at scale.

### Relationship 4: Volumetric Rendering x Weather x Physics = "Environmental Coherence"

The GAPS doc asks for "dynamic day-night + weather that affects physics." This is a rendering + simulation coherence problem:

- @weather trait drives: cloud density (volumetric rendering), light angle (day-night), precipitation (particle system), wind vector (force field)
- @physics receives from @weather: surface friction coefficient (wet = lower), wind force vector (cloth/particles), temperature (affects fluid viscosity)
- @volumetric_clouds reads from @weather: density field, sun position, wind direction
- @god_rays reads from @weather: sun position, atmospheric density

All four systems share the same @weather state. This means @weather is not a rendering trait -- it's a world simulation trait that drives both rendering and physics simultaneously.

**Architecture insight:** @weather should own a blackboard state (wind_vector, precipitation, temperature, sun_position, cloud_density) that other traits read as inputs. The trait dependency graph becomes: @weather -> [@volumetric_clouds, @god_rays, @physics, @particle_system, @cloth, @fluid].

### Relationship 5: Studio Publishing x CRDT Persistence x Economy = "Creator-to-Earner Pipeline"

The publishing pipeline (GAPS #8) connects to persistence and economy:

1. Creator builds world in Studio (native HoloScript compositions)
2. Publishes to Hololand (CRDT state snapshot uploaded to Railway)
3. Auto-mint creates on-chain world NFT (Zora SDK)
4. World earns revenue via: token-gated entry, in-world purchases, remix royalties
5. Creator iterates via live preview (WebSocket state sync from Studio)
6. Version history via Loro CRDT snapshots (time-travel for rollback)

The entire pipeline is: Create -> Persist (CRDT) -> Mint (Zora) -> Earn (x402) -> Iterate (live preview) -> Version (Loro snapshots).

Each component exists. The work is wiring them into a seamless flow.

### Relationship 6: Device Support x Quality Tiers x Crowd Simulation = "Adaptive Agent Density"

The crowd simulation research reveals that agent count directly trades off with visual quality:

- Quest 3: 500-1K crowd agents with simple mesh rendering, 50K triangle budget
- Desktop: 5K-10K crowd agents with detailed models, 300K triangle budget
- Vision Pro: 2K crowd agents but with high-fidelity avatar rendering

This means @crowd_sim should be a quality-tier-aware trait that adjusts agent count based on device capabilities. The same world composition specifies "fill this area with a crowd" and the compiler generates the appropriate agent count per tier.

**Architecture insight:** Trait parameters should support tier-qualified values: `agents: { low: 500, med: 2000, high: 10000 }`.

### Relationship 7: Previous Research Cycle (Transparency) x This Cycle (Features) = "Documentation-Driven Feature Development"

The previous research cycle (2026-03-20) established that documentation should precede feature development. This cycle identifies the specific features to build. The connection:

For each GAPS feature, the development sequence should be:

1. **Spec first** (trait API design document)
2. **Test trait composition** (native @test block)
3. **Implement** (compute shader + runtime)
4. **Document** (trait mapping table update, per TODO-GAP-006)
5. **Demo** (composition showing the trait in action)

This means the GAPS feature roadmap should produce 10 spec documents before writing any compute shader code. The specs become both the documentation artifacts (previous cycle's recommendation) AND the implementation specifications.

## New Research Questions Generated

1. **CRDT particle buffer sync bandwidth**: What is the bandwidth cost of syncing a 100K particle buffer at 60fps via Loro CRDT? Is delta-only state transfer sufficient, or does HoloScript need a custom binary protocol for particle positions?

2. **Separate vs dynamic shader branching for quality tiers**: Should the compiler emit separate WGSL shaders per device tier, or use a single shader with `if(tier >= HIGH)` branches? What's the GPU divergence cost on Quest 3's Adreno?

3. **NPC agent wallet management at scale**: If NPCs use x402 payment rails, how many Ed25519 keypairs can a single server manage? What's the signing throughput? Is there a wallet aggregation pattern?

4. **Weather-to-physics coupling latency**: If @weather state changes (rain starts), how quickly must @physics update surface friction? Is per-frame adequate, or does the transition need interpolation over multiple frames?

5. **Loro snapshot size for world persistence**: What is the snapshot size for a world with 10K objects, 100K particles, and 50 NPC memory stores? Does this fit in Railway's volume pricing?

6. **WebGPU compute shader limits on Quest 3**: What are the actual dispatch limits, shared memory size, and workgroup constraints on Quest 3's Adreno GPU for compute shaders?

7. **Foveated rendering integration**: Can HoloScript's @volumetric_clouds trait leverage eye-tracking data from Vision Pro to reduce raymarching samples outside foveal region?

8. **EU AI Act compliance for NPC agents**: What specific technical requirements does Article 50-52 impose on AI NPCs in virtual worlds? Is a "this is an AI" label sufficient, or are there behavioral constraints?

## Growth Vector Priority

| Priority | Vector                                    | Impact                              | Effort      | Dependencies              |
| -------- | ----------------------------------------- | ----------------------------------- | ----------- | ------------------------- |
| 1        | Unified particle buffer architecture spec | Highest (unifies 3 GAPS categories) | 1 week spec | None                      |
| 2        | Quality-tier conditional compilation      | High (enables all device support)   | 2 weeks     | Compiler trait resolution |
| 3        | @weather as world simulation hub trait    | High (environmental coherence)      | 1 week      | Blackboard integration    |
| 4        | Creator-to-earner publishing pipeline     | Very High (business model)          | 2 weeks     | Loro + Zora SDK           |
| 5        | PPA + RAG @ai_companion trait             | High (world liveness)               | 2 weeks     | Vector memory integration |
| 6        | Adaptive agent density per tier           | Medium-High (visual impact)         | 1 week      | Quality tiers + crowd sim |
| 7        | Spec-first development workflow           | Medium (quality multiplier)         | Ongoing     | None                      |

## Cross-Cycle Integration with Previous Research (2026-03-20)

The previous cycle produced 12 TODOs (TODO-GAP-001 through TODO-GAP-012). MEMORY.md confirms 3 were completed:

- W.145: Architecture diagram (docs/architecture.mmd) -- DONE
- W.146: Backend audit (docs/backends.md, 27 verified backends) -- DONE
- W.147: .well-known/mcp endpoint -- DONE

Remaining 9 TODOs from previous cycle should be integrated with this cycle's feature roadmap. Specifically:

- TODO-GAP-004 (MCP 3-layer spec) feeds into the persistence/multiplayer architecture
- TODO-GAP-006 (trait coverage CLI) feeds into quality-tier compilation
- TODO-GAP-007 (Smart Farm Twin) is a non-VR demo that showcases @iot_sensor + @ai_agent
- TODO-GAP-008 (x402 marketplace) feeds into the economy layer

The two research cycles converge: documentation (cycle 1) + features (cycle 2) = a documented, implementable roadmap.
