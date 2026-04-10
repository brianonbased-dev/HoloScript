# Build Your Own Platform with HoloScript

**The Spatial OS for the Agentic Era** — Build VR social platforms, autonomous agent habitats, robotics simulations, and more.

---

## Welcome

HoloScript is an **AI-Native Spatial Operating System**. We built [Hololand](https://github.com/brianonbased-dev/Hololand) (VR social platform) to prove it works—now it's your turn.

This guide shows you how to build **production spatial computing platforms** and **autonomous agent habitats** using the same public APIs as Hololand.

---

## What You Can Build

| Platform Type          | Examples                                  | Time to MVP | Difficulty   |
| ---------------------- | ----------------------------------------- | ----------- | ------------ |
| **VR Social**          | Hololand alternative, VRChat competitor   | 3-6 months  | Advanced     |
| **Corporate Training** | VR safety training, onboarding            | 1-3 months  | Intermediate |
| **Robotics Platform**  | ROS2/Gazebo simulation                    | 2-4 months  | Advanced     |
| **AR E-Commerce**      | "Try before you buy" furniture app        | 1-2 months  | Beginner     |
| **Digital Twin**       | IoT platform with Azure DTDL              | 2-4 months  | Intermediate |
| **VR Game**            | Multi-platform game (Unity/Unreal export) | 3-6 months  | Intermediate |

**Proof**: Hololand (43+ packages, multiplayer, voice chat) built entirely on HoloScript public APIs.

---

## Table of Contents

1. [Quick Start (30 Minutes)](#quick-start-30-minutes)
2. [Platform Architecture](#platform-architecture)
3. [Core Systems](#core-systems)
4. [Deployment](#deployment)
5. [Scaling & Production](#scaling--production)
6. [Case Studies](#case-studies)
7. [Get Help](#get-help)

---

## Quick Start (30 Minutes)

### Step 1: Install HoloScript

```bash
npm install -g @holoscript/cli
# or
brew install holoscript
```

### Step 2: Create Your First World

**`my-world.holo`**:

```holo
composition "MyWorld" {
  scene {
    environment {
      skybox: "procedural_sky"
      lighting: "sunset_warm"
      @spatial_audio
    }

    object "SpawnPoint" {
      @spawn_point
      position: [0, 1, 0]
    }

    object "Ground" {
      @physics(type: "static")
      geometry: "plane"
      scale: [100, 1, 100]
      material: {
        color: "#2a5a2a"
        roughness: 0.8
      }
    }

    object "InteractiveCube" {
      @grabbable
      @physics
      @networked
      geometry: "box"
      position: [0, 1.5, -3]
      material: {
        color: "#ff6b6b"
        metalness: 0.5
      }
    }
  }
}
```

### Step 3: Preview Locally

```bash
holoscript preview my-world.holo
```

Opens browser at `http://localhost:3000` with ThreeJSRenderer (WebXR).

### Step 4: Add Multiplayer

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { getHololandClient, getStreamProtocol } from '@holoscript/core';

// Parse world
const composition = parseHoloScript(myWorldSource);

// Connect to multiplayer server
const client = getHololandClient();
await client.connectToHololand({
  serverUrl: 'wss://my-server.example.com',
  authToken: 'your-auth-token',
});

// Register world
await client.registerWorld(composition);

// Join world
await client.joinWorld(composition.metadata.id);

// Sync player position
const protocol = getStreamProtocol();
protocol.sendEntityUpdate({
  entityId: 'player-1',
  position: { x: 0, y: 1, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});
```

### Step 5: Compile to Unity/Unreal

```bash
# Compile to Unity C#
holoscript compile my-world.holo --target=unity --output=./unity-export

# Compile to Unreal C++
holoscript compile my-world.holo --target=unreal --output=./unreal-export

# Compile to WebXR (React Three Fiber)
holoscript compile my-world.holo --target=r3f --output=./web-export
```

**Result**: You now have a multi-platform VR world!

---

## Platform Architecture

### Recommended Stack

```text
┌───────────────────────────────────────────────────┐
│         YOUR PLATFORM (Application Layer)         │
│  ├─ Branding, UI/UX, Features                    │
│  ├─ Business Logic (users, payments, etc.)       │
│  └─ Custom Systems (specific to your platform)   │
├───────────────────────────────────────────────────┤
│      PLATFORM SERVICES (Infrastructure)           │
│  ├─ Multiplayer (CRDT, WebRTC, voice chat)       │
│  ├─ Physics (Rapier, Ammo.js)                    │
│  ├─ Rendering (Three.js, Babylon, Unity, Unreal) │
│  ├─ Storage (worlds, assets, user data)          │
│  └─ Auth (users, permissions, moderation)        │
├───────────────────────────────────────────────────┤
│    HOLOSCRIPT (AI-Native Spatial OS)              │
│  ├─ Cognitive (uAAL), Perceptual (SNN), Economic (x402)│
│  ├─ Parser, Compiler, Runtime                    │
│  ├─ 2,000+ Traits (@grabbable, @physics, etc.)   │
│  └─ Multi-target compilation (30+ platforms)     │
└───────────────────────────────────────────────────┘
```

**Key Point**: HoloScript handles spatial computing primitives. You build platform-specific features on top.

---

## Core Systems

### 1. World Management

**What**: Create, load, save, and switch between worlds.

**HoloScript Integration**:

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { getHololandClient } from '@holoscript/core';

class WorldManager {
  async createWorld(holoSource: string, metadata: WorldMetadata) {
    const composition = parseHoloScript(holoSource);
    const client = getHololandClient();

    const worldId = await client.registerWorld({
      ...composition,
      metadata: {
        ...composition.metadata,
        ...metadata,
      },
    });

    return worldId;
  }

  async loadWorld(worldId: string) {
    const client = getHololandClient();
    const world = await client.joinWorld(worldId);

    // Render with HoloScript runtime
    const renderer = new ThreeJSRenderer({ canvas, shadows: true });
    renderer.initialize(world);
    renderer.start();
  }
}
```

---

### 2. Multiplayer Networking

**What**: Real-time state synchronization, voice chat, player movement.

**HoloScript Integration**:

```typescript
import { getStreamProtocol } from '@holoscript/core';

class MultiplayerSystem {
  private protocol = getStreamProtocol();

  constructor() {
    this.protocol.on('entity_update', (data) => {
      this.updateRemotePlayer(data);
    });
  }

  updateLocalPlayer(playerId: string, position: Vector3, rotation: Euler) {
    // Send to server (public HoloScript API)
    this.protocol.sendEntityUpdate({
      entityId: playerId,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
    });
  }

  updateRemotePlayer(data: EntityUpdate) {
    const player = this.players.get(data.entityId);
    player.position.set(data.position.x, data.position.y, data.position.z);
    player.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
  }
}
```

---

### 3. Physics Engine

**What**: Gravity, collisions, rigid bodies, constraints.

**HoloScript Integration**:

```holo
// HoloScript handles physics traits
object "PhysicsObject" {
  @physics(
    type: "dynamic",
    mass: 10.0,
    restitution: 0.5
  )
  @collision_detection
  geometry: "box"
}
```

**Platform-Specific**:

```typescript
// Your platform can extend with custom physics
import { PhysicsWorld } from '@holoscript/runtime';

class CustomPhysicsSystem extends PhysicsWorld {
  // Add custom constraints, forces, etc.
  addWindForce(direction: Vector3, strength: number) {
    // Custom implementation
  }
}
```

---

### 4. User Authentication & Authorization

**What**: User accounts, permissions, moderation.

**Implementation** (NOT part of HoloScript—your responsibility):

```typescript
class AuthSystem {
  async login(email: string, password: string) {
    // Your auth backend (Firebase, Auth0, custom)
    const user = await this.backend.authenticate(email, password);

    // Connect to HoloScript with auth token
    const client = getHololandClient();
    await client.connectToHololand({
      serverUrl: 'wss://your-server.com',
      authToken: user.token,
    });

    return user;
  }
}
```

---

### 5. Asset Management

**What**: Upload, store, and serve 3D models, textures, audio.

**HoloScript Integration**:

```typescript
import { AssetManifest, SmartAssetLoader } from '@holoscript/core';

class AssetSystem {
  private manifest = new AssetManifest('platform-assets');
  private loader = new SmartAssetLoader({ maxConcurrent: 4 });

  async uploadAsset(file: File, metadata: AssetMetadata) {
    // Upload to your CDN (Cloudflare R2, AWS S3, etc.)
    const url = await this.cdn.upload(file);

    // Register with HoloScript manifest (public API)
    this.manifest.addAsset({
      id: metadata.id,
      path: url,
      name: metadata.name,
      type: inferAssetType(file.name),
    });
  }

  async loadAssets(assetIds: string[]) {
    return this.loader.loadBatch(assetIds);
  }
}
```

---

### 6. Voice Chat (Optional)

**Options**:

- **Agora.io**: Enterprise-grade, paid
- **Livekit**: Open-source, self-hosted
- **Daily.co**: Simple API, paid

**HoloScript Integration**:

```holo
object "Player" {
  @voice_chat(
    provider: "agora",
    spatialAudio: true
  )
  @spatial_audio
}
```

---

### 7. Analytics & Monitoring

**What**: Track users, performance, errors.

**Tools**:

- **Sentry**: Error tracking
- **PostHog**: Product analytics
- **Prometheus + Grafana**: Infrastructure monitoring

**HoloScript Integration**:

```typescript
import { RuntimeExecutor } from '@holoscript/runtime';

class AnalyticsSystem {
  trackPerformance(executor: RuntimeExecutor) {
    const stats = executor.getStatistics();

    this.posthog.capture('world_performance', {
      fps: stats.fps,
      drawCalls: stats.drawCalls,
      memory: stats.memoryMB,
    });
  }
}
```

---

## Deployment

### Option 1: HoloScript Runtime (WebXR)

**Fastest**: Deploy ThreeJSRenderer to Vercel/Netlify.

```bash
# Build web app
npm run build

# Deploy to Vercel
vercel deploy
```

**Pros**:

- Instant deployment
- No app store approval
- Cross-platform (Quest, desktop, mobile)

**Cons**:

- Limited to WebXR capabilities
- Lower performance than native

---

### Option 2: Compile to Unity → App Store

**Production-ready**: Export to Quest, iOS, Android, Steam.

```bash
# Compile to Unity
holoscript compile my-world.holo --target=unity --output=./unity-export

# Open in Unity
# Build → Android (Quest) or iOS

# Submit to Oculus Store / App Store
```

**Pros**:

- Native performance
- Full platform features (hand tracking, etc.)
- Monetization via app stores

**Cons**:

- App store review process
- Slower iteration

---

### Option 3: Compile to Unreal → PC VR

**High-fidelity**: Export to SteamVR, PSVR2.

```bash
# Compile to Unreal
holoscript compile my-world.holo --target=unreal --output=./unreal-export

# Open in Unreal Engine 5
# Build → Windows (SteamVR) or PlayStation 5 (PSVR2)
```

**Pros**:

- Best graphics quality
- Advanced rendering (Nanite, Lumen)

**Cons**:

- Larger binary size
- Requires powerful hardware

---

## Scaling & Production

### Infrastructure Needs

| Users   | WebSocket Servers       | Database              | CDN                       | Cost/Month |
| ------- | ----------------------- | --------------------- | ------------------------- | ---------- |
| 100     | 1 (DigitalOcean $20/mo) | PostgreSQL (managed)  | Cloudflare R2 (free tier) | ~$50       |
| 1,000   | 3 (load balanced)       | PostgreSQL (scaled)   | Cloudflare R2 ($15)       | ~$200      |
| 10,000  | 10 (auto-scaling)       | PostgreSQL (replicas) | Cloudflare R2 ($50)       | ~$1,000    |
| 100,000 | 50+ (Kubernetes)        | PostgreSQL (sharded)  | Cloudflare R2 ($200)      | ~$10,000   |

**Recommended Stack**:

- **Compute**: Fly.io, Railway, Render (easy scaling)
- **Database**: Supabase, Neon, PlanetScale (PostgreSQL)
- **CDN**: Cloudflare R2 (S3-compatible, cheaper)
- **Monitoring**: Sentry + PostHog + Grafana

---

## Case Studies

### Case Study 1: VR Training Platform (Corporate)

**Problem**: Company needed multi-platform VR safety training (Quest + desktop).

**Solution**:

- Authored training scenarios in HoloScript (`.holo` files)
- Compiled to Unity for Quest 2 deployment
- Compiled to WebXR for desktop preview
- Used HoloScript traits: `@grabbable`, `@physics`, `@trigger_zone`

**Results**:

- 80% faster development vs. hand-coding Unity
- Single codebase → Quest + desktop + mobile AR
- Deployed in 6 weeks (vs. 6 months traditional)

**Code Sample**:

```holo
composition "SafetyTraining" {
  scene {
    object "HazardZone" {
      @trigger_zone(
        event: "hazard_entered",
        action: "show_warning"
      )
      @highlight(color: "#ff0000", pulse: true)
    }

    object "FireExtinguisher" {
      @grabbable
      @usable(action: "extinguish_fire")
      @tutorial_hint(text: "Use to put out fires")
    }
  }
}
```

---

### Case Study 2: AR Furniture Preview (E-Commerce)

**Problem**: Furniture retailer wanted AR "try before you buy" on iOS + Android.

**Solution**:

- HoloScript → ARKit (iOS) + ARCore (Android)
- Same `.holo` file compiles to both platforms
- Asset management via HoloScript's AssetManifest

**Results**:

- Single codebase for iOS + Android
- 40% increase in conversion rate
- Deployed in 4 weeks

**Code Sample**:

```holo
composition "FurniturePreview" {
  object "Sofa" {
    @ar_placeable
    @scalable(min: 0.5, max: 2.0)
    @rotatable
    geometry: "sofa_modern.glb"
    material: {
      color: "#8b4513"
      pbr: true
    }
  }
}
```

---

### Case Study 3: Robotics Simulation (Academia)

**Problem**: University needed robot arm simulation for ROS2 course.

**Solution**:

- HoloScript → URDF export → Gazebo simulation
- Students authored robots in `.holo` (easier than XML)
- Validated in HoloScript runtime before deploying to Gazebo

**Results**:

- Students 3x more productive (vs. manual URDF)
- Validated designs faster (visual preview)
- Integrated with ROS2/Gazebo

**Code Sample**:

```holo
composition "RobotArm" {
  object "Joint1" {
    @joint_revolute
    @position_controlled
    @force_torque_sensor
    limits: {
      lower: -180,
      upper: 180
    }
  }
}
```

**Compilation**:

```bash
holoscript compile robot-arm.holo --target=urdf --output=robot.urdf
```

---

## Get Help

### Community

- **Discord**: [discord.gg/holoscript](https://discord.gg/holoscript) (ask questions, show your platform)
- **GitHub Discussions**: [github.com/brianonbased-dev/HoloScript/discussions](https://github.com/brianonbased-dev/HoloScript/discussions)
- **Stack Overflow**: Tag `holoscript`

### Documentation

- [HoloScript Docs](https://holoscript.net/docs)
- [Trait Reference](../TRAITS_REFERENCE.md) (2,000+ traits)
- [API Reference](https://holoscript.net/api)
- [Hololand Architecture](./HOLOLAND_REFERENCE_ARCHITECTURE.md) (how we built it)

### Support Tiers

| Tier               | Response Time | Channels          | Cost       |
| ------------------ | ------------- | ----------------- | ---------- |
| **Community**      | Best effort   | Discord, GitHub   | Free       |
| **Silver Sponsor** | 48 hours      | Direct Slack      | $5K/month  |
| **Gold Sponsor**   | 24 hours      | Dedicated support | $15K/month |

[Become a sponsor →](../FUNDING.md)

---

## Platform Grants

HoloScript Foundation offers **$10K-$50K grants** for novel platforms:

**Requirements**:

- Open-source (MIT license)
- Uses public HoloScript APIs only
- Production deployment within 6 months

**Apply**: [grants@holoscript.net](mailto:grants@holoscript.net)

---

## FAQ

### Do I need permission to build a competing platform?

**No.** HoloScript is MIT licensed. Build freely, even direct Hololand competitors.

### Will HoloScript break my platform with updates?

**No.** Semantic versioning guarantees:

- **Patch** (3.4.1): Bug fixes, no breaking changes
- **Minor** (3.5.0): New features, backward compatible
- **Major** (4.0.0): Breaking changes (rare, with migration guide)

### Can I mix HoloScript with native code (Unity C#, Unreal C++)?

**Yes!** HoloScript compiles to native code. You can:

- Import HoloScript-generated code into existing projects
- Mix `.holo` files with hand-written code
- Use HoloScript for prototyping, optimize critical paths manually

### How much does HoloScript cost?

**Free.** MIT licensed, no royalties, no runtime fees.

Optional: Sponsor the foundation to support development ([FUNDING.md](../FUNDING.md)).

### What if I get stuck?

**Community**: Discord, GitHub Discussions (free, best effort)
**Paid Support**: Sponsor at Silver+ tier for direct access

---

## Next Steps

1. **Try the Quick Start** (30 minutes above)
2. **Study Hololand's code** ([github.com/brianonbased-dev/Hololand](https://github.com/brianonbased-dev/Hololand))
3. **Join Discord** ([discord.gg/holoscript](https://discord.gg/holoscript))
4. **Build your platform** (start small, iterate)
5. **Share your progress** (we love success stories!)

---

## Ready to Build?

**The AI-Native Spatial OS** is ready. Now it's your turn.

Build the next Hololand. Build the next VRChat. Build something we can't imagine.

**Let's build spatial computing together.** 🚀

---

© 2026 HoloScript Foundation

_Built with HoloScript: [List your platform here](mailto:community@holoscript.net)_
