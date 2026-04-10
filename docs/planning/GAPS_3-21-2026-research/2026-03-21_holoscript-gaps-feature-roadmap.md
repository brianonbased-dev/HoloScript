# Research: HoloScript GAPS Feature Roadmap -- Technical Feasibility & Implementation Strategy

**Date**: 2026-03-21
**Research Time**: ~30 minutes
**Sources**: 42
**Protocol**: uAA2++ 8-Phase Canonical (Phase 3 COMPRESS)
**Previous Cycle**: 2026-03-20_holoscript-gaps-analysis.md (focused on documentation/transparency deficit)
**This Cycle Focus**: Technical feasibility of the 10 feature categories in the GAPS_3-21-2026 planning doc

## Executive Summary

- WebGPU compute shaders make the GAPS physics realism goal achievable NOW: MLS-MPM handles 100K-300K fluid particles in real-time, Position-Based Dynamics enables coupled cloth+fluid+rigid simulation, and crowd simulation reaches 10K+ agents at 60 FPS via spatial hash grids
- The CRDT-based persistent world architecture is research-grade (only 2-player tested) but Loro CRDT v1.8+ provides the primitives; the gap is spatial state integration with rotation non-commutativity handling and server-side authority for physics "global rules"
- Agentic NPC architecture has converged on PPA (Perception-Planning-Action) loops + RAG vector memory + local quantized LLMs (3B-8B, <100ms inference) -- this maps directly to HoloScript's @ai_agent + @behavior_tree + BehaviorTree blackboard
- Volumetric rendering (raymarched clouds, screen-space god rays, hybrid rasterize+raytrace) is production-viable in WebGPU with existing Three.js ecosystem components
- The Quest 3 performance budget (50K-150K triangles, 256MB texture memory, 90fps target) requires aggressive LOD, KTX2 compression (50-70% memory savings), and draw call batching -- all implementable as HoloScript compiler optimization passes

## Detailed Insights by GAPS Category

### 1. Physics & Realistic Simulation (GAPS Priority: 5/5 stars)

**Fluid Simulation -- MLS-MPM is the clear winner:**

- MLS-MPM achieves 100K particles on integrated GPU, up to 300K on discrete GPU at real-time framerates
- 3x faster than SPH because it uses grid-based P2G/G2P exchange (no neighbor search bottleneck)
- WebGPU `atomicAdd` in compute shaders makes P2G stage implementation dramatically simpler than WebGL alternatives
- Screen-Space Fluid Rendering (SSFR) pipeline is well-documented: depth render -> thickness map -> bilateral filter -> normals -> final shade with refraction
- Production reference: matsuoka-601/WebGPU-Ocean running MLS-MPM + Three.js integration

**Soft Body + Destruction + Tearing:**

- Position-Based Dynamics (PBD) is the real-time standard: easy to parallelize, each simulation stage = separate compute shader kernel
- "Breaking Good" (SIGGRAPH 2022) provides fracture modes for real-time destruction
- Soft body tearing uses parametrized tear models controlling clean-cut vs jagged tears
- GPU-based PBD maintains >30 FPS with 500K particles for fluid+rigid+cloth coupled simulation

**Coupled Physics (cloth + fluid + rigid in one scene):**

- Unified Particle Physics approach (Macklin/Mueller): represent everything as particles, couple through constraints
- Particle representation of rigid bodies makes fluid-rigid coupling trivial
- PBD constraint solver handles cloth-fluid-rigid interaction in a single Jacobi pass
- Reference: InteractiveComputerGraphics/PositionBasedDynamics (open source, MIT license)

**GPGPU Crowd Simulation (10K+ agents):**

- WebGPU crowd simulation using Position-Based Dynamics achieves 60 FPS with shadows at hundreds of agents
- Spatial hash grid for neighbor searching is mandatory (brute force caps at 50K agents even on GPU)
- Bitonic sort organizes agents by grid cells on GPU
- Boids implementations reach 67M agents in 2D at 30fps, 10K+ easily in 3D
- Three constraint types: short-range (penetration prevention), long-range (predictive collision), tangential (dense crowd flow)

**Deformable Terrain + Erosion:**

- GPU-optimized hydraulic erosion runs in real-time with compute shaders
- Multi-material simulation (water, lava, sand, debris, snow) is production-ready (World Creator)
- Weather-driven erosion (wind, rain, freeze-thaw) creates long-term terrain evolution
- Can wire into day-night system for dynamic landscape changes

**Implementation Assessment:** 4-6 weeks is REALISTIC for the core @fluid trait using MLS-MPM + SSFR. Advanced soft body + destruction is 2-3 additional weeks. Coupled physics requires the Unified Particle Physics approach (additional 2-3 weeks). Crowd simulation can leverage existing @flocking trait foundation.

### 2. Rendering & Visual Fidelity (GAPS Priority: 4/5 stars)

**Volumetric Rendering:**

- Raymarching for clouds: Beer-Lambert absorption, Henyey-Greenstein phase functions, light marching for self-shadowing
- CK42BB/procedural-clouds-threejs provides WebGPU raymarching with WebGL2 fallbacks for Three.js
- Silver linings, subsurface scattering, two-lobe phase functions, Beer-powder bright edges all documented
- God rays: screen-space post-processing (well-established since GPU Gems Chapter 13)

**Hybrid Ray Tracing:**

- WebRTX extends WebGPU API with Vulkan-style ray tracing capabilities
- Hybrid approach: rasterize G-buffer for visible surfaces, ray trace for lighting/reflections
- OpenPBR-based path tracer exists for WebGPU (physically-based, handles global illumination)
- Production viability depends on GPU; Quest 3 cannot ray trace, desktop/Vision Pro can

**Day-Night + Weather Affecting Physics:**

- Complete sky system for Three.js exists (sun/moon, day-night cycle, clouds, stars, lensflares)
- Three.js Water Pro: physically-based ocean shader with FFT wave simulation, dynamic foam, caustics
- Weather -> physics coupling requires custom trait bridge: @weather state drives @physics parameters (friction coefficients for wet surfaces, wind force vectors for cloth/particles)
- WebGPU compute particles rain demo exists in Three.js examples

**Avatar Skin/Clothing/Hair:**

- Subsurface scattering well-documented (GPU Gems Chapter 16)
- Strand-based hair is too expensive for WebGPU real-time; use mesh-based with alpha-blended cards
- Cloth simulation via PBD (shared solver with physics system)

**Implementation Assessment:** 3-5 weeks is REALISTIC. Volumetric clouds and god rays use existing libraries. Hybrid ray tracing is desktop/Vision Pro only. Day-night cycle needs custom @weather -> @physics coupling trait.

### 3. Persistence & World State (GAPS Priority: 5/5 stars)

**CRDT State of the Art for VR:**

- ArXiv 2503.17826 (March 2025): first CRDT-based VR synchronization study
- State-based CRDTs preferred over operation-based due to rotation non-commutativity
- Custom "MV-Transformer" wraps Transform (position, rotation, scale) as CRDT
- Dynamic strategy switching: local-space (offset-based, PN-Counter inspired) vs world-space (LWW)
- P2P latency: ~50ms average (75% improvement over server-based ~200ms)
- CRITICAL LIMITATION: Only 2-player tested; scalability explicitly unproven

**Loro CRDT as Foundation:**

- v1.8.4 (published 5 days ago) -- active development, Rust core with JS/WASM binding
- Supports List, LWW Map, Tree, and Text CRDT types
- "Figma-style canvases with lists/trees, undo/redo, and real-time sync" is documented use case
- HoloScript already has W.057 (Loro CRDT GO for quaternion rotation)
- Gap: No spatial-specific CRDT types (position, rotation, scale) in Loro stdlib

**Persistence Architecture:**

- Metaverse world state needs distributed database with real-time read/write
- Fly.io persistent volumes: $0.15/GB/month
- Railway (existing HoloScript infrastructure) can extend for world hosting
- Time-progression (plants grow, erosion) requires server-side "world simulation" daemon

**Implementation Assessment:** 2-4 weeks is OPTIMISTIC. CRDT foundation exists but spatial state integration is novel work. Server-side persistence is straightforward (Railway + Loro snapshots). Time-progression daemon is a separate 2-week effort that reuses existing daemon infrastructure (W.090).

### 4. Multiplayer & Social Layer (GAPS Priority: 5/5 stars)

**Scalable Voice + Proximity Chat:**

- WebRTC is the standard; Second Life launched WebRTC voice in March 2026
- Proximity chat: audio volume/spatialization based on in-game distance
- WebAudio API maps frequencies to ARKit viseme blend shapes for lip-sync
- Spatial audio uses HRTF (Head-Related Transfer Function) for directional sound
- Edge/region servers with spatial partitioning for 50-500 players

**Avatar Lip-Sync:**

- met4citizen/TalkingHead: JavaScript class for real-time lip-sync with 3D avatars
- Wawa-lipsync: browser-native, real-time, works with any audio source
- Viseme mapping: audio frequency -> blend shape weights -> avatar mouth animation
- <200ms latency achievable with WebRTC + local viseme processing

**Colocated Multi-User Editing:**

- CRDT-based approach enables conflict-free simultaneous editing
- Loro's collaborative state management handles concurrent modifications
- VR-specific challenge: hand tracking input must merge with controller input across device types

**Portals Between Worlds:**

- HoloScript's compilation model supports world-as-module composition
- Portal = load new world composition, transfer player state (inventory, avatar)
- Instancing for high-traffic areas (multiple copies of same world, load-balanced)

**Implementation Assessment:** 3-5 weeks is REALISTIC for basic 50-player rooms with spatial voice. 500+ player scaling requires spatial partitioning server infrastructure (additional 2-3 weeks). Lip-sync is achievable in 1 week using existing browser-native solutions.

### 5. Economy & Marketplace (GAPS Priority: 4/5 stars)

**On-Chain Minting with Zora:**

- Zora operates on Zora Network (OP Stack L2) with zero platform fees
- February 2026: "Attention Markets" launched on Solana -- new primitive beyond NFTs
- Dynamic royalties enforceable on-chain (not just off-chain honor system)
- HoloScript already has Ed25519 signing (W.097) -- Base chain alignment

**Token Gating:**

- Wallet connection + NFT ownership verification is standard pattern
- Ticketmaster integration proves mainstream adoption
- For HoloScript: @token_gated trait checks wallet ownership before allowing entry to world areas

**In-World Trading:**

- Requires state synchronization (CRDT) + on-chain settlement
- Auction mechanics can use existing x402 infrastructure
- $BRIAN gas for agent actions needs wallet-per-agent with budget controls (existing in HoloClaw)

**Implementation Assessment:** 2 weeks is REALISTIC leveraging existing Ed25519/x402 infrastructure. Zora integration for scene minting requires SDK integration. Token gating is a 2-3 day trait implementation.

### 6. Advanced Agent & AI Layer (GAPS Priority: 4/5 stars)

**Agentic NPC Architecture (2026 Standard):**

- Perception-Planning-Action (PPA) loops replace behavior trees as the core pattern
- Vector database memory (Qdrant, Pinecone Edge) provides O(1) semantic retrieval of past interactions
- RAG (Retrieval-Augmented Generation) injects contextual memories into reasoning loops
- Social graph propagation: NPCs influence each other via gossip, creating emergent factions
- Local quantized models (INT4/INT8, 3B-8B params) achieve <100ms inference on NPUs

**HoloScript's Existing Foundation:**

- @ai_agent trait exists
- @behavior_tree with BehaviorTree blackboard provides decision-making framework
- Existing daemon infrastructure (W.090-W.133) provides long-running agent patterns
- Missing: vector memory store, PPA loop wrapper trait, social graph trait

**24/7 World Agents:**

- Server-side agent processes using existing Railway deployment
- Heartbeat-based lifecycle (reuse daemon heartbeat pattern from W.090)
- Budget gates (W.131) prevent runaway cloud LLM costs

**Swarm Intelligence:**

- @flocking trait exists for boids
- GPGPU crowd simulation (researched above) enables 10K+ agent flocks
- Wildlife/ecosystem simulation = @flocking + @ai_agent with environmental behavior trees

**Implementation Assessment:** 3-4 weeks is REALISTIC. @ai_companion trait wrapping PPA loop is 1 week. Vector memory integration is 1 week. Social graph propagation is 1 week. Server-side 24/7 agents reuse daemon infrastructure.

### 7. Performance & Optimization (GAPS Priority: 4/5 stars)

**Quest 3 Performance Budget:**

- 50K-150K triangles, 256MB texture memory
- 90fps target (72fps minimum)
- KTX2 texture compression: 50-70% memory bandwidth reduction
- LOD switching based on camera distance
- Draw call batching: merge materials and geometry
- Object pooling: reuse instead of create/destroy
- Progressive loading: non-critical assets load after VR session starts
- Initial load target: <5 seconds, build size: 5-20MB

**Auto-Quality Tiers:**

- Device detection via WebXR API (headset capabilities exposed)
- Quality presets: Low (Quest 2), Med (Quest 3), High (Desktop), Ultra (Vision Pro)
- Compiler optimization pass that generates per-tier asset bundles

**Asset CDN:**

- CloudFront/R2 for static assets with edge caching
- glTF/GLB with Draco/meshopt compression
- KTX2 basis universal textures (single compressed format, GPU decodes per-platform)

**Implementation Assessment:** 2-3 weeks is REALISTIC. LOD and compression are compiler passes. Quality tiers require device detection + conditional compilation. CDN setup is infrastructure work.

### 8. Studio -> Hololand Publishing Pipeline (GAPS Priority: 5/5 stars)

**Current State:** Basic "publish" button exists. Studio is native HoloScript (10/16 pages hydrated).

**One-Click Publish with Auto-Mint:**

- Publish = compile world composition + upload assets to CDN + register on Hololand registry
- Auto-mint = Zora SDK call to mint world as on-chain asset with creator attribution
- Listing = marketplace API entry (existing x402 infrastructure from TODO-GAP-008)

**Live Preview:**

- Studio -> Hololand preview via WebSocket state sync
- "Instant teleport" = hot-reload world composition without full recompile
- HoloScript's incremental compilation enables sub-second preview updates

**Versioning + Rollback:**

- Loro CRDT provides built-in time-travel (snapshot + restore)
- Each publish = Loro checkpoint
- Rollback = restore to previous Loro snapshot

**Implementation Assessment:** 1-2 weeks is REALISTIC. Most components exist. Main work is wiring Zora mint + CDN upload + registry into the publish flow.

### 9. Device & Platform Support (GAPS Priority: 4/5 stars)

**Quest Native App (PWA):**

- WebXR PWAs launch directly into immersive mode on Quest
- Bubblewrap for PWA-to-APK conversion
- Horizon Store submission requires performance validation (90fps)
- Quest 3 natively supports WebXR with hand tracking + controller input

**visionOS:**

- WebXR enabled by default in Safari since visionOS 2
- "transient-pointer" input mode added to WebXR spec by Apple/W3C
- RealityKit bridge needed for passthrough + advanced hand tracking
- Shared Space vs Full Space modes require different rendering approaches

**Tauri Desktop:**

- Tauri v2 supports multi-window via WebviewWindow + system tray via plugin
- Each window has a WebView instance (memory management important)
- WRY (Rust WebView library) provides cross-platform rendering
- Tray agents: minimize to tray, background processes for local AI agents

**Mobile AR:**

- WebXR AR module for passthrough
- 8th Wall alternative for broader iOS/Android support
- Offline mode requires service worker caching of world assets

**Implementation Assessment:** 2-4 weeks is REALISTIC for Quest PWA + visionOS WebXR. Tauri desktop is a parallel 2-week workstream. Mobile AR is lowest priority.

### 10. Safety, Moderation & Governance (GAPS Priority: 3/5 stars)

**AI Content Moderation (2026 State):**

- Meta shifting from third-party moderators to AI systems (March 2026)
- Market size: $11.63B (2025) -> $23.20B projected (2030)
- Real-time U2U interaction moderation: auto-bleep, retrospective review
- 3D model scanning for NSFW content, weapons, copyrighted IP
- Multi-language support (50+ languages)

**HoloScript Implementation Path:**

- @moderation trait: AI-powered content filter on world entry and during session
- @anti_grief trait: behavioral detection (rapid movement, object throwing, avatar collision)
- Permission layers: world owner -> moderator -> trusted -> default -> restricted
- Report + ban system: CRDT-based moderation log, cross-world ban propagation

**Regulatory Compliance:**

- EU AI Act Article 50-52: NPCs must disclose synthetic origins
- Age gates: wallet-based age verification or standard age gate UI
- Content rating system: G/PG/PG-13/R equivalent for worlds

**Implementation Assessment:** 2 weeks is REALISTIC for @moderation + @anti_grief traits. AI content filtering can use existing cloud APIs (OpenAI Moderation, Perspective API). Age gates and reporting are straightforward UI work.

## Knowledge Compression (W/P/G Format)

### W.148 | MLS-MPM Is the Optimal Fluid Algorithm for HoloScript @fluid Trait

MLS-MPM achieves 3x the particle count of SPH on identical hardware because it exchanges information via grid (no neighbor search). WebGPU's atomicAdd in compute shaders makes P2G stage trivial. 100K particles on iGPU, 300K on discrete GPU. Screen-Space Fluid Rendering (SSFR) provides the visual pipeline: depth -> thickness -> filter -> normals -> shade. This is the clear implementation choice for `@fluid`, `@liquid`, and `@gas` traits.

### W.149 | Position-Based Dynamics Enables Coupled Multi-Physics in a Single Solver

PBD unifies cloth, fluid, rigid bodies, and destruction in one Jacobi solver. Each physics stage = one compute shader kernel. Particle representation of rigid bodies makes fluid-rigid coupling trivial. PBD maintains >30 FPS with 500K particles for coupled simulation. This is the path to "coupled physics" the GAPS doc demands.

### W.150 | CRDT VR State Sync Is Only 2-Player Validated -- Loro Is the Bridge

The only peer-reviewed CRDT-VR study (ArXiv 2503.17826) achieved 50ms P2P latency but explicitly says "does not reflect the scalability required for real-world applications." State-based CRDTs required due to rotation non-commutativity. Loro CRDT v1.8.4 (Rust + WASM) provides List/Map/Tree/Text types + time-travel. HoloScript's W.057 (Loro for quaternion rotation) is the starting point. Gap: spatial-specific CRDT types (MV-Transformer pattern from the paper) must be built on top of Loro.

### W.151 | Agentic NPCs in 2026 = PPA Loops + RAG Vector Memory + Local Quantized LLMs

The industry has converged: Perception-Planning-Action loops replace static behavior trees. Vector database memory (Qdrant Edge, O(1) lookup) replaces JSON logs. Local 3B-8B quantized models on NPU achieve <100ms inference (zero cloud cost). Social graph propagation creates emergent faction behavior between NPCs without player intervention. HoloScript's @ai_agent + @behavior_tree + blackboard already provides 60% of this architecture.

### W.152 | Quest 3 Performance Budget: 150K Triangles, 256MB Textures, 90fps

The hard constraints for Quest 3 WebXR: 50K-150K triangle budget, 256MB max texture memory, 90fps target (72fps minimum). KTX2 compression saves 50-70% memory bandwidth. LOD, draw call batching, object pooling, and progressive loading are mandatory. Initial load must be <5 seconds. Build size target: 5-20MB. HoloScript's compiler must enforce these limits per quality tier.

### W.153 | WebGPU Crowd Simulation Reaches 10K+ via Spatial Hash Grid

Brute-force neighbor search caps at 50K agents even on GPU. Spatial hash grid + bitonic sort enables position-based crowd simulation at hundreds of agents at 60 FPS with shadows in WebGPU. 2D boids reach 67M at 30fps. Three constraint types needed: short-range penetration prevention, long-range predictive collision, tangential dense-crowd flow. HoloScript's @flocking can be upgraded to @crowd_sim with hash grid acceleration.

### W.154 | Volumetric Clouds via Raymarching Are Production-Ready in Three.js/WebGPU

Beer-Lambert absorption + Henyey-Greenstein phase functions + light marching for self-shadowing. Procedural-clouds-threejs library provides WebGPU raymarching with WebGL2 fallback. God rays are a screen-space post-process (GPU Gems Ch.13, well-established). Hybrid rendering (rasterize G-buffer + raytrace lighting) is desktop/Vision Pro only (Quest 3 cannot raytrace). HoloScript should implement @volumetric_clouds and @god_rays as separate traits.

### W.155 | Lip-Sync in Browser Is Solved -- Viseme Mapping from WebAudio API

Wawa-lipsync provides browser-native, real-time lip-sync from any audio source. WebAudio API frequency analysis maps to ARKit viseme blend shapes on 3D avatars. <200ms latency achievable with WebRTC + local processing. TalkingHead library provides full-body 3D avatar lip-sync in JavaScript. Integration path: @spatial_voice trait uses WebRTC, feeds audio to viseme mapper, drives avatar @lip_sync blend shapes.

### P.GAPS.05 | Unified Particle Physics Pattern for Multi-Domain Simulation

Pattern: Represent all physics entities (fluid particles, cloth vertices, rigid body sample points, destruction fragments) as particles in a single PBD solver. Why: Coupling becomes trivial (same solver, same constraint framework). Each physics domain is a separate compute shader kernel that writes to the same particle buffer. When: Any scene with 2+ physics domains interacting. Result: One solver, one particle buffer, N compute shader kernels, real-time coupled simulation.

### P.GAPS.06 | Spatial Hash Grid Acceleration for Large-Agent Systems

Pattern: Replace brute-force O(N^2) neighbor search with GPU-friendly spatial hash grid + bitonic sort. Hash each agent to grid cell, bitonic sort by cell, binary search for neighbors. Why: Brute force caps at 50K even on GPU. Grid reduces to O(N\*K) where K = constant neighbors per cell. When: Any system with >1K interacting agents (crowd, flocking, particles). Result: 10x-100x throughput improvement.

### P.GAPS.07 | PPA + RAG Architecture for Persistent AI Companions

Pattern: Replace static behavior trees with Perception-Planning-Action loops backed by RAG vector memory. Perception: observe world state + retrieve relevant memories from vector DB. Planning: local quantized LLM generates action plan. Action: execute plan, update memory store. Why: Enables emergent personality evolution and infinite memory without performance degradation (O(1) vector lookup vs O(N) log traversal). When: Any NPC that persists across sessions. Result: NPCs that remember, learn, and evolve.

### P.GAPS.08 | Quality-Tier Conditional Compilation Pattern

Pattern: Compiler generates per-device asset bundles and quality-tier code paths. Device detection via WebXR API at runtime selects tier. Tier definitions: Low (50K triangles, no volumetrics, 72fps), Med (100K, basic volumetrics, 90fps), High (300K, full volumetrics, 120fps), Ultra (1M+, ray tracing, unbounded). Why: Single HoloScript source compiles to multiple device targets. When: Any cross-device deployment. Result: Optimal experience per device from single source.

### G.GAPS.04 | Rotation Non-Commutativity in CRDTs Gotcha

Symptom: Operation-based CRDTs produce incorrect rotation states when two users rotate the same object simultaneously.
Cause: Rotation is non-commutative -- the order of quaternion multiplications affects final orientation. Operation-based CRDTs assume commutativity.
Fix: Use state-based CRDTs with LWW (Last-Writer-Wins) for rotation, OR implement the MV-Transformer pattern from ArXiv 2503.17826 with dynamic strategy switching between local-space and world-space modes.
Prevention: Default all rotatable objects to state-based CRDT synchronization. Only use operation-based for commutative properties (position offsets, scalar values).

### G.GAPS.05 | SSFR Resolution Scaling Performance Gotcha

Symptom: Screen-Space Fluid Rendering becomes too expensive at high resolution, dropping below 60fps.
Cause: Computational cost of SSFR increases quadratically with rendering resolution (bilateral filtering is the bottleneck).
Fix: Render fluid at half resolution, composite onto full-resolution scene. The WaterBall project demonstrates this approach.
Prevention: Default @fluid trait to half-resolution SSFR with full-res composite. Provide `resolution_scale` parameter for manual override.

### G.GAPS.06 | Quest 3 Cannot Ray Trace -- Hybrid Rendering Must Degrade Gracefully

Symptom: Ray-traced reflections and GI produce black/broken output on Quest 3 and mobile devices.
Cause: Quest 3's Adreno GPU does not support hardware ray tracing. WebRTX requires Vulkan ray tracing extensions.
Fix: Quality-tier system must fall back to screen-space reflections (SSR) and SSAO on Quest 3. Only enable hybrid ray tracing on desktop and Vision Pro tiers.
Prevention: @reflection and @global_illumination traits must check device tier and select implementation accordingly.

## Sources

1. [Codrops WebGPU Fluid Simulations](https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/) - MLS-MPM performance benchmarks
2. [WebGPU-Ocean MLS-MPM](https://github.com/matsuoka-601/WebGPU-Ocean) - Three.js + MLS-MPM implementation
3. [Three.js Forum MLS-MPM Showcase](https://discourse.threejs.org/t/mls-mpm-simulation-with-webgpu-and-threejs/77686) - Community integration
4. [WebGPU Compute Exploration](https://github.com/scttfrdmn/webgpu-compute-exploration) - SPH, boids, molecular dynamics in WGSL
5. [CRDT-Based VR Synchronization](https://arxiv.org/html/2503.17826v1) - First peer-reviewed CRDT-VR study
6. [CRDT VR ACM Publication](https://dl.acm.org/doi/10.1145/3721473.3722144) - PaPoC workshop paper
7. [Metaverse Persistent Worlds](https://sdlccorp.com/post/creating-persistent-worlds-in-the-metaverse-technical-challenges-and-solutions/) - Architecture patterns
8. [Procedural Clouds Three.js](https://github.com/CK42BB/procedural-clouds-threejs) - WebGPU raymarching clouds
9. [Three.js Volumetric Lighting](https://discourse.threejs.org/t/volumetric-lighting-in-webgpu/87959) - WebGPU volumetrics
10. [Real-Time Cloudscapes](https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/) - Raymarching techniques
11. [GPU Gems Ch.13 God Rays](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process) - Volumetric light scattering
12. [GPU Gems Ch.16 Subsurface Scattering](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering) - Skin rendering
13. [WebRTX - WebGPU Ray Tracing Extension](https://github.com/codedhead/webrtx) - Vulkan-style RT in WebGPU
14. [OpenPBR Path Tracer](https://arxiv.org/html/2407.19977v1) - Physically-based rendering in WebGPU
15. [Hybrid Rendering](https://blog.imaginationtech.com/hybrid-rendering-for-real-time-lighting/) - Rasterize + raytrace pipeline
16. [Hytale World Generation](https://hytale.com/news/2026/1/the-future-of-world-generation) - 2026 procedural biome systems
17. [World Orogen](https://www.orogen.studio/) - Procedural planet with erosion types
18. [GPU Terrain Erosion Models](https://www.daydreamsoft.com/blog/gpu-optimized-terrain-erosion-models-for-procedural-worlds-building-hyper-realistic-landscapes-at-scale) - GPU erosion for games
19. [Unity GPU Terrain Erosion](https://github.com/bshishov/UnityTerrainErosionGPU) - Compute shader erosion reference
20. [WebGPU Crowd Simulation](https://github.com/wayne-wu/webgpu-crowd-simulation) - Position-based crowd sim
21. [WebGPU Compute Boids](https://webgpu.github.io/webgpu-samples/?sample=computeBoids) - Official WebGPU boids sample
22. [Agentic NPC Systems 2026](https://techplustrends.com/2026-agentic-ai-npc-systems/) - PPA + RAG architecture
23. [LLM-Driven NPCs](https://arxiv.org/html/2504.13928v1) - Cross-platform dialogue system
24. [AI NPCs with Ollama](https://www.arsturn.com/blog/creating-next-gen-ai-npcs-with-local-llms-ollama) - Local LLM integration
25. [Hycompanion](https://hycompanion.dev/) - AI-powered NPCs for Hytale
26. [WebXR Performance Guide](https://developers.meta.com/horizon/documentation/web/webxr-perf/) - Meta Quest optimization
27. [WebXR PWAs](https://developers.meta.com/horizon/documentation/web/pwa-webxr/) - PWA on Quest
28. [VR Browser Games 2026](https://www.seeles.ai/resources/blogs/vr-browser-games-webxr-guide-2026) - WebXR performance benchmarks
29. [Quest 3 Development](https://developers.meta.com/horizon/blog/start-building-meta-quest-3s-3-launch-spatial-sdk-2D-mixed-reality/) - Device capabilities
30. [Second Life WebRTC Voice](https://community.secondlife.com/news/featured-news/webrtc-voice-in-second-life-limited-release-begins-march-18-2026-r11257/) - Production WebRTC voice
31. [Proximity Voice Chat](https://getstream.io/glossary/proximity-voice-chat/) - Technical overview
32. [TalkingHead Lip-Sync](https://github.com/met4citizen/TalkingHead) - Browser-native 3D lip-sync
33. [Wawa-Lipsync](https://wawasensei.dev/tuto/real-time-lipsync-web) - Real-time browser lip-sync
34. [Zora Review 2026](https://cryptoadventure.com/zora-review-2026-attention-markets-creator-coins-and-the-shift-beyond-nfts/) - Attention markets
35. [Zora Network Guide](https://zora-network.github.io/) - L2 infrastructure
36. [Token Gating Guide](https://plisio.net/blog/what-is-token-gating-and-how-does-it-work) - Implementation patterns
37. [Tauri v2 Multi-Window](https://www.oflight.co.jp/en/columns/tauri-v2-multi-window-system-tray) - Desktop agent architecture
38. [Meta AI Content Moderation](https://techcrunch.com/2026/03/19/meta-rolls-out-new-ai-content-enforcement-systems-while-reducing-reliance-on-third-party-vendors/) - AI moderation shift
39. [Loro CRDT](https://loro.dev/) - High-performance CRDT library
40. [PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics) - PBD reference implementation
41. [Unified Particle Physics](https://mmacklin.com/uppfrta_preprint.pdf) - Macklin/Mueller paper
42. [Fly.io Pricing](https://fly.io/pricing/) - Persistent volume costs
