# HoloScript Examples Index

Complete catalog of all HoloScript examples organized by category, platform, and feature.

> **📄 New to HoloScript file types?** See [File Types Guide](../docs/FILE_TYPES.md) to understand `.holo`, `.hs`, and `.hsplus` files.

## Quick Reference

| #   | Example                                                                 | Category    | Difficulty   | File Type                   | Platforms                   | Key Features                           |
| --- | ----------------------------------------------------------------------- | ----------- | ------------ | --------------------------- | --------------------------- | -------------------------------------- |
| 0   | [**Layered Architecture Demo**](integration/layered-architecture-demo/) | Tutorial    | Beginner     | `.holo` + `.hs` + `.hsplus` | **All platforms**           | **Shows file type integration**        |
| 1   | [VR Training Simulation](general/vr-training-simulation/)               | General     | Beginner     | `.holo`                     | Unity, Unreal, Godot, WebXR | Hazard detection, progress tracking    |
| 2   | [AR Furniture Preview](general/ar-furniture-preview/)                   | General     | Beginner     | `.holo`                     | ARKit, ARCore, WebXR        | Plane detection, gestures, materials   |
| 3   | [Virtual Art Gallery](general/virtual-art-gallery/)                     | General     | Intermediate | `.holo`                     | Unity, Unreal, Babylon.js   | Audio guides, teleportation, minimap   |
| 4   | [VR Game Demo](general/vr-game-demo/)                                   | General     | Intermediate | `.holo`                     | Unity, Unreal, Godot        | Physics, AI, state machine, scoring    |
| 5   | [Robotics Simulation](specialized/robotics/)                            | Specialized | Advanced     | `.hsplus`                   | URDF, SDF, Gazebo, ROS2     | IK, path planning, sensors             |
| 6   | [IoT Digital Twin](specialized/iot/)                                    | Specialized | Advanced     | `.holo`                     | DTDL, Azure Digital Twins   | Telemetry, predictive maintenance      |
| 7   | [Multiplayer VR](specialized/multiplayer/)                              | Specialized | Advanced     | `.holo`                     | Photon, Mirror, WebRTC      | Voice chat, networking, shared objects |
| 8   | [Unity Quest](specialized/unity-quest/)                                 | Specialized | Advanced     | `.holo`                     | Unity (Quest 2/3, PCVR)     | Mobile optimization, XR Toolkit        |
| 9   | [VRChat World](specialized/vrchat/)                                     | Specialized | Advanced     | `.holo`                     | VRChat SDK3, Udon#          | Mirrors, video, portals, networking    |
| 10  | [**Three-Format Showcase**](three-format-showcase/)                     | Tutorial    | Beginner     | `.holo` + `.hs` + `.hsplus` | R3F, Unity, Godot, OpenXR   | **Same scene in all three formats**    |
| 11  | [Music Starter](domain-starters/music/)                                 | Domain      | Intermediate | `.holo`                     | R3F, Unity, Godot           | Spatial audio, MIDI, visualizer        |
| 12  | [Navigation Starter](domain-starters/navigation/)                       | Domain      | Intermediate | `.holo`                     | iOS, Android, OpenXR        | Waypoints, compass, POI, pathfinding   |
| 13  | [Web3 Starter](domain-starters/web3/)                                   | Domain      | Intermediate | `.holo`                     | R3F, Unity, OpenXR          | NFT gallery, wallet, x402 payments     |
| 14  | [DataViz Starter](domain-starters/dataviz/)                             | Domain      | Intermediate | `.holo`                     | R3F, Unity, OpenXR          | Bar charts, scatter plots, heatmaps    |
| 15  | [Education Starter](domain-starters/education/)                         | Domain      | Intermediate | `.holo`                     | R3F, Unity, OpenXR          | Quizzes, lessons, progress, LMS        |
| 16  | [Architecture Starter](domain-starters/architecture/)                   | Domain      | Intermediate | `.holo`                     | Unity, OpenXR, R3F          | BIM, floor plans, sun path, materials  |
| 17  | [Input Starter](domain-starters/input/)                                 | Domain      | Intermediate | `.holo`                     | OpenXR, Unity, R3F          | Hand/eye/voice tracking, haptics       |
| 18  | [Rendering Starter](domain-starters/rendering/)                         | Domain      | Intermediate | `.holo`                     | R3F, Unity, Godot           | PBR gallery, shaders, post-processing  |
| 19  | [Procedural Starter](domain-starters/procedural/)                       | Domain      | Intermediate | `.holo`                     | R3F, Unity, Godot           | Terrain, L-systems, noise, vegetation  |
| 20  | [IoT Starter (Smart Home)](domain-starters/iot/)                        | Domain      | Intermediate | `.holo`                     | R3F, Unity, OpenXR          | Thermostat, lights, sensors, MQTT      |
| 21  | [Smart Building](cross-domain/smart-building.holo)                      | Cross-Domain| Advanced     | `.holo`                     | R3F, Unity, OpenXR          | IoT + Architecture + DataViz           |
| 22  | [Concert Venue](cross-domain/concert-venue.holo)                        | Cross-Domain| Advanced     | `.holo`                     | R3F, Unity, Godot           | Music + Input + Rendering + Procedural |
| 23  | [Immersive Classroom](cross-domain/immersive-classroom.holo)            | Cross-Domain| Advanced     | `.holo`                     | R3F, Unity, OpenXR          | Education + DataViz + Nav + Web3       |

**Note**: Most general examples use `.holo` (composition layer). Robotics examples use `.hsplus` (advanced features). The integration demo and three-format showcase show all three file types working together. Domain starters are minimal templates for specific verticals. Cross-domain examples combine multiple domain handlers.

## v5.0 Features — Three-Format Coverage

v5.0 features are documented across all three formats to demonstrate the right tool for each paradigm.

### Autonomous Ecosystems

| Feature | .holo (Composition) | .hsplus (Behavior) | .hs (Process) |
|---------|---------------------|-------------------|---------------|
| **Agent Portal** | [01-agent-portal-messaging.holo](autonomous-ecosystems/01-agent-portal-messaging.holo) | [agent-portal-federation.hsplus](autonomous-ecosystems/agent-portal-federation.hsplus) | [agent-migration-pipeline.hs](autonomous-ecosystems/agent-migration-pipeline.hs) |
| **Economy** | [02-economy-primitives.holo](autonomous-ecosystems/02-economy-primitives.holo) | [economy-marketplace.hsplus](autonomous-ecosystems/economy-marketplace.hsplus) | [economy-settlement.hs](autonomous-ecosystems/economy-settlement.hs) |
| **Feedback Loop** | [03-feedback-loop-optimization.holo](autonomous-ecosystems/03-feedback-loop-optimization.holo) | [feedback-driven-npc.hsplus](autonomous-ecosystems/feedback-driven-npc.hsplus) | [feedback-optimization-cycle.hs](autonomous-ecosystems/feedback-optimization-cycle.hs) |
| **Cultural Traits** | [04-cultural-ecosystem.holo](autonomous-ecosystems/04-cultural-ecosystem.holo) | [cultural-evolution.hsplus](autonomous-ecosystems/cultural-evolution.hsplus) | [cultural-norm-enforcement.hs](autonomous-ecosystems/cultural-norm-enforcement.hs) |

### Enterprise

| Feature | .holo (Composition) | .hsplus (Behavior) | .hs (Process) |
|---------|---------------------|-------------------|---------------|
| **Tenant Isolation** | [01-tenant-isolation.holo](enterprise/01-tenant-isolation.holo) | [enterprise-lifecycle.hsplus](enterprise/enterprise-lifecycle.hsplus) | [tenant-provisioning.hs](enterprise/tenant-provisioning.hs) |
| **RBAC Permissions** | [02-rbac-permissions.holo](enterprise/02-rbac-permissions.holo) | [enterprise-lifecycle.hsplus](enterprise/enterprise-lifecycle.hsplus) | [tenant-provisioning.hs](enterprise/tenant-provisioning.hs) |
| **SSO Integration** | [03-sso-integration.holo](enterprise/03-sso-integration.holo) | — | — |
| **Quota Enforcement** | [04-quota-enforcement.holo](enterprise/04-quota-enforcement.holo) | — | — |
| **Audit Logging** | [05-audit-logging.holo](enterprise/05-audit-logging.holo) | [enterprise-lifecycle.hsplus](enterprise/enterprise-lifecycle.hsplus) | — |
| **Analytics Dashboard** | [06-analytics-dashboard.holo](enterprise/06-analytics-dashboard.holo) | — | — |
| **A/B Testing** | [07-ab-testing.holo](enterprise/07-ab-testing.holo) | — | — |

### Traits & Physics

| Feature | .holo (Composition) | .hsplus (Behavior) | .hs (Process) |
|---------|---------------------|-------------------|---------------|
| **@throwable/@breakable/@stackable** | [throwable-breakable-stackable.holo](traits/throwable-breakable-stackable.holo) | [physics-object-lifecycle.hsplus](traits/physics-object-lifecycle.hsplus) | — |
| **@state_machine** | Multiple `.holo` files | [game-state-machine.hsplus](game-state-machine.hsplus) | — |

### Cryptography

| Feature | .holo (Composition) | .hsplus (Behavior) | .hs (Process) |
|---------|---------------------|-------------------|---------------|
| **Post-Quantum Crypto** | [01-hybrid-crypto-signing.holo](cryptography/01-hybrid-crypto-signing.holo) | [secure-agent-handshake.hsplus](cryptography/secure-agent-handshake.hsplus) | [secure-channel-setup.hs](cryptography/secure-channel-setup.hs) |
| **CBAC Permissions** | [02-cbac-permissions.holo](cryptography/02-cbac-permissions.holo) | — | — |
| **Agent Token Auth** | [03-agent-token-auth.holo](cryptography/03-agent-token-auth.holo) | — | — |

### Agent Process Examples (.hs)

| Example | Key Features |
|---------|-------------|
| [Guard Patrol](agents/guard-patrol.hs) | Waypoint patrol loop, investigate/alarm procedures, `connect`/`execute` |
| [IoT Sensor Pipeline](agents/iot-sensor-pipeline.hs) | 4-stage data pipeline, `connect` wiring, `execute every Nms` |

### Format Selection Guide

| Use Case | Best Format | Why |
|----------|------------|-----|
| Scene descriptions, world building | `.holo` | Declarative — describes WHAT things are |
| State machines, reactive behavior, modules | `.hsplus` | Behavioral — describes HOW things react |
| Sequential pipelines, data flow, processes | `.hs` | Procedural — describes WHAT to do step by step |
| Agent patrol routes, sensor pipelines | `.hs` | Sequential process with `connect`/`execute` |
| Game logic, NPC behavior, UI reactivity | `.hsplus` | Event-driven with `@state_machine` and `@on_event` |
| Multi-tenant setup, physics playgrounds | `.holo` | Configuration-heavy composition with traits |

## By Platform

### Unity

| Example                | Quest Support    | PCVR Support | Features                                |
| ---------------------- | ---------------- | ------------ | --------------------------------------- |
| VR Training Simulation | ✅               | ✅           | XR Interaction Toolkit, teleportation   |
| AR Furniture Preview   | ✅ (ARCore)      | N/A          | AR Foundation, plane detection          |
| Virtual Art Gallery    | ✅               | ✅           | Audio, teleportation, minimap           |
| VR Game Demo           | ✅               | ✅           | Physics, enemy AI, weapons              |
| Unity Quest            | ✅ **Optimized** | ✅           | ASTC textures, LODs, foveated rendering |
| VRChat World           | ✅               | ✅           | VRChat SDK3, Udon#, mirrors, video      |
| Multiplayer VR         | ✅               | ✅           | Photon PUN2, voice chat, networking     |

### Unreal Engine

| Example                | VR Support | Features                  |
| ---------------------- | ---------- | ------------------------- |
| VR Training Simulation | ✅         | OpenXR, high fidelity     |
| Virtual Art Gallery    | ✅         | Nanite, Lumen (UE5)       |
| VR Game Demo           | ✅         | Blueprint + C++, physics  |
| Multiplayer VR         | ✅         | Native replication, voice |

### Godot

| Example                | VR Support | Features                 |
| ---------------------- | ---------- | ------------------------ |
| VR Training Simulation | ✅         | GDScript, OpenXR         |
| Virtual Art Gallery    | ✅         | Lightweight, open source |
| VR Game Demo           | ✅         | Physics engine, signals  |

### WebXR (Browser)

| Example              | Desktop Support | Mobile AR | Features                         |
| -------------------- | --------------- | --------- | -------------------------------- |
| AR Furniture Preview | ✅              | ✅        | Hit test API, plane detection    |
| Virtual Art Gallery  | ✅              | ✅        | Three.js/Babylon.js, progressive |
| Multiplayer VR       | ✅              | ✅        | WebRTC, peer-to-peer             |

### Robotics

| Example             | ROS2 | Gazebo | URDF/SDF |
| ------------------- | ---- | ------ | -------- |
| Robotics Simulation | ✅   | ✅     | ✅       |

### IoT

| Example          | Azure DT | AWS IoT             | DTDL |
| ---------------- | -------- | ------------------- | ---- |
| IoT Digital Twin | ✅       | ✅ (via conversion) | ✅   |

### Social VR

| Example        | VRChat | Photon | WebRTC |
| -------------- | ------ | ------ | ------ |
| Multiplayer VR | ❌     | ✅     | ✅     |
| VRChat World   | ✅     | ❌     | ❌     |

## By Feature

### Physics & Interactions

| Example        | Grabbable Objects       | Physics Engine       | Collision Detection |
| -------------- | ----------------------- | -------------------- | ------------------- |
| VR Game Demo   | ✅ Weapons              | ✅ Bullets, grenades | ✅ Hit detection    |
| Unity Quest    | ✅ XR Grab Interactable | ✅ Rigidbody         | ✅ Triggers         |
| Multiplayer VR | ✅ Shared objects       | ✅ Synced physics    | ✅ Networked        |
| VRChat World   | ✅ VRC_Pickup           | ✅ Synced            | ✅ Triggers         |

### Networking & Multiplayer

| Example        | Max Players | Voice Chat | Sync Type | Network Backend             |
| -------------- | ----------- | ---------- | --------- | --------------------------- |
| Multiplayer VR | 16          | ✅ Spatial | Photon    | Photon PUN2, Mirror, WebRTC |
| VRChat World   | 32          | ✅ Spatial | Udon      | VRChat SDK3                 |

### AI & Automation

| Example             | AI Type    | Path Finding | Decision Making    |
| ------------------- | ---------- | ------------ | ------------------ |
| VR Game Demo        | Enemy AI   | ✅ NavMesh   | ✅ State machine   |
| Robotics Simulation | IK Solver  | ✅ RRT/PRM   | ✅ Motion planning |
| IoT Digital Twin    | Predictive | N/A          | ✅ Rule engine     |

### Audio

| Example             | 3D Audio      | Music           | Voice           |
| ------------------- | ------------- | --------------- | --------------- |
| Virtual Art Gallery | ✅ Positional | ✅ Background   | ✅ Audio guides |
| Multiplayer VR      | ✅ Spatial    | ✅ Optional     | ✅ Voice chat   |
| VRChat World        | ✅ Spatial    | ✅ Video player | ✅ Voice chat   |

### UI/UX

| Example                | World Space UI     | Screen Space UI | Locomotion             |
| ---------------------- | ------------------ | --------------- | ---------------------- |
| VR Training Simulation | ✅ Progress panels | ✅ HUD          | Teleportation          |
| AR Furniture Preview   | ✅ Product info    | ✅ Controls     | Plane placement        |
| Virtual Art Gallery    | ✅ Artwork details | ✅ Minimap      | Teleportation + smooth |
| Unity Quest            | ✅ Performance HUD | ✅ Canvas       | Continuous + teleport  |

### Platform Optimization

| Example              | Mobile Shaders    | LODs           | Texture Compression | Occlusion Culling |
| -------------------- | ----------------- | -------------- | ------------------- | ----------------- |
| Unity Quest          | ✅ Mobile/Diffuse | ✅ 3 levels    | ✅ ASTC 6x6         | ✅                |
| VRChat World         | ✅ VRChat shaders | ✅ Recommended | ✅ ASTC             | ✅                |
| AR Furniture Preview | ✅ Mobile         | ✅ 2 levels    | ✅ ASTC             | ❌                |

## By Industry

### Corporate/Enterprise

| Example                | Use Case                                   | Target Platform    | Deployment    |
| ---------------------- | ------------------------------------------ | ------------------ | ------------- |
| VR Training Simulation | Safety training, onboarding                | Quest, PCVR        | Internal/SaaS |
| Multiplayer VR         | Remote collaboration, meetings             | Quest, PCVR, WebXR | Cloud/On-prem |
| IoT Digital Twin       | Factory monitoring, predictive maintenance | Azure, AWS         | Cloud         |

### E-Commerce/Retail

| Example              | Use Case                      | Target Platform   | Deployment     |
| -------------------- | ----------------------------- | ----------------- | -------------- |
| AR Furniture Preview | Try before buy, visualization | iOS, Android, Web | Public web     |
| Virtual Art Gallery  | Virtual showroom              | WebXR, Quest      | Public web/app |

### Education/Culture

| Example                | Use Case                  | Target Platform | Deployment |
| ---------------------- | ------------------------- | --------------- | ---------- |
| Virtual Art Gallery    | Museum tours, exhibitions | WebXR, Quest    | Public web |
| VR Training Simulation | Educational simulations   | Quest, PCVR     | Schools    |

### Entertainment/Gaming

| Example      | Use Case  | Target Platform      | Deployment      |
| ------------ | --------- | -------------------- | --------------- |
| VR Game Demo | VR gaming | Unity, Unreal, Godot | Steam, App Lab  |
| VRChat World | Social VR | VRChat               | VRChat platform |

### Industrial/Manufacturing

| Example             | Use Case                      | Target Platform     | Deployment |
| ------------------- | ----------------------------- | ------------------- | ---------- |
| Robotics Simulation | Robot programming, simulation | ROS2, Gazebo        | On-prem    |
| IoT Digital Twin    | Smart factory, monitoring     | Azure Digital Twins | Cloud      |

## By Compilation Target

### Unity Targets

- **C# Scripts**: VR Training, AR Furniture, Virtual Gallery, VR Game, Unity Quest, VRChat, Multiplayer
- **Prefabs**: All Unity examples
- **XR Interaction Toolkit**: Unity Quest, VR Training, Multiplayer
- **VRChat SDK3**: VRChat World
- **Photon PUN2**: Multiplayer VR

### Unreal Targets

- **C++ Header/Source**: VR Training, Virtual Gallery, VR Game, Multiplayer
- **Blueprints**: All Unreal examples
- **OpenXR**: All VR examples
- **Native Replication**: Multiplayer VR

### Web Targets

- **Three.js**: AR Furniture, Virtual Gallery (lightweight option)
- **Babylon.js**: Virtual Gallery (high quality option)
- **WebRTC**: Multiplayer VR (browser-based)

### Specialized Targets

- **URDF**: Robotics Simulation (ROS1/ROS2)
- **SDF**: Robotics Simulation (Gazebo)
- **DTDL**: IoT Digital Twin (Azure/AWS)
- **GDScript**: VR Training, Virtual Gallery, VR Game (Godot)

## By Difficulty

### Beginner (Learn HoloScript Basics)

**Recommended order:**

1. **VR Training Simulation** (609 lines)
   - Learn: Objects, interactions, events, UI
   - Time: 1-2 hours to understand
   - Platforms: Unity, Unreal, Godot, WebXR

2. **AR Furniture Preview** (873 lines)
   - Learn: AR concepts, plane detection, gestures
   - Time: 2-3 hours to understand
   - Platforms: ARKit, ARCore, WebXR

### Intermediate (Build Complete Experiences)

**Recommended order:**

3. **Virtual Art Gallery** (888 lines)
   - Learn: Locomotion, audio, UI systems
   - Time: 3-4 hours to understand
   - Platforms: Unity, Unreal, Babylon.js, WebXR

4. **VR Game Demo** (808 lines)
   - Learn: Game mechanics, physics, AI, state machines
   - Time: 4-5 hours to understand
   - Platforms: Unity, Unreal, Godot

### Advanced (Production & Specialized)

**Recommended order:**

5. **Unity Quest** (800+ lines)
   - Learn: Platform optimization, mobile VR, XR Toolkit
   - Time: 5-6 hours to understand
   - Platforms: Unity (Quest 2/3, PCVR)

6. **Multiplayer VR** (600+ lines)
   - Learn: Networking, voice chat, synchronization
   - Time: 6-8 hours to understand
   - Platforms: Unity (Photon/Mirror), Unreal, WebRTC

7. **Robotics Simulation** (789 lines)
   - Learn: URDF/SDF, IK, path planning, sensors
   - Time: 6-8 hours to understand
   - Platforms: URDF, SDF, Gazebo, ROS2

8. **IoT Digital Twin** (700+ lines)
   - Learn: DTDL, telemetry, Azure integration
   - Time: 5-7 hours to understand
   - Platforms: DTDL, Azure Digital Twins

9. **VRChat World** (900+ lines)
   - Learn: VRChat SDK, Udon#, social VR features
   - Time: 8-10 hours to understand
   - Platforms: VRChat SDK3, Udon#

## Search by Keyword

### Keywords: Teleportation

- VR Training Simulation
- Virtual Art Gallery
- Unity Quest

### Keywords: Voice Chat

- Multiplayer VR
- VRChat World

### Keywords: Physics

- VR Game Demo
- Unity Quest
- Multiplayer VR
- VRChat World

### Keywords: Mobile

- AR Furniture Preview
- Unity Quest (Quest 2/3)

### Keywords: Web/Browser

- AR Furniture Preview (WebXR)
- Virtual Art Gallery (WebXR)
- Multiplayer VR (WebRTC)

### Keywords: AI

- VR Game Demo (enemy AI)
- Robotics Simulation (IK solver)
- IoT Digital Twin (predictive rules)

### Keywords: Networking

- Multiplayer VR
- VRChat World

### Keywords: Industrial

- Robotics Simulation
- IoT Digital Twin

### Keywords: Social

- Multiplayer VR
- VRChat World

## File Sizes & Performance

| Example                | .holo File Size | Compiled Unity Size | Compiled Unreal Size | Build Time (Unity)    |
| ---------------------- | --------------- | ------------------- | -------------------- | --------------------- |
| VR Training Simulation | 18 KB           | ~500 KB             | ~2 MB                | ~30s                  |
| AR Furniture Preview   | 25 KB           | ~600 KB             | N/A                  | ~35s                  |
| Virtual Art Gallery    | 26 KB           | ~700 KB             | ~2.5 MB              | ~40s                  |
| VR Game Demo           | 24 KB           | ~800 KB             | ~3 MB                | ~45s                  |
| Robotics Simulation    | 23 KB           | N/A                 | N/A                  | N/A (URDF/SDF)        |
| IoT Digital Twin       | 21 KB           | N/A                 | N/A                  | N/A (DTDL)            |
| Multiplayer VR         | 18 KB           | ~1.2 MB             | ~3.5 MB              | ~60s                  |
| Unity Quest            | 25 KB           | ~900 KB             | N/A                  | ~50s                  |
| VRChat World           | 28 KB           | ~1.5 MB             | N/A                  | ~70s (SDK validation) |

## Getting Started

**New to HoloScript?**

1. Read [Getting Started Guide](../docs/GETTING_STARTED.md)
2. Try [VR Training Simulation](general/vr-training-simulation/) first
3. Compile to your preferred platform
4. Explore more advanced examples

**Looking for specific features?**

- Use the search keywords above
- Filter by platform or industry
- Check feature comparison tables

---

**Updated**: 2026-03-09 | **Total Examples**: 38+ | **Total Platforms**: 18+ | **v5.0 Coverage**: 3-format parity
